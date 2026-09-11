'use client';
import { api } from './client';
export async function setPushEnabled(
  enabled: boolean,
  publicKey: string | null,
) {
  if (
    !('serviceWorker' in navigator) ||
    !('PushManager' in window) ||
    !('Notification' in window)
  )
    throw new Error(
      'Install ChatUp to your home screen or use a browser that supports push notifications.',
    );
  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!enabled) {
    if (subscription) {
      await api('/push', {
        method: 'DELETE',
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
      await subscription.unsubscribe();
    }
    return;
  }
  if (!publicKey) throw new Error('Push notifications are not available yet.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted')
    throw new Error(
      'Allow notifications in your browser settings to enable this option.',
    );
  if (!subscription) {
    const padded =
      publicKey.replace(/-/g, '+').replace(/_/g, '/') +
      '='.repeat((4 - (publicKey.length % 4)) % 4);
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: Uint8Array.from(atob(padded), (c) =>
        c.charCodeAt(0),
      ),
    });
  }
  await api('/push', {
    method: 'POST',
    body: JSON.stringify(subscription.toJSON()),
  });
}
