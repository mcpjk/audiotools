import { test, expect } from '@playwright/test';

// The render sweep. A broken component mounts an empty <div id="root"> and the
// page just looks blank, so this is the check that catches it. The list must
// name every real entry in vite.config.js's `input` map — a page missing from
// HERE is a page whose blank render is nobody's test.
const TOOLS = ['horn-calculator.html', 'annular-flh.html',
  'directivity-match.html', 'aperture-wavefield.html'];

test('the landing page and all four calculators render without errors', async ({ page }) => {
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

// The two Ginkgo tools moved to ginkgo.kiiworkshop.com on 2026-09-09. What is
// left here is a stub whose whole job is to carry an existing link across.
// Asserted on the RAW BODY via request.get, which does not follow a meta
// refresh — so this tests what this site serves, and never depends on the far
// end being up, which is the other site's business and not observable here.
test('the moved Ginkgo pages still carry their links to the subdomain', async ({ request }) => {
  for (const [stub, target] of [
    ['ginkgo-horn.html', 'https://ginkgo.kiiworkshop.com/ginkgo-horn.html'],
    ['ginkgo-rim-lab.html', 'https://ginkgo.kiiworkshop.com/ginkgo-rim-lab.html'],
  ]) {
    const res = await request.get('/' + stub);
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toContain(`content="0; url=${target}"`);   // the redirect
    expect(html).toContain(`href="${target}"`);             // the visible fallback
    expect(html).toContain(`rel="canonical" href="${target}"`);
  }
});

test('the landing page sends the Ginkgo cards to the subdomain', async ({ page }) => {
  await page.goto('/');
  for (const t of ['ginkgo-horn', 'ginkgo-rim-lab'])
    await expect(page.locator(`a[href="https://ginkgo.kiiworkshop.com/${t}.html"]`)).toBeVisible();
  for (const t of TOOLS)   // and the four that stayed are still local
    await expect(page.locator(`a[href="./${t}"]`)).toBeVisible();
});
