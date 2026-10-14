import test from "node:test";
import assert from "node:assert/strict";
import { PublicKey } from "@solana/web3.js";
import { tools } from "../tools/definitions.js";

const helpers = await import("../tools/close-position-helpers.js").catch(() => null);
const closeTool = tools.find((tool) => tool.function.name === "close_position");
const key = (byte) => new PublicKey(Buffer.alloc(32, byte));

function helper(name) {
  assert.equal(typeof helpers?.[name], "function", `expected ${name} helper to be implemented`);
  return helpers[name];
}

test("close_position exposes an explicit skip_claim option", () => {
  assert.equal(closeTool?.function.parameters.properties.skip_claim?.type, "boolean");
});

test("an explicit skip_claim request skips only the separate fee-claim step", () => {
  const shouldSkipFeeClaim = helper("shouldSkipFeeClaim");
  assert.equal(shouldSkipFeeClaim({ skipClaim: true, recentlyClaimed: false }), true);
  assert.equal(shouldSkipFeeClaim({ skipClaim: false, recentlyClaimed: true }), true);
  assert.equal(shouldSkipFeeClaim({ skipClaim: false, recentlyClaimed: false }), false);
});

test("position-account validation rejects a missing account", () => {
  const assertPositionAccountOwner = helper("assertPositionAccountOwner");
  assert.throws(
    () => assertPositionAccountOwner({ accountInfo: null, expectedProgramId: key(1) }),
    /not found.*refusing to close/i,
  );
});

test("position-account validation rejects an account owned by another program", () => {
  const assertPositionAccountOwner = helper("assertPositionAccountOwner");
  assert.throws(
    () => assertPositionAccountOwner({ accountInfo: { owner: key(2) }, expectedProgramId: key(1) }),
    /owner mismatch.*refusing to close/i,
  );
  assert.doesNotThrow(() => assertPositionAccountOwner({
    accountInfo: { owner: key(1) },
    expectedProgramId: key(1),
  }));
});


test("position-state validation accepts the requested pool and wallet", () => {
  const assertPositionMatchesPoolAndOwner = helper("assertPositionMatchesPoolAndOwner");
  assert.doesNotThrow(() => assertPositionMatchesPoolAndOwner({
    positionState: { lbPair: key(1), owner: key(2) },
    expectedPoolAddress: key(1),
    expectedOwner: key(2),
  }));
});



test("position-state validation rejects another pool or wallet", () => {
  const assertPositionMatchesPoolAndOwner = helper("assertPositionMatchesPoolAndOwner");
  assert.throws(
    () => assertPositionMatchesPoolAndOwner({
      positionState: { lbPair: key(2), owner: key(3) },
      expectedPoolAddress: key(1),
      expectedOwner: key(3),
    }),
    /different pool.*refusing to close/i,
  );
  assert.throws(
    () => assertPositionMatchesPoolAndOwner({
      positionState: { lbPair: key(1), owner: key(3) },
      expectedPoolAddress: key(1),
      expectedOwner: key(2),
    }),
    /different wallet.*refusing to close/i,
  );
});

test("an unreadable liquidity state is not treated as an empty position", () => {
  const hasPositionLiquidity = helper("hasPositionLiquidity");
  assert.throws(() => hasPositionLiquidity(null), /could not read.*refusing to close/i);
  assert.equal(hasPositionLiquidity({ positionData: { positionBinData: [] } }), false);
  assert.equal(hasPositionLiquidity({
    positionData: { positionBinData: [{ positionLiquidity: "1" }] },
  }), true);
});

test("a blockhash-not-found during transaction construction gets one fresh rebuild", async () => {
  const buildWithBlockhashRetry = helper("buildWithBlockhashRetry");
  let builds = 0;
  let refreshes = 0;
  const result = await buildWithBlockhashRetry(
    async () => {
      builds += 1;
      if (builds === 1) throw new Error("Transaction simulation failed: Blockhash not found");
      return "fresh transaction";
    },
    async () => { refreshes += 1; },
  );
  assert.equal(result, "fresh transaction");
  assert.equal(builds, 2);
  assert.equal(refreshes, 1);
});

test("a stale-blockhash build is retried at most once", async () => {
  const buildWithBlockhashRetry = helper("buildWithBlockhashRetry");
  let builds = 0;
  let refreshes = 0;
  await assert.rejects(
    buildWithBlockhashRetry(async () => {
      builds += 1;
      throw new Error("Blockhash not found");
    }, async () => { refreshes += 1; }),
    /Blockhash not found/,
  );
  assert.equal(builds, 2);
  assert.equal(refreshes, 1);
});

test("submission-time expiry is not blindly retried during construction", async () => {
  const buildWithBlockhashRetry = helper("buildWithBlockhashRetry");
  let builds = 0;
  await assert.rejects(
    buildWithBlockhashRetry(async () => {
      builds += 1;
      throw new Error("Signature has expired: block height exceeded");
    }, async () => {}),
    /block height exceeded/,
  );
  assert.equal(builds, 1);
});

test("non-blockhash errors are not retried", async () => {
  const buildWithBlockhashRetry = helper("buildWithBlockhashRetry");
  let builds = 0;
  await assert.rejects(
    buildWithBlockhashRetry(async () => {
      builds += 1;
      throw new Error("AccountOwnedByWrongProgram");
    }, async () => {}),
    /AccountOwnedByWrongProgram/,
  );
  assert.equal(builds, 1);
});
