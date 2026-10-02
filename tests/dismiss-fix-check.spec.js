/**
 * dismiss-fix-check.spec.js — Verifiera att ✕-knappen FAKTISKT gör bannern osynlig.
 *
 * Före fix: .install-hint { display: flex } overridade HTML-attributet `hidden`,
   så `installHint.hidden = true` hade ingen visuell effekt. Banner kvar som flex.
 *
 * Efter fix: .install-hint[hidden] { display: none } (specificity 0,2,0 vinner
   över .install-hint 0,1,0). Banner försvinner vid klick.
 *
 * Det här testet kollar COMPUTED display, inte bara `hidden`-property.
 */
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 414, height: 800 },
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  page.on('pageerror', err => console.error('[pageerror]', err.message));

  await page.goto('http://localhost:8765/', { waitUntil: 'networkidle' });

  // Show the banner (headless chromium doesn't fire beforeinstallprompt)
  await page.evaluate(() => {
    const banner = document.getElementById('installHint');
    banner.hidden = false;
  });

  const before = await page.evaluate(() => {
    const el = document.getElementById('installHint');
    const r = el.getBoundingClientRect();
    return {
      hiddenAttr: el.hidden,
      computedDisplay: getComputedStyle(el).display,
      visibleSize: r.width > 0 && r.height > 0,
    };
  });
  console.log('BEFORE dismiss:', JSON.stringify(before, null, 2));

  // Click dismiss
  await page.click('#dismissInstall');
  await page.waitForTimeout(200);

  const after = await page.evaluate(() => {
    const el = document.getElementById('installHint');
    const r = el.getBoundingClientRect();
    return {
      hiddenAttr: el.hidden,
      computedDisplay: getComputedStyle(el).display,
      visibleSize: r.width > 0 && r.height > 0,
      flag: localStorage.getItem('begrepp-install-hint-dismissed'),
    };
  });
  console.log('AFTER dismiss:', JSON.stringify(after, null, 2));

  await browser.close();

  // VERDICT: banner MÅSTE ha display: none OCH vara icke-synlig efter klick
  const ok = after.computedDisplay === 'none' && !after.visibleSize;
  console.log('\n=== VERDICT ===');
  console.log('Banner faktiskt osynlig efter ✕:', ok);
  console.log('  computed display:', after.computedDisplay);
  console.log('  visible size:', after.visibleSize);
  process.exit(ok ? 0 : 1);
})().catch(err => { console.error('crash:', err); process.exit(2); });