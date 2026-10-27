/** Read compatibility while the Finance-to-Approver migration is rolling out. */
export function normalizeLegacyRole(role: string): string {
  return role === 'Finance' ? 'Approver' : role;
}
