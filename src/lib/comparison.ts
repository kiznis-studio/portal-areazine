import nationalStats from '../data/national-stats.json';

export interface ComparisonResult {
  direction: 'above' | 'below' | 'average';
  /** Percentage difference from national average */
  pct: number;
  /** Human-readable label like "+116% above avg" */
  label: string;
}

const METRIC_MAP: Record<string, { key: keyof typeof nationalStats; invert?: boolean }> = {
  medianHouseholdIncome: { key: 'avgMedianIncome' },
  medianHomeValue: { key: 'avgMedianHomeValue' },
  medianRent: { key: 'avgMedianRent' },
  povertyRate: { key: 'avgPovertyRate', invert: true },
  violentCrimeRate: { key: 'avgViolentCrimeRate' as any, invert: true },
  propertyCrimeRate: { key: 'avgPropertyCrimeRate' as any, invert: true },
};

/**
 * Compare a city metric to the national average.
 * Returns direction, percentage difference, and a human label.
 * `invert` metrics (like poverty) flip the color coding —
 * "above average" poverty is bad, shown red.
 */
export function compareToNational(
  metric: string,
  value: number | null | undefined,
): ComparisonResult | null {
  if (value == null) return null;

  const mapping = METRIC_MAP[metric];
  if (!mapping) return null;

  const avg = nationalStats[mapping.key] as number;
  if (!avg) return null;

  const diff = ((value - avg) / avg) * 100;
  const absDiff = Math.abs(Math.round(diff));

  if (absDiff < 3) {
    return { direction: 'average', pct: 0, label: 'Near average' };
  }

  const isAbove = diff > 0;
  const direction = isAbove ? 'above' : 'below';
  const sign = isAbove ? '+' : '-';
  const label = `${sign}${absDiff}% vs avg`;

  return { direction, pct: absDiff, label };
}

/**
 * Get the CSS class for a comparison indicator.
 * For inverted metrics (poverty, unemployment), above = bad (red).
 */
export function getIndicatorClass(
  metric: string,
  result: ComparisonResult | null,
): string {
  if (!result || result.direction === 'average') return 'indicator-neutral';

  const mapping = METRIC_MAP[metric];
  const isInverted = mapping?.invert ?? false;
  const isAbove = result.direction === 'above';

  // For normal metrics: above avg = good (green). For inverted: above avg = bad (red)
  const isGood = isInverted ? !isAbove : isAbove;
  return isGood ? 'indicator-above' : 'indicator-below';
}

/** Get national average for a metric */
export function getNationalAvg(metric: string): number | null {
  const mapping = METRIC_MAP[metric];
  if (!mapping) return null;
  return (nationalStats[mapping.key] as number) ?? null;
}

/** Get a normalized bar width (0-100) for a value relative to a sensible max */
export function getBarWidth(metric: string, value: number): number {
  const maxMap: Record<string, number> = {
    medianHouseholdIncome: 200_000,
    medianHomeValue: 1_500_000,
    medianRent: 3_000,
    povertyRate: 40,
  };
  const max = maxMap[metric] || 100;
  return Math.min((value / max) * 100, 100);
}
