import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { readDesignStamp } from '../src/ginkgo-state.js';

const ready = page => expect(page.getByTestId('calculation-status')).toContainText('Export checks:');
const edit = async (page, label, value) => {
  const input = page.getByRole('spinbutton', { name: label, exact: true });
  await input.fill(String(value)); await input.press('Enter');
};

test('all six entry pages render without console or page errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  for (const path of ['index.html', 'horn-calculator.html', 'annular-flh.html',
    'directivity-match.html', 'aperture-wavefield.html', 'ginkgo-horn.html']) {
    await page.goto('/' + path);
    if (path === 'ginkgo-horn.html') await ready(page);
    await expect(page.locator('body')).not.toHaveText('');
    if (path !== 'index.html') await expect(page.locator('#root')).not.toBeEmpty();
  }
  expect(errors).toEqual([]);
});

test('changing a throat request prevents export of the old solved grid', async ({ page }) => {
  await page.goto('/ginkgo-horn.html'); await ready(page);
  await edit(page, 'Columns n_cols', 8);
  // At the event boundary the old map is invalid, including while the worker
  // has not started. Subsequent readiness must belong to the new topology.
  await expect(page.getByRole('button', { name: 'STEP · B-spline solids', exact: true })).toBeDisabled();
  await ready(page);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'STEP · B-spline solids', exact: true }).click();
  const state = readDesignStamp(await readFile(await (await download).path(), 'utf8'));
  expect(state.layout.nc).toBe(8);
  expect(state.mapping.nc).toBe(8);
  expect(state.achieved).toHaveLength(state.layout.nParams);
});

test('tangent solve, refined diagnostics and STEP agree on the chosen settings', async ({ page }) => {
  await page.goto('/ginkgo-horn.html'); await ready(page);
  await page.getByRole('button', { name: 'solve tangent for minimum ΔL', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'Throat tangent', exact: true })).toHaveValue('0.28');
  await ready(page);
  await page.getByRole('button', { name: 'off — bare geometry', exact: true }).click();
  await ready(page);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'STEP · B-spline solids', exact: true }).click();
  const state = readDesignStamp(await readFile(await (await download).path(), 'utf8'));
  expect(state.mapping.tightThroat).toBe(.28);
  expect(state.mapping.lengthen.regionGrade).toBe(.2);
  expect(state.mapping.samples).toBeGreaterThanOrEqual(2048);
  expect(state.model).toMatch(/^[a-f0-9]{64}$/);
  expect(state.verification.samples.at(-1)).toBe(state.mapping.samples);
});

test('separation result is invalidated by a previously untracked input', async ({ page }) => {
  await page.goto('/ginkgo-horn.html'); await ready(page);
  await page.getByRole('button', { name: 'solve · quick spread', exact: true }).click();
  await expect(page.getByTestId('separation-result')).toBeVisible();
  await edit(page, 'Throat tangent', .4);
  await expect(page.getByTestId('separation-result')).toHaveCount(0);
  await ready(page);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'STEP · B-spline solids', exact: true }).click();
  const state = readDesignStamp(await readFile(await (await download).path(), 'utf8'));
  expect(state.mapping.separate).toBeNull();
});

test('a long solve can be cancelled without freezing the controls', async ({ page }) => {
  await page.goto('/ginkgo-horn.html'); await ready(page);
  await page.getByRole('button', { name: 'Maximise min f₁', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel solve', exact: true }).click({ timeout: 3000 });
  await expect(page.getByRole('button', { name: 'Maximise min f₁', exact: true })).toBeEnabled();
  await edit(page, 'Throat tangent', .4);
  await ready(page);
});
