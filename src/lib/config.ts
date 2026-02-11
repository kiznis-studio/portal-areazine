export const SITE_NAME = 'Areazine';
export const SITE_URL = 'https://areazine.com';
export const SITE_DESCRIPTION = 'Public data transformed into readable news. Government recalls, safety alerts, and economic data — explained clearly.';

export const CATEGORIES = {
  'recalls-cpsc': { label: 'Product Recalls', slug: 'recalls/cpsc', color: 'recalls', icon: 'shield' },
  'recalls-fda': { label: 'FDA Recalls', slug: 'recalls/fda', color: 'recalls', icon: 'heart' },
  'recalls-vehicles': { label: 'Vehicle Recalls', slug: 'recalls/vehicles', color: 'recalls', icon: 'truck' },
  'weather': { label: 'Weather Alerts', slug: 'weather', color: 'weather', icon: 'cloud' },
  'earthquakes': { label: 'Earthquakes', slug: 'earthquakes', color: 'earthquakes', icon: 'activity' },
  'economy': { label: 'Economy', slug: 'economy', color: 'economy', icon: 'chart' },
  'finance': { label: 'Finance', slug: 'finance', color: 'finance', icon: 'dollar' },
  'technology': { label: 'Technology', slug: 'technology', color: 'technology', icon: 'cpu' },
} as const;

export type CategoryKey = keyof typeof CATEGORIES;

export function getCategoryMeta(category: CategoryKey) {
  return CATEGORIES[category] || CATEGORIES['recalls-cpsc'];
}

export function getCategoryBadgeClass(category: CategoryKey): string {
  const color = CATEGORIES[category]?.color || 'recalls';
  return `badge-${color}`;
}

export function getSeverityBadgeClass(severity: string): string {
  if (severity === 'high' || severity === 'medium' || severity === 'low') {
    return `badge-severity-${severity}`;
  }
  return 'badge-severity-low';
}

export function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}
