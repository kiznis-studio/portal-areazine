import * as Sentry from '@sentry/node';

const DSN = 'https://234e5ea110716ac89ad5945a83ea0e5f@o4510827630231552.ingest.de.sentry.io/4510867553779792';

// Only enable Sentry in production (Aurora server).
// Check for DATA_DIR=/data (Aurora) or explicit SENTRY_ENABLED=true.
const isProduction = process.env.DATA_DIR === '/data' || process.env.SENTRY_ENABLED === 'true';

if (isProduction) {
  Sentry.init({
    dsn: DSN,
    environment: 'production',
    tracesSampleRate: 0.1,
  });
}

export { Sentry, isProduction };
