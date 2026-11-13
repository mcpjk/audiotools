import { test, expect } from '@playwright/test';

// The render sweep. A broken component mounts an empty <div id="root"> and the
// page just looks blank, so this is the check that catches it. The list must
// name every real entry in vite.config.js's `input` map — a page missing from
// HERE is a page whose blank render is nobody's test.
const TOOLS = ['horn-calculator.html', 'annular-flh.html',
  'directivity-match.html', 'aperture-wavefield.html', 'box-modes.html',
  'cavity-modes.html'];

test('the landing page and every calculator render without errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  for (const path of ['index.html', ...TOOLS]) {
    await page.goto('/' + path);
    await expect(page.locator('body')).not.toHaveText('');
    if (path !== 'index.html') await expect(page.locator('#root')).not.toBeEmpty();
  }
  expect(errors).toEqual([]);
});

// The two Ginkgo tools moved to their own repo on 2026-09-09, and are served at
// macapeh.com/audio/design/multicell/ since 2026-11-13 (the rim lab no longer
// exists; its stub goes to the multicell horn). What is
// left here is a stub whose whole job is to carry an existing link across.
// Asserted on the RAW BODY via request.get, which does not follow a meta
// refresh — so this tests what this site serves, and never depends on the far
// end being up, which is the other site's business and not observable here.
test('the moved Ginkgo pages still carry their links to their new home', async ({ request }) => {
  for (const [stub, target] of [
    ['ginkgo-horn.html', 'https://macapeh.com/audio/design/multicell/'],
    ['ginkgo-rim-lab.html', 'https://macapeh.com/audio/design/multicell/'],
  ]) {
    const res = await request.get('/' + stub);
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toContain(`content="0; url=${target}"`);   // the redirect
    expect(html).toContain(`href="${target}"`);             // the visible fallback
    expect(html).toContain(`rel="canonical" href="${target}"`);
  }
});

test('the landing page sends the Ginkgo card to its new home', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('a[href="https://macapeh.com/audio/design/multicell/"]')).toBeVisible();
  await expect(page.locator('a[href*="ginkgo-rim-lab"]')).toHaveCount(0);   // gone, not dead
  for (const t of TOOLS)   // and the local tools are still local
    await expect(page.locator(`a[href="./${t}"]`)).toBeVisible();
});
