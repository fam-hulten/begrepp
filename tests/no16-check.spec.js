/**
 * no16-check.spec.js — Verifiera att NO-ämnet har exakt 16 begrepp efter
 * Johanna-foto-uppdateringen (08:07 UTC).
 *
 * VIKTIGT: Appen Fisher-Yates-shufflar begreppen per session (så Zacharias inte
 * memorerar ordning), så vi kan INTE förvänta specifik ordning — bara att
 * alla 16 finns.
 */
const { chromium } = require('playwright');

const START_URL = process.env.START_URL || 'http://localhost:8770/';

const EXPECTED = [
  'Urskog', 'Näringskedja', 'Naturreservat', 'Mycel', 'Allemansrätt',
  'Återvinna', 'Nationalpark', 'Odlad skog', 'Pålrot', 'Däggdjur',
  'Kretslopp', 'Vintergrön', 'Nedbrytare', 'Bytesdjur', 'Växtätare', 'Rovdjur',
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 414, height: 800 },
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  page.on('pageerror', err => console.error('pageerror:', err.message));

  console.log('Loading', START_URL);
  await page.goto(START_URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('#subjectPicker:not(.hidden)', { timeout: 10000 });

  await page.click('[data-subject-id="no"]');
  await page.waitForSelector('#card:not(.hidden)');
  console.log('✓ NO subject chosen');

  // Iterera genom alla begrepp (i shufflad ordning)
  const seen = [];
  for (let i = 0; i < 20; i++) {
    const prompt = await page.textContent('#prompt');
    seen.push(prompt);
    const canGoNext = await page.evaluate(() => !document.getElementById('nextBtn').disabled);
    if (!canGoNext) break;
    await page.click('#nextBtn');
    await page.waitForTimeout(50);
  }

  console.log(`\n=== NO BEGREPP (${seen.length} st, shufflad ordning) ===`);
  seen.forEach((p, i) => console.log(`  ${i + 1}. ${p}`));

  let ok = true;
  if (seen.length !== EXPECTED.length) {
    console.log(`  ❌ Antal: förväntade ${EXPECTED.length}, fick ${seen.length}`);
    ok = false;
  } else {
    console.log(`  ✓ Antal: ${seen.length}`);
  }
  for (const exp of EXPECTED) {
    if (!seen.includes(exp)) {
      console.log(`  ❌ Saknar: "${exp}"`);
      ok = false;
    }
  }
  if (ok) console.log(`  ✓ Alla 16 förväntade begrepp finns`);

  await browser.close();
  console.log(`\n=== VERDICT ===`);
  console.log(`NO har alla 16 begrepp: ${ok}`);
  process.exit(ok ? 0 : 1);
})().catch(err => { console.error('crash:', err); process.exit(2); });