export function preferredDark() {
  try {
    const saved = localStorage.getItem('elsewhere-theme');
    if (saved === 'dark' || saved === 'light') return saved === 'dark';
  } catch {}
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}
export function applyTheme(dark: boolean) {
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
}
