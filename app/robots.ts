import { SITE_URL } from '@/lib/site';
export default function robots() {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/chat', '/moderation', '/reset-password'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
