import type { APIRoute, GetStaticPaths } from 'astro';
import satori from 'satori';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { CITIES } from '../../data/cities';
import { fmt, fmtMoney, fmtCompact, fmtPct } from '../../lib/format';

// Load fonts for satori (TTF files in public/fonts/)
const fontBold = fs.readFileSync(path.join(process.cwd(), 'public/fonts/inter-bold.ttf'));
const fontRegular = fs.readFileSync(path.join(process.cwd(), 'public/fonts/inter-regular.ttf'));

// Load city profiles
const profileModules = import.meta.glob('../../data/city-profiles/**/*.json', { eager: true }) as Record<string, { default: any }>;
const profiles: Record<string, any> = {};
for (const [p, mod] of Object.entries(profileModules)) {
  const slug = p.split('/').pop()?.replace('.json', '') || '';
  profiles[slug] = mod.default ?? mod;
}

export const getStaticPaths: GetStaticPaths = () => {
  if (process.env.SKIP_OG === 'true') return [];
  const maxTier = parseInt(process.env.CITY_TIER || '2');
  return CITIES
    .filter(c => c.tier <= maxTier)
    .map(city => ({ params: { slug: city.slug }, props: { city } }));
};

export const GET: APIRoute = async ({ props }) => {
  const city = (props as any).city;
  const profile = profiles[city.slug];
  const census = profile?.census;
  const crime = profile?.crime;
  const history = profile?.history;

  // Build stats for the card
  const stats: { label: string; value: string; color?: string }[] = [];
  if (census?.population) stats.push({ label: 'Population', value: fmtCompact(census.population) });
  if (census?.medianHouseholdIncome) stats.push({ label: 'Median Income', value: fmtMoney(census.medianHouseholdIncome) });
  if (census?.medianHomeValue) stats.push({ label: 'Home Value', value: fmtMoney(census.medianHomeValue) });
  if (crime?.violentCrimeRate) stats.push({ label: 'Violent Crime', value: `${Math.round(crime.violentCrimeRate)}/100k` });

  // Trend text
  let trendText = '';
  if (history?.population && history.population.length >= 2) {
    const first = history.population[0];
    const last = history.population[history.population.length - 1];
    if (first > 0) {
      const pct = Math.round(((last - first) / first) * 100);
      trendText = `Population ${pct >= 0 ? '+' : ''}${pct}% since ${history.years[0]}`;
    }
  }

  const svg = await satori(
    {
      type: 'div',
      props: {
        style: {
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
          color: 'white',
          fontFamily: 'Inter',
          padding: '60px',
        },
        children: [
          // Top: Areazine branding
          {
            type: 'div',
            props: {
              style: { display: 'flex', alignItems: 'center', marginBottom: '20px' },
              children: [
                {
                  type: 'div',
                  props: {
                    style: {
                      background: '#dc2626',
                      color: 'white',
                      padding: '6px 16px',
                      borderRadius: '6px',
                      fontSize: '18px',
                      fontWeight: 700,
                      letterSpacing: '2px',
                    },
                    children: 'AREAZINE',
                  },
                },
                {
                  type: 'div',
                  props: {
                    style: { marginLeft: '16px', fontSize: '18px', color: '#94a3b8' },
                    children: 'City Data Report',
                  },
                },
              ],
            },
          },
          // City name + state
          {
            type: 'div',
            props: {
              style: { display: 'flex', alignItems: 'baseline', gap: '16px', marginBottom: '8px' },
              children: [
                {
                  type: 'div',
                  props: {
                    style: { fontSize: '64px', fontWeight: 700, lineHeight: 1.1 },
                    children: city.name,
                  },
                },
                {
                  type: 'div',
                  props: {
                    style: {
                      fontSize: '28px',
                      color: '#94a3b8',
                      background: 'rgba(255,255,255,0.1)',
                      padding: '4px 12px',
                      borderRadius: '6px',
                    },
                    children: city.stateCode,
                  },
                },
              ],
            },
          },
          // County
          {
            type: 'div',
            props: {
              style: { fontSize: '22px', color: '#94a3b8', marginBottom: '40px' },
              children: `${city.countyName}, ${city.state}`,
            },
          },
          // Stats grid
          {
            type: 'div',
            props: {
              style: { display: 'flex', gap: '24px', flexWrap: 'wrap' as const },
              children: stats.slice(0, 4).map(s => ({
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    flexDirection: 'column' as const,
                    background: 'rgba(255,255,255,0.08)',
                    borderRadius: '12px',
                    padding: '20px 28px',
                    flex: '1',
                    minWidth: '220px',
                  },
                  children: [
                    {
                      type: 'div',
                      props: {
                        style: { fontSize: '16px', color: '#94a3b8', marginBottom: '8px' },
                        children: s.label,
                      },
                    },
                    {
                      type: 'div',
                      props: {
                        style: { fontSize: '32px', fontWeight: 700 },
                        children: s.value,
                      },
                    },
                  ],
                },
              })),
            },
          },
          // Trend footer
          ...(trendText ? [{
            type: 'div',
            props: {
              style: {
                marginTop: 'auto',
                fontSize: '18px',
                color: '#64748b',
              },
              children: trendText,
            },
          }] : []),
        ],
      },
    },
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: 'Inter', data: fontBold.buffer as ArrayBuffer, weight: 700, style: 'normal' as const },
        { name: 'Inter', data: fontRegular.buffer as ArrayBuffer, weight: 400, style: 'normal' as const },
      ],
    },
  );

  const png = await sharp(Buffer.from(svg)).png({ quality: 85 }).toBuffer();

  return new Response(png, {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=31536000' },
  });
};
