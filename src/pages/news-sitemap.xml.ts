import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getCategoryMeta } from '../lib/config';
import type { CategoryKey } from '../lib/config';

export const GET: APIRoute = async () => {
  const articles = await getCollection('articles');

  // Filter articles from last 48 hours
  const now = new Date();
  const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

  const recentArticles = articles
    .filter(article => {
      const publishedDate = new Date(article.data.publishedAt);
      return publishedDate >= fortyEightHoursAgo;
    })
    .sort((a, b) =>
      new Date(b.data.publishedAt).getTime() - new Date(a.data.publishedAt).getTime()
    );

  // Generate Google News sitemap XML
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${recentArticles.map(article => {
  const catMeta = getCategoryMeta(article.data.category as CategoryKey);
  const url = `https://areazine.com/${catMeta.slug}/${article.id}`;
  const publishedDate = new Date(article.data.publishedAt);

  return `  <url>
    <loc>${url}</loc>
    <news:news>
      <news:publication>
        <news:name>Areazine</news:name>
        <news:language>en</news:language>
      </news:publication>
      <news:publication_date>${publishedDate.toISOString()}</news:publication_date>
      <news:title>${escapeXml(article.data.title)}</news:title>
    </news:news>
  </url>`;
}).join('\n')}
</urlset>`;

  return new Response(sitemap, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=600', // Cache for 10 minutes
    },
  });
};

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
