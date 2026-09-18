#!/usr/bin/env node
/**
 * Bakes one still per simulation for the collection page's cards.
 *
 * WHY A SCRIPT AND NOT A VITE PLUGIN. A build plugin runs in Node, which has neither
 * OffscreenCanvas nor a GPU, so it cannot render a WebGL frame at all — the plugin would have to
 * launch a browser anyway. Doing it here instead keeps the browser out of the build: the output
 * is fifteen PNGs committed to the repo, `npm run build` stays a pure bundle step with no GPU
 * dependency and no network, and anyone can see in a diff exactly what changed on the cards.
 *
 * Re-run it after a sim's visuals change:
 *
 *     npm run build && npm run preview &
 *     node scripts/bake-thumbnails.mjs
 *
 * Each sim is given time to reach a representative state — a few seconds of its own animation —
 * and the canvas alone is captured, not the page around it.
 */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '..', 'public', 'thumbnails');
const BASE = process.env.PHYSICS_URL ?? 'http://localhost:4173';
const WIDTH = 960;
const HEIGHT = 600;

/**
 * Per-sim setup: how long to let it run, and anything to click first so the still shows the sim
 * doing the thing it is for rather than its empty initial state.
 */
const SHOTS = [
  { id: 'blackhole-lensing', settle: 9000 },
  { id: 'deflection-decomposition', settle: 4000 },
  { id: 'interpretations', settle: 5000 },
  // No canvas at all: the clock calculator is a table of figures. Captured as the whole section
  // rather than the figures row alone — that row is 8:1 and the card is 8:5, so cover-cropping
  // it left three letters of a label and nothing else.
  { id: 'time-dilation', settle: 4000, target: 'section.section' },
  { id: 'spacetime-curvature', settle: 5000 },
  { id: 'gp-river', settle: 5000 },
  { id: 'effective-potential', settle: 6000 },
  { id: 'mercury-precession', settle: 8000 },
  { id: 'gravity-sandbox', settle: 7000, press: ['Inner planets'] },
  { id: 'freefall-sandbox', settle: 6000, press: ['Black hole'], toggle: ['Gravity field arrows'] },
  { id: 'clock-comparison', settle: 5000, press: ['GPS'] },
  { id: 'kerr-shadow', settle: 14000 },
  { id: 'frame-dragging', settle: 6000 },
  { id: 'penrose-process', settle: 6000 },
  { id: 'isco-explorer', settle: 6000 },
  { id: 'kruskal-diagram', settle: 5000 },
  { id: 'penrose-schwarzschild', settle: 5000, press: ['Observer in region I', 'Infalling observer'] },
  { id: 'penrose-kerr', settle: 5000 },
];

async function bake(browser, shot) {
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT + 500 },
    colorScheme: 'dark',
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${BASE}/sims/${shot.id}`, { waitUntil: 'load' });
  await page.getByLabel('Theme').selectOption('dark');
  // Not `exact`: several of these buttons carry a second line — a mass, a radius — inside the
  // same button, and that line is part of the accessible name.
  for (const name of shot.press ?? []) {
    await page.getByRole('button', { name }).first().click();
  }
  for (const name of shot.toggle ?? []) {
    await page.locator('.react-aria-Switch', { hasText: name }).first().click();
  }
  await page.waitForTimeout(shot.settle);

  const surface = page.locator(shot.target ?? '.stage-surface');
  if (await surface.count() === 0) {
    throw new Error(`${shot.id}: nothing matching ${shot.target ?? '.stage-surface'} to capture`);
  }
  const image = await surface.first().screenshot({ type: 'png' });
  await writeFile(resolve(OUT, `${shot.id}.png`), image);
  await context.close();
  return { bytes: image.length, errors };
}

const browser = await chromium.launch({
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
await mkdir(OUT, { recursive: true });
let failed = 0;
for (const shot of SHOTS) {
  try {
    const { bytes, errors } = await bake(browser, shot);
    const note = errors.length ? `  PAGE ERRORS: ${errors.slice(0, 2).join(' | ')}` : '';
    console.log(`${shot.id.padEnd(26)} ${(bytes / 1024).toFixed(0).padStart(5)} kB${note}`);
    if (errors.length) failed++;
  } catch (error) {
    console.error(`${shot.id.padEnd(26)} FAILED: ${error.message}`);
    failed++;
  }
}
await browser.close();
if (failed) {
  console.error(`\n${failed} thumbnail(s) did not bake cleanly.`);
  process.exit(1);
}
console.log(`\nBaked ${SHOTS.length} thumbnails into public/thumbnails.`);
