import { getCollection } from 'astro:content';
import { getCategoryMeta } from '../lib/config';
import type { CategoryKey } from '../lib/config';
import { SITE_NAME, SITE_URL, SITE_DESCRIPTION } from '../lib/config';

export async function GET() {
  const articles = (await getCollection('articles'))
    .sort((a, b) => new Date(b.data.publishedAt).getTime() - new Date(a.data.publishedAt).getTime())
    .slice(0, 50);

  const items = articles.map((article) => {
    const catMeta = getCategoryMeta(article.data.category as CategoryKey);
    const link = `${SITE_URL}/${catMeta.slug}/${article.id}`;
    const pubDate = new Date(article.data.publishedAt).toUTCString();

    return `    <item>
      <title><![CDATA[${article.data.title}]]></title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <description><![CDATA[${article.data.summary}]]></description>
      <pubDate>${pubDate}</pubDate>
      <category>${catMeta.label}</category>
    </item>`;
  }).join('\n');

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${SITE_NAME}</title>
    <link>${SITE_URL}</link>
    <description>${SITE_DESCRIPTION}</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${SITE_URL}/rss.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`;

  return new Response(rss, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
    },
  });
}
