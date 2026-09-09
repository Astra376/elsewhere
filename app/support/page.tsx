import type { Metadata } from 'next';
import { SupportForm } from '@/components/support-form';
export const metadata: Metadata = {
  title: 'Support',
  robots: { index: false, follow: false },
};
export default function Page() {
  return <SupportForm />;
}
