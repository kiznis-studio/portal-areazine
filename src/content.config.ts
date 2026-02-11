import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const articles = defineCollection({
  loader: glob({
    pattern: '**/*.md',
    base: './src/content/articles',
    generateId: ({ entry }) => {
      // Strip YYYY/MM/ prefix → just the filename slug
      return entry.replace(/^\d{4}\/\d{2}\//, '').replace(/\.md$/, '');
    },
  }),
  schema: z.object({
    title: z.string(),
    summary: z.string(),
    category: z.enum(['recalls-cpsc', 'recalls-fda', 'recalls-vehicles', 'weather', 'earthquakes', 'disasters', 'economy', 'finance', 'technology']),
    tags: z.array(z.string()),
    location: z.string().optional(),
    severity: z.enum(['critical', 'high', 'medium', 'low']).optional(),
    sourceUrl: z.string().url(),
    sourceAgency: z.string(),
    publishedAt: z.coerce.date(),
    updatedAt: z.coerce.date().optional(),
    ogImage: z.string().optional(),
  }),
});

export const collections = { articles };
