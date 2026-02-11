// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

import sitemap from '@astrojs/sitemap';
import sentry from '@sentry/astro';

// https://astro.build/config
export default defineConfig({
  site: 'https://areazine.com',
  vite: {
    plugins: [tailwindcss()]
  },

  integrations: [
    sitemap(),
    sentry({
      dsn: 'https://234e5ea110716ac89ad5945a83ea0e5f@o4510827630231552.ingest.de.sentry.io/4510867553779792',
      sourceMapsUploadOptions: {
        enabled: false,
      },
    }),
  ],
});
