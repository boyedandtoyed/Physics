// @vitest-environment jsdom
// This is a DOM question: it needs a document to read and a window to be missing an API on.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readDarkTheme } from './useDarkTheme';

/** The guard here is not hypothetical. `matchMedia` is absent in jsdom and in some embedded
 * browsers, and calling it unguarded threw out of render — which took the whole collection page
 * down through its error boundary the moment the backdrop put this hook on the home route. */

const original = Object.getOwnPropertyDescriptor(window, 'matchMedia');

afterEach(() => {
  delete document.documentElement.dataset.theme;
  if (original) Object.defineProperty(window, 'matchMedia', original);
  else Reflect.deleteProperty(window as unknown as Record<string, unknown>, 'matchMedia');
});

const withMatchMedia = (matches: boolean) => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockReturnValue({
      matches, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    }),
  });
};

describe('reading the theme', () => {
  it('prefers the explicit choice over the system one, in both directions', () => {
    withMatchMedia(true);
    document.documentElement.dataset.theme = 'light';
    expect(readDarkTheme()).toBe(false);
    document.documentElement.dataset.theme = 'dark';
    expect(readDarkTheme()).toBe(true);
  });

  it('falls back to the system preference when there is no explicit choice', () => {
    withMatchMedia(true);
    expect(readDarkTheme()).toBe(true);
    withMatchMedia(false);
    expect(readDarkTheme()).toBe(false);
  });

  it('reports light rather than throwing where matchMedia does not exist', () => {
    Reflect.deleteProperty(window as unknown as Record<string, unknown>, 'matchMedia');
    expect(() => readDarkTheme()).not.toThrow();
    expect(readDarkTheme()).toBe(false);
    // ...and an explicit choice is still honoured without it.
    document.documentElement.dataset.theme = 'dark';
    expect(readDarkTheme()).toBe(true);
  });
});
