import { ThemeSync } from '@/components/theme-sync';
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
    default: 'ChatUp — A hello can go anywhere',
    template: '%s · ChatUp',
  },
  description:
    'Meet someone outside your usual circle. Free stranger chat, shared interests, voice and video calls, little games, and conversations worth keeping.',
  applicationName: 'ChatUp',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'ChatUp',
  },
  openGraph: {
    title: 'ChatUp — A hello can go anywhere',
    description:
      'A little curiosity. A new connection. Meet people through text, voice, video, and shared interests.',
    type: 'website',
    siteName: 'ChatUp',
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
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var d=matchMedia('(prefers-color-scheme: dark)').matches;try{var t=localStorage.getItem('elsewhere-theme');if(t==='dark'||t==='light')d=t==='dark'}catch(e){}document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light'})()`,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeSync />
        {children}
      </body>
    </html>
  );
}
