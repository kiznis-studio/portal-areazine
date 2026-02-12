import { fmt, fmtMoney, fmtPct } from './format';

export interface RankingDef {
  slug: string;
  title: string;
  titleTemplate: string;
  description: string;
  extract: (city: any, profile: any) => number | null;
  format: (v: number) => string;
  sortDir: 'asc' | 'desc';
  unit?: string;
  accentColor: string;
}

export const RANKINGS: RankingDef[] = [
  {
    slug: 'safest-cities',
    title: 'Safest Cities',
    titleTemplate: 'Safest Cities in {state}',
    description: 'Cities ranked by lowest violent crime rate per 100,000 residents.',
    extract: (_c, p) => p?.crime?.violentCrimeRate ?? null,
    format: (v) => Math.round(v) + '/100k',
    sortDir: 'asc',
    unit: 'violent crimes per 100k',
    accentColor: 'var(--color-data-teal)',
  },
  {
    slug: 'most-dangerous-cities',
    title: 'Most Dangerous Cities',
    titleTemplate: 'Most Dangerous Cities in {state}',
    description: 'Cities ranked by highest violent crime rate per 100,000 residents.',
    extract: (_c, p) => p?.crime?.violentCrimeRate ?? null,
    format: (v) => Math.round(v) + '/100k',
    sortDir: 'desc',
    unit: 'violent crimes per 100k',
    accentColor: 'var(--color-data-red)',
  },
  {
    slug: 'most-affordable-cities',
    title: 'Most Affordable Cities',
    titleTemplate: 'Most Affordable Cities in {state}',
    description: 'Cities ranked by lowest median home values.',
    extract: (_c, p) => p?.census?.medianHomeValue ?? null,
    format: (v) => fmtMoney(v),
    sortDir: 'asc',
    unit: 'median home value',
    accentColor: 'var(--color-data-teal)',
  },
  {
    slug: 'most-expensive-cities',
    title: 'Most Expensive Cities',
    titleTemplate: 'Most Expensive Cities in {state}',
    description: 'Cities ranked by highest median home values.',
    extract: (_c, p) => p?.census?.medianHomeValue ?? null,
    format: (v) => fmtMoney(v),
    sortDir: 'desc',
    unit: 'median home value',
    accentColor: 'var(--color-data-amber)',
  },
  {
    slug: 'highest-income-cities',
    title: 'Highest Income Cities',
    titleTemplate: 'Highest Income Cities in {state}',
    description: 'Cities ranked by highest median household income.',
    extract: (_c, p) => p?.census?.medianHouseholdIncome ?? null,
    format: (v) => fmtMoney(v),
    sortDir: 'desc',
    unit: 'median household income',
    accentColor: 'var(--color-data-amber)',
  },
  {
    slug: 'largest-cities',
    title: 'Largest Cities',
    titleTemplate: 'Largest Cities in {state}',
    description: 'Cities ranked by total population from the Census Bureau.',
    extract: (_c, p) => p?.census?.population ?? null,
    format: (v) => fmt(v),
    sortDir: 'desc',
    unit: 'population',
    accentColor: 'var(--color-data-blue)',
  },
  {
    slug: 'fastest-growing-cities',
    title: 'Fastest Growing Cities',
    titleTemplate: 'Fastest Growing Cities in {state}',
    description: 'Cities ranked by population growth percentage over the past decade.',
    extract: (_c, p) => {
      const h = p?.history;
      if (!h?.population || h.population.length < 2) return null;
      const first = h.population[0];
      const last = h.population[h.population.length - 1];
      if (!first || first <= 0) return null;
      return ((last - first) / first) * 100;
    },
    format: (v) => (v >= 0 ? '+' : '') + v.toFixed(1) + '%',
    sortDir: 'desc',
    unit: 'population change',
    accentColor: 'var(--color-data-teal)',
  },
  {
    slug: 'most-educated-cities',
    title: 'Most Educated Cities',
    titleTemplate: 'Most Educated Cities in {state}',
    description: 'Cities ranked by percentage of residents with a bachelor\'s degree or higher.',
    extract: (_c, p) => p?.census?.bachelorDegreeOrHigher ?? null,
    format: (v) => fmtPct(Math.round(v * 10) / 10),
    sortDir: 'desc',
    unit: 'bachelor\'s degree or higher',
    accentColor: 'var(--color-data-violet)',
  },
  {
    slug: 'lowest-unemployment',
    title: 'Lowest Unemployment',
    titleTemplate: 'Cities with Lowest Unemployment in {state}',
    description: 'Cities ranked by lowest civilian unemployment rate.',
    extract: (_c, p) => p?.census?.unemploymentRate ?? null,
    format: (v) => fmtPct(Math.round(v * 10) / 10),
    sortDir: 'asc',
    unit: 'unemployment rate',
    accentColor: 'var(--color-data-teal)',
  },
  {
    slug: 'youngest-cities',
    title: 'Youngest Cities',
    titleTemplate: 'Youngest Cities in {state}',
    description: 'Cities ranked by lowest median age of residents.',
    extract: (_c, p) => p?.census?.medianAge ?? null,
    format: (v) => v.toFixed(1) + ' yrs',
    sortDir: 'asc',
    unit: 'median age',
    accentColor: 'var(--color-data-blue)',
  },
];
