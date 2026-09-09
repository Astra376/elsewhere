import { SITE_URL } from '@/lib/site';
export default function sitemap() {
  return ['', '/safety', '/privacy', '/terms'].map((path) => ({
    url: SITE_URL + path,
    lastModified: new Date('2026-09-10'),
    changeFrequency: path ? 'monthly' : 'weekly',
    priority: path ? 0.4 : 1,
  }));
}
