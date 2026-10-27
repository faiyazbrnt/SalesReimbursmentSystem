/** Missing methods are eligible for cash processing; recorded non-cash methods are not. */
export function isCashTransactionMethod(method?: string | null): boolean {
  return !method?.trim() || method.trim().toLowerCase() === 'cash';
}

export const CUSTODIAN_CASH_ONLY_ERROR = 'Custodian transactions must use cash only.';
