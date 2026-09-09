import type { Metadata } from 'next';
import { ChatApp } from '@/components/chat-app';
export const metadata: Metadata = {
  title: 'Meet someone new',
  robots: { index: false, follow: false },
};
export default function ChatPage() {
  return <ChatApp />;
}
