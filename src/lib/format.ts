/** Format a number with commas */
export function fmt(n: number | null | undefined): string {
  if (n == null) return 'N/A';
  return n.toLocaleString('en-US');
}

/** Format as currency ($X,XXX) */
export function fmtMoney(n: number | null | undefined): string {
  if (n == null) return 'N/A';
  return `$${n.toLocaleString('en-US')}`;
}

/** Format as percentage (X.X%) */
export function fmtPct(n: number | null | undefined): string {
  if (n == null) return 'N/A';
  return `${n}%`;
}

/** Format compact number (1.2M, 850K) */
export function fmtCompact(n: number | null | undefined): string {
  if (n == null) return 'N/A';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toString();
}
