import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meridian-pool-memory-test-"));
const memoryFile = path.join(tempDir, "pool-memory.json");
process.env.MERIDIAN_POOL_MEMORY_FILE = memoryFile;

const poolMemory = await import("../pool-memory.js");

function writeMemory(data) {
  fs.writeFileSync(memoryFile, JSON.stringify(data, null, 2));
}

function readMemory() {
  return JSON.parse(fs.readFileSync(memoryFile, "utf8"));
}

test.after(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("a successful deploy starts a persistent 12-hour token cooldown across pools", () => {
  const mint = "TokenMint111111111111111111111111111111111";
  const poolA = "PoolAddress1111111111111111111111111111111";
  const poolB = "PoolAddress2222222222222222222222222222222";
  writeMemory({
    [poolB]: { name: "TOKEN-SOL alternate", base_mint: mint, deploys: [], total_deploys: 0 },
  });

  const startedAt = Date.now();
  const until = poolMemory.recordBaseMintDeployCooldown(poolA, mint, 12);
  const elapsed = Date.parse(until) - startedAt;
  const db = readMemory();

  assert.ok(elapsed >= 12 * 60 * 60 * 1000 - 1000);
  assert.ok(elapsed <= 12 * 60 * 60 * 1000 + 1000);
  assert.equal(poolMemory.isBaseMintOnCooldown(mint), true);
  assert.equal(db[poolA].base_mint, mint);
  assert.equal(db[poolA].base_mint_cooldown_until, until);
  assert.equal(db[poolB].base_mint_cooldown_until, until);
});

test("a pending deploy reservation blocks concurrent deploys but releases after failure", () => {
  const mint = "PendingMint1111111111111111111111111111111";
  writeMemory({});

  assert.equal(poolMemory.reserveBaseMintDeploy(mint), true);
  assert.equal(poolMemory.isBaseMintOnCooldown(mint), true);
  assert.equal(poolMemory.reserveBaseMintDeploy(mint), false);

  poolMemory.releaseBaseMintDeploy(mint);
  assert.equal(poolMemory.isBaseMintOnCooldown(mint), false);
  assert.equal(poolMemory.reserveBaseMintDeploy(mint), true);
  poolMemory.releaseBaseMintDeploy(mint);
});

test("a mint becomes eligible again after its persisted cooldown expires", () => {
  const mint = "ExpiredMint111111111111111111111111111111";
  const pool = "ExpiredPool11111111111111111111111111111";
  writeMemory({
    [pool]: {
      name: "EXPIRED-SOL",
      base_mint: mint,
      deploys: [],
      base_mint_cooldown_until: new Date(Date.now() - 1000).toISOString(),
    },
  });

  assert.equal(poolMemory.isBaseMintOnCooldown(mint), false);
  assert.equal(poolMemory.reserveBaseMintDeploy(mint), true);
  poolMemory.releaseBaseMintDeploy(mint);
});

test("a closed deploy does not restart a cooldown that began at deployment", () => {
  const mint = "ClosedMint1111111111111111111111111111111";
  const pool = "ClosedPool11111111111111111111111111111111";
  writeMemory({});
  const originalUntil = poolMemory.recordBaseMintDeployCooldown(pool, mint, 12);

  poolMemory.recordPoolDeploy(pool, {
    pool_name: "CLOSED-SOL",
    base_mint: mint,
    deployed_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    closed_at: new Date().toISOString(),
    pnl_pct: 1,
    fees_earned_usd: 1,
    fee_earned_pct: 1,
    close_reason: "agent decision",
  });

  assert.equal(readMemory()[pool].base_mint_cooldown_until, originalUntil);
});
