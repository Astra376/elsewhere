'use client';
import { useEffect } from 'react';
import { preferredDark, applyTheme } from '@/lib/theme';
export function ThemeSync() {
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => {
      applyTheme(preferredDark());
      window.dispatchEvent(new Event('chatup-theme'));
    };
    sync();
    media.addEventListener('change', sync);
    window.addEventListener('storage', sync);
    return () => {
      media.removeEventListener('change', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  return null;
}
