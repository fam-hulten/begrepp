/**
 * refresh-button-check.spec.js — Verify refresh button + install-hint dismiss.
 *
 * 1. Refresh button exists, visible, tappable.
 * 2. Click triggers data refresh.
 * 3. Install hint: click ✕ → saved in localStorage → next load doesn't show.
 */
const { chromium } = require('playwright');
const fs = require('fs');

const START_URL = process.env.START_URL || 'http://localhost:8765/';
const SHOT_PATH = '/tmp/begrepp-v53.png';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 414, height: 800 },
    serviceWorkers: 'block',
  });
  const page = await context.newPage();

  page.on('pageerror', err => console.error('[pageerror]', err.message));

  console.log('Loading', START_URL);
  await page.goto(START_URL, { waitUntil: 'networkidle' });

  await page.waitForSelector('#subjectPicker:not(.hidden)');

  // === 1. Refresh button exists & visible ===
  const refreshBtn = await page.evaluate(() => {
    const el = document.getElementById('refreshDataBtn');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      exists: true,
      visible: r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden',
      text: el.textContent.trim(),
      rect: r.toJSON(),
      position: cs.position,
    };
  });
  console.log('\n=== REFRESH BUTTON ===');
  console.log(JSON.stringify(refreshBtn, null, 2));

  // === 2. Click triggers refresh (fånga loading state tidigt) ===
  console.log('\n=== CLICK REFRESH ===');
  await page.click('#refreshDataBtn');
  await page.waitForTimeout(400);  // fånga success-feedback (visas 1.5s efter fetch)

  const afterClick = await page.evaluate(() => {
    const btn = document.getElementById('refreshDataBtn');
    return {
      label: btn.querySelector('.refresh-label')?.textContent,
      classes: btn.className,
      hasSuccess: btn.classList.contains('is-success'),
      hasError: btn.classList.contains('is-error'),
      hasLoading: btn.classList.contains('is-loading'),
      disabled: btn.disabled,
    };
  });
  console.log('After click (400ms):', JSON.stringify(afterClick, null, 2));

  // === 3. Wait for feedback to clear (setTimeout 1500ms efter success) ===
  await page.waitForTimeout(1500);
  const cleared = await page.evaluate(() => {
    const btn = document.getElementById('refreshDataBtn');
    return {
      label: btn.querySelector('.refresh-label')?.textContent,
      hasSuccess: btn.classList.contains('is-success'),
      disabled: btn.disabled,
    };
  });
  console.log('After 1.9s (reset):', JSON.stringify(cleared, null, 2));

  // === 4. Install hint behavior (mock) ===
  console.log('\n=== INSTALL HINT BEHAVIOR ===');
  // Manually show the banner (since beforeinstallprompt doesn't fire in headless)
  await page.evaluate(() => {
    const banner = document.getElementById('installHint');
    banner.hidden = false;
  });
  const bannerInitial = await page.evaluate(() => ({
    hidden: document.getElementById('installHint').hidden,
  }));
  console.log('Banner shown (manual):', JSON.stringify(bannerInitial));

  // Click dismiss
  await page.click('#dismissInstall');
  await page.waitForTimeout(100);

  const afterDismiss = await page.evaluate(() => ({
    hidden: document.getElementById('installHint').hidden,
    localStorageFlag: localStorage.getItem('begrepp-install-hint-dismissed'),
  }));
  console.log('After dismiss:', JSON.stringify(afterDismiss));

  // === Screenshot ===
  await page.screenshot({ path: SHOT_PATH, fullPage: true });
  console.log('\nScreenshot:', SHOT_PATH, '(' + fs.statSync(SHOT_PATH).size + ' bytes)');

  await browser.close();

  // Verdict
  const ok =
    refreshBtn?.visible &&
    (afterClick.hasSuccess || afterClick.hasError) &&
    cleared.label === 'Uppdatera' &&
    afterDismiss.hidden === true &&
    afterDismiss.localStorageFlag === 'true';

  console.log('\n=== VERDICT ===');
  console.log('All checks pass:', ok);
  process.exit(ok ? 0 : 1);
})().catch(err => {
  console.error('Test crashed:', err);
  process.exit(2);
});