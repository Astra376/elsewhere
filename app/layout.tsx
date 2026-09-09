import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { SITE_URL } from '@/lib/site';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Elsewhere — A hello can go anywhere',
    template: '%s · Elsewhere',
  },
  description:
    'Meet someone outside your usual circle. Free stranger chat, shared interests, voice and video calls, little games, and conversations worth keeping.',
  applicationName: 'Elsewhere',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Elsewhere',
  },
  openGraph: {
    title: 'Elsewhere — A hello can go anywhere',
    description:
      'A little curiosity. A new connection. Meet people through text, voice, video, and shared interests.',
    type: 'website',
    siteName: 'Elsewhere',
  },
  icons: { icon: '/icon.svg', apple: '/icon-192.png' },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
