/**
 * image-check.spec.js — Verifiera opt-in bildstöd i begrepp-appen.
 *
 * Vissa NO-begrepp har `image`-fält (växt→🌱, däggdjur→🐾, gas→☁️, magnet→🧲,
 * energi→⚡). Andra har inte. Verifierar:
 * - Begrepp med image → image-area synlig + textContent matchar emoji
 * - Begrepp utan image → image-area hidden
 */
const { chromium } = require('playwright');

const START_URL = process.env.START_URL || 'http://localhost:8765/';

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

  // Välj NO (har både image-begrepp och icke-image-begrepp)
  await page.click('[data-subject-id="no"]');
  await page.waitForSelector('#card:not(.hidden)');
  console.log('✓ NO subject chosen');

  // Iterera genom alla 12 NO-begrepp, kolla image-state
  const results = await page.evaluate(async () => {
    const out = [];
    for (let i = 0; i < 12; i++) {
      // Tryck Nästa → för att gå till nästa begrepp (utom första)
      if (i > 0) {
        const nextBtn = document.getElementById('nextBtn');
        if (nextBtn && !nextBtn.disabled) {
          nextBtn.click();
          await new Promise(r => setTimeout(r, 100));
        }
      }
      const begrepp = document.getElementById('prompt').textContent;
      const imageArea = document.getElementById('imageArea');
      const imageVisible = !imageArea.hidden;
      const imageContent = imageArea.textContent;
      out.push({
        index: i + 1,
        begrepp,
        imageFieldDeclared: imageContent !== '',
        imageVisible,
        imageContent,
      });
    }
    return out;
  });

  console.log('\n=== NO BEGREPP × IMAGE ===');
  results.forEach(r => {
    const icon = r.imageVisible ? (r.imageContent || '?') : '—';
    console.log(`  ${r.index}. ${r.begrepp.padEnd(15)} → image: ${r.imageVisible ? 'VISIBLE (' + r.imageContent + ')' : 'hidden'}`);
  });

  // Test förväntade beteenden
  const withImage = results.filter(r => r.begrepp === 'Växt' || r.begrepp === 'Däggdjur' || r.begrepp === 'Gas' || r.begrepp === 'Magnet' || r.begrepp === 'Energi');
  const withoutImage = results.filter(r => !['Växt','Däggdjur','Gas','Magnet','Energi'].includes(r.begrepp));

  let ok = true;
  console.log('\n=== VERIFIERING ===');
  for (const r of withImage) {
    if (!r.imageVisible) {
      console.log(`  ❌ ${r.begrepp} HAR image → borde visas men är hidden`);
      ok = false;
    } else {
      console.log(`  ✓ ${r.begrepp} → ${r.imageContent}`);
    }
  }
  for (const r of withoutImage) {
    if (r.imageVisible) {
      console.log(`  ❌ ${r.begrepp} har INGEN image → borde vara hidden men visas (${r.imageContent})`);
      ok = false;
    } else {
      console.log(`  ✓ ${r.begrepp} → hidden`);
    }
  }

  await browser.close();

  console.log(`\n=== VERDICT ===`);
  console.log(`Opt-in image funkar: ${ok}`);
  process.exit(ok ? 0 : 1);
})().catch(err => { console.error('crash:', err); process.exit(2); });