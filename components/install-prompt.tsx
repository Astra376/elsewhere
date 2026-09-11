'use client';
import { useEffect, useState } from 'react';
import { Download, Share, X } from 'lucide-react';
type InstallEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};
export function InstallPrompt() {
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (
      matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone
    )
      return;
    const dismissed = Number(
      localStorage.getItem('elsewhere-install-dismissed') || 0,
    );
    if (Date.now() - dismissed < 7 * 86400000) return;
    const isIos =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    setIos(isIos);
    const timer = setTimeout(() => {
      if (isIos) setVisible(true);
    }, 45000);
    const handle = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallEvent);
      setVisible(true);
    };
    const installed = () => setVisible(false);
    window.addEventListener('beforeinstallprompt', handle);
    window.addEventListener('appinstalled', installed);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('beforeinstallprompt', handle);
      window.removeEventListener('appinstalled', installed);
    };
  }, []);
  function dismiss() {
    setVisible(false);
    localStorage.setItem('elsewhere-install-dismissed', String(Date.now()));
  }
  if (!visible) return null;
  return (
    <aside className="install-prompt" aria-label="Install ChatUp">
      <img src="/icon.svg" alt="" />
      <div>
        <strong>A little closer, anytime.</strong>
        <p>
          {ios ? (
            <>
              Tap <Share size={13} /> Share, then Add to Home Screen.
            </>
          ) : (
            'Keep ChatUp on your home screen.'
          )}
        </p>
        {event && (
          <button
            onClick={async () => {
              await event.prompt();
              await event.userChoice;
              dismiss();
            }}
          >
            <Download size={14} />
            Install app
          </button>
        )}
      </div>
      <button
        className="icon-button"
        aria-label="Dismiss install suggestion"
        onClick={dismiss}
      >
        <X size={16} />
      </button>
    </aside>
  );
}
