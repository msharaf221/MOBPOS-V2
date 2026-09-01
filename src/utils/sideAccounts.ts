/**
 * Helpers for the side-accounts ledger (الحسابات الجانبية).
 */

export interface SettlementLike {
  safeId: string;
  amount: number;
  createdAt: string;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Plan how to reverse `amountToReverse` of already-settled cash for one side
 * account entry.
 *
 * `direction` is the sign of the entry's original settlements (+1 for a
 * receivable whose collections are positive cash-in, -1 for a payable whose
 * repayments are negative cash-out). Only settlements matching that direction
 * are consumed — opposite-sign rows are themselves earlier reversals and must
 * not be "re-reversed", otherwise pairs would cancel instead of extracting
 * the net amount.
 *
 * Settlements are undone LIFO (newest first) so every safe gives back only
 * what it actually received for this entry. Callers must clamp
 * `amountToReverse` to the entry's net settled cash (see settledThroughSafes).
 *
 * Best-effort: if the matching settlements cannot cover the requested amount
 * (inconsistent data), whatever was found is reversed and the remainder is
 * ignored.
 */
export function planSettlementReversal<T extends SettlementLike>(
  settlements: T[],
  amountToReverse: number,
  direction: 1 | -1
): Array<{ safeId: string; amount: number }> {
  const ordered = [...settlements].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  let remaining = round2(Math.max(0, amountToReverse));
  const ops: Array<{ safeId: string; amount: number }> = [];

  for (let i = ordered.length - 1; i >= 0 && remaining > 0; i--) {
    const tx = ordered[i];
    if (!tx.safeId || Math.sign(tx.amount) !== direction) continue;

    const available = Math.abs(tx.amount);
    if (!Number.isFinite(available) || available <= 0) continue;

    const take = round2(Math.min(remaining, available));
    if (take <= 0) continue;

    ops.push({ safeId: tx.safeId, amount: -direction * take });
    remaining = round2(remaining - take);
  }

  return ops;
}

/**
 * Net cash an entry actually moved through safes via settlement transactions
 * (signed: positive = cash came in, negative = cash went out). Reversal
 * transactions are included, so this is the live position, not the gross.
 */
export function settledThroughSafes<T extends SettlementLike>(settlements: T[]): number {
  return round2(settlements.reduce((sum, tx) => sum + tx.amount, 0));
}
