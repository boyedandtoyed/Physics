import { useEffect, useState } from 'react';

/**
 * Whether the page is currently rendering dark.
 *
 * Every sim that draws to a canvas needs this, because a WebGL palette cannot be expressed in CSS
 * custom properties and so cannot follow the theme by itself. A colour chosen to read on one
 * background is often invisible on the other, which is the single most common defect in this
 * repo's history — CLAUDE.md rule 3 exists because of it.
 *
 * Reads the explicit choice first and falls back to the system preference, and watches both: the
 * attribute with a MutationObserver, the media query with its own change event. Four sims had
 * their own copy of this before it was promoted here.
 */
export function useDarkTheme(): boolean {
  const [dark, setDark] = useState(() => readDarkTheme());
  useEffect(() => {
    const read = () => setDark(readDarkTheme());
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, {
      attributes: true, attributeFilter: ['data-theme'],
    });
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    query.addEventListener('change', read);
    return () => { observer.disconnect(); query.removeEventListener('change', read); };
  }, []);
  return dark;
}

/** The same question outside React, for a render pass that needs it before the hook has run. */
export function readDarkTheme(): boolean {
  if (typeof document === 'undefined') return false;
  const explicit = document.documentElement.dataset.theme;
  if (explicit === 'dark') return true;
  if (explicit === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}
