/**
 * two-apps-check.spec.js — Verifiera refresh-knapp + install-hint dismiss för
 * båda glosor och rattstavning. Kör mot två lokala HTTP-servrar (glosor 8766,
 * rattstavning 8767).
 */
const { chromium } = require('playwright');

const APPS = [
  { name: 'glosor', url: 'http://localhost:8766/', jsonFile: 'glosor-data.json', installKey: 'glosor-install-hint-dismissed' },
  { name: 'rattstavning', url: 'http://localhost:8767/', jsonFile: 'saol-data.json', installKey: 'ratt-install-hint-dismissed' },
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  let allOk = true;

  for (const app of APPS) {
    console.log(`\n========== ${app.name.toUpperCase()} ==========`);
    const context = await browser.newContext({
      viewport: { width: 414, height: 800 },
      serviceWorkers: 'block',
    });
    const page = await context.newPage();
    page.on('pageerror', err => console.error(`[${app.name} pageerror]`, err.message));

    try {
      await page.goto(app.url, { waitUntil: 'networkidle' });

      // 1. Refresh-knapp finns och synlig
      const refreshBtn = await page.evaluate(() => {
        const el = document.getElementById('refreshDataBtn');
        if (!el) return null;
        return {
          exists: true,
          visible: el.getBoundingClientRect().width > 0,
          text: el.textContent.trim(),
        };
      });
      console.log('Refresh-knapp:', JSON.stringify(refreshBtn));
      if (!refreshBtn?.visible) {
        console.log(`  ❌ refresh-knapp SAKNAS eller osynlig`);
        allOk = false;
      }

      // 2. Install-hint: visa manuellt → klick ✕ → computed display ska bli none
      await page.evaluate(() => {
        document.getElementById('installHint').hidden = false;
      });
      const bannerBefore = await page.evaluate(() => {
        const el = document.getElementById('installHint');
        return {
          display: getComputedStyle(el).display,
          visible: el.getBoundingClientRect().width > 0,
        };
      });
      console.log('Banner innan dismiss:', JSON.stringify(bannerBefore));

      await page.click('#dismissInstall');
      await page.waitForTimeout(200);
      const bannerAfter = await page.evaluate((installKey) => {
        const el = document.getElementById('installHint');
        return {
          display: getComputedStyle(el).display,
          visible: el.getBoundingClientRect().width > 0,
          flag: localStorage.getItem(installKey),
        };
      }, app.installKey);
      console.log('Banner efter dismiss:', JSON.stringify(bannerAfter));
      if (bannerAfter.display !== 'none' || bannerAfter.visible) {
        console.log(`  ❌ banner försvinner INTE`);
        allOk = false;
      }

      // 3. Refresh-knapp: klick → success-feedback (label "Klar!" + is-success class)
      await page.click('#refreshDataBtn');
      await page.waitForTimeout(500);
      const afterClick = await page.evaluate(() => {
        const btn = document.getElementById('refreshDataBtn');
        return {
          label: btn.querySelector('.refresh-label')?.textContent,
          hasSuccess: btn.classList.contains('is-success'),
          hasError: btn.classList.contains('is-error'),
        };
      });
      console.log('Efter refresh-klick (500ms):', JSON.stringify(afterClick));
      if (!afterClick.hasSuccess && !afterClick.hasError) {
        console.log(`  ❌ refresh-knapp gav ingen feedback`);
        allOk = false;
      }
    } catch (err) {
      console.error(`  ❌ FEL:`, err.message);
      allOk = false;
    }

    await context.close();
  }

  await browser.close();
  console.log(`\n=== VERDICT ===`);
  console.log(`Alla appar OK: ${allOk}`);
  process.exit(allOk ? 0 : 1);
})().catch(err => { console.error('crash:', err); process.exit(2); });