// Normalize a recurring rule's amount to a monthly figure so totals across
// mixed frequencies (weekly, yearly, quarterly…) are comparable. Shared by the
// advisor's getRecurringSummary tool and the recurring page's section totals so
// the two never drift.
export function monthlyEquivalent(amount: number, frequency: string): number {
  switch (frequency) {
    case 'weekly':
      return amount * 4.33;
    case 'monthly':
      return amount;
    case 'bimonthly':
      return amount / 2;
    case 'quarterly':
      return amount / 3;
    case 'semiannual':
      return amount / 6;
    case 'yearly':
      return amount / 12;
    default:
      return amount;
  }
}
