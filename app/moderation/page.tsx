import type { Metadata } from 'next';
import { ModerationConsole } from '@/components/moderation-console';
export const metadata: Metadata = {
  title: 'Moderation',
  robots: { index: false, follow: false },
};
export default function Page() {
  return <ModerationConsole />;
}
