/**
 * no13-images-check.spec.js — Verifiera att de 13 NO-bildfilerna (urskog, naturreservat,
 * mycel, allemansratt, atervinna, nationalpark, odlad-skog, palrot, daeggdjur,
 * vaxtatare, rovdjur, bytesdjur, nedbrytare) laddas korrekt och visas för rätt
 * begrepp. Och att kretslopp/naringskedja/vintergron INTE har någon bild.
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const START_URL = process.env.START_URL || 'http://localhost:8765/';
const REPO_ROOT = path.resolve(__dirname, '..');

const WITH_IMAGE = [
  'urskog', 'naturreservat', 'mycel', 'allemansratt', 'atervinna',
  'nationalpark', 'odlad-skog', 'palrot', 'daeggdjur', 'vaxtatare',
  'rovdjur', 'bytesdjur', 'nedbrytare'
];
const WITHOUT_IMAGE = ['kretslopp', 'naringskedja', 'vintergron'];

(async () => {
  // 1. Verifiera att alla 13 filer finns på disk
  console.log('=== FILER PÅ DISK ===');
  for (const id of WITH_IMAGE) {
    const p = path.join(REPO_ROOT, 'images', `${id === 'daeggdjur' ? 'daggdjur' : id}.png`);
    const exists = fs.existsSync(p);
    const size = exists ? fs.statSync(p).size : 0;
    console.log(`  ${exists ? '✓' : '✗'} images/${id === 'daeggdjur' ? 'daggdjur' : id}.png (${size} bytes)`);
    if (!exists || size < 5000) process.exit(2);
  }

  // 2. Starta browser, hämta alla NO-begrepp, kontrollera imageArea
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 414, height: 800 },
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  page.on('pageerror', err => console.error('pageerror:', err.message));
  const failedRequests = [];
  page.on('requestfailed', req => failedRequests.push(req.url()));

  console.log('\n=== LADDAR APP ===');
  await page.goto(START_URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('#subjectPicker:not(.hidden)', { timeout: 10000 });
  await page.click('[data-subject-id="no"]');
  await page.waitForSelector('#card:not(.hidden)');

  // Hämta alla 16 NO-begrepp i en evaluate (skippa rendering via Nästa-knappen)
  const results = await page.evaluate(async () => {
    const out = [];
    const all = ['urskog','naringskedja','naturreservat','mycel','allemansratt','atervinna','nationalpark','odlad-skog','palrot','daeggdjur','kretslopp','vintergron','nedbrytare','bytesdjur','vaxtatare','rovdjur'];
    for (let i = 0; i < all.length; i++) {
      if (i > 0) {
        const nextBtn = document.getElementById('nextBtn');
        if (nextBtn && !nextBtn.disabled) {
          nextBtn.click();
          await new Promise(r => setTimeout(r, 80));
        }
      }
      const prompt = document.getElementById('prompt');
      const imageArea = document.getElementById('imageArea');
      const begreppName = prompt ? prompt.textContent.trim() : null;
      const visible = imageArea ? !imageArea.hidden : false;
      const img = imageArea ? imageArea.querySelector('img') : null;
      const src = img ? img.getAttribute('src') : null;
      const naturalWidth = img ? img.naturalWidth : 0;
      out.push({ id: all[i], begreppName, visible, src, naturalWidth });
    }
    return out;
  });

  console.log('\n=== NO BEGREPP × IMAGE ===');
  let ok = true;
  for (const r of results) {
    const expectedWithImage = WITH_IMAGE.includes(r.id);
    const expectedFileName = r.id === 'daeggdjur' ? 'dagg Djur' : r.id;
    const fileName = r.id === 'daeggdjur' ? 'daggdjur.png' : `${r.id}.png`;

    if (expectedWithImage) {
      // Begreppet SKA ha image
      if (r.visible && r.src && r.src.includes(fileName)) {
        console.log(`  ✓ ${r.id.padEnd(15)} → visible, src=${r.src}, loaded (${r.naturalWidth}px wide)`);
      } else {
        console.log(`  ❌ ${r.id.padEnd(15)} → visible=${r.visible}, src=${r.src} (borde ha image/${fileName})`);
        ok = false;
      }
    } else {
      // Begreppet SKA INTE ha image
      if (!r.visible) {
        console.log(`  ✓ ${r.id.padEnd(15)} → hidden (korrekt pausiert)`);
      } else {
        console.log(`  ❌ ${r.id.padEnd(15)} → VISIBLE (borde vara hidden, src=${r.src})`);
        ok = false;
      }
    }
  }

  if (failedRequests.length) {
    console.log('\n=== MISSA REQUEST ===');
    failedRequests.forEach(u => console.log(`  ${u}`));
    ok = false;
  }

  await browser.close();
  console.log(`\n=== VERDICT ===`);
  console.log(`13 bilder OK: ${ok}`);
  process.exit(ok ? 0 : 1);
})().catch(err => { console.error('crash:', err); process.exit(2); });