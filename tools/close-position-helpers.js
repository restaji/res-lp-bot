import BN from "bn.js";

export function shouldSkipFeeClaim({ skipClaim = false, recentlyClaimed = false } = {}) {
  return skipClaim === true || recentlyClaimed === true;
}

export function assertPositionAccountOwner({ accountInfo, expectedProgramId }) {
  if (!accountInfo) {
    throw new Error("Position account not found on-chain; refusing to close.");
  }
  if (!accountInfo.owner?.equals?.(expectedProgramId)) {
    throw new Error("Position account owner mismatch; refusing to close.");
  }
}

export function assertPositionMatchesPoolAndOwner({ positionState, expectedPoolAddress, expectedOwner }) {
  if (!positionState?.lbPair?.equals?.(expectedPoolAddress)) {
    throw new Error("Position belongs to a different pool or has unreadable state; refusing to close.");
  }
  if (!positionState?.owner?.equals?.(expectedOwner)) {
    throw new Error("Position belongs to a different wallet or has unreadable state; refusing to close.");
  }
}

export function hasPositionLiquidity(positionData) {
  const bins = positionData?.positionData?.positionBinData;
  if (!Array.isArray(bins)) {
    throw new Error("Could not read position liquidity state; refusing to close.");
  }
  return bins.some((bin) => new BN(bin?.positionLiquidity || "0").gt(new BN(0)));
}

// Retry only transaction construction/simulation. Submission-time expiry is
// ambiguous and must not cause the same operation to be blindly resubmitted.
export async function buildWithBlockhashRetry(build, refreshPool, onRetry = () => {}) {
  try {
    return await build();
  } catch (error) {
    if (!/blockhash not found/i.test(String(error?.message || error))) throw error;
    onRetry(error);
    await refreshPool();
    return build();
  }
}
