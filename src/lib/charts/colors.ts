// Cohesive palette for category-based charts. Order matters — earlier colors
// win when there are too many categories to render distinctly.
// Built around the brand violet, rotating through complementary hues.
export const CATEGORY_COLORS = [
  '#7C3AED', // violet-600 (brand)
  '#3B82F6', // blue-500
  '#10B981', // emerald-500
  '#F59E0B', // amber-500
  '#EC4899', // pink-500
  '#06B6D4', // cyan-500
  '#8B5CF6', // violet-500
  '#F97316', // orange-500
  '#14B8A6', // teal-500
  '#A855F7', // purple-500
  '#0EA5E9', // sky-500
  '#EAB308', // yellow-500
  '#94A3B8', // slate-400 (last resort)
];

export function colorForIndex(i: number): string {
  return CATEGORY_COLORS[i % CATEGORY_COLORS.length];
}

// Stable color for a given category key — same key always gets same color.
// Hash so re-ordered/added categories keep their identity.
export function colorForCategory(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  return CATEGORY_COLORS[Math.abs(hash) % CATEGORY_COLORS.length];
}

export const CHART_INCOME = '#10B981';
export const CHART_EXPENSE = '#EF4444';
export const CHART_NET_POSITIVE = '#10B981';
export const CHART_NET_NEGATIVE = '#EF4444';
export const CHART_PROJECTION = '#A855F7';
export const CHART_GRID = '#E2E8F0';
export const CHART_AXIS = '#94A3B8';
