// @vitest-environment jsdom
// The numerical core stays in the fast default node environment; only the shell pays for a DOM.
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from './App';
import type { SimulationEntry } from '../registry/sims';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

/** A registry entry standing in for a real sim, so the route plumbing can be tested before any
 * simulation exists. `load` is exactly the lazy loader shape registry/sims.ts declares. */
function entry(load: SimulationEntry['load']): readonly SimulationEntry[] {
  return [{ id: 'fixture', title: 'Fixture sim', description: 'A stand-in.', tags: ['test'], load }];
}

const at = (path: string, entries: readonly SimulationEntry[]) =>
  render(<MemoryRouter initialEntries={[path]}><App entries={entries} /></MemoryRouter>);

it('renders a lazily loaded simulation route once its chunk resolves', async () => {
  const entries = entry(async () => ({ default: () => <p>Fixture simulation body</p> }));
  at('/sims/fixture', entries);
  // The Suspense fallback must be what the user sees first, not a blank frame.
  expect(screen.getByRole('status')).toHaveProperty('textContent', 'Loading simulation…');
  expect(await screen.findByText('Fixture simulation body')).toBeTruthy();
  expect(document.title).toBe('Fixture sim · Abstract Physics');
});

it('shows the error boundary instead of a blank page when a sim chunk fails to load', async () => {
  // React logs boundary-caught errors; silence it so a passing run stays readable.
  vi.spyOn(console, 'error').mockImplementation(() => {});
  at('/sims/fixture', entry(() => Promise.reject(new Error('chunk 404'))));
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('This simulation could not load.');
});

it('lists registry entries in the gallery rather than the empty-collection notice', () => {
  at('/', entry(async () => ({ default: () => <p>unused</p> })));
  expect(screen.getByRole('link', { name: 'Fixture sim' })).toBeTruthy();
  expect(screen.queryByText('Not available yet')).toBeNull();
});

it('starts up and keeps the theme control usable when storage throws', () => {
  // Private-mode and blocked-cookie browsers throw on access, not just on write.
  const denied = () => { throw new DOMException('denied', 'SecurityError'); };
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(denied);
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(denied);
  at('/', []);
  expect(screen.getByRole('heading', { level: 1 })).toBeTruthy();
  expect(screen.getByLabelText(/Theme/)).toHaveProperty('value', 'system');
});
