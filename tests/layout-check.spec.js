/**
 * layout-check.spec.js — Verify paper-app-toggle stacks UNDER forward/reverse.
 *
 * Spelar in headless mot live-sajten (eller localhost om START_URL är satt).
 * Mäter rect av forward/reverse-knapparna vs paper-app-toggle i båda lägena.
 * Skriver ut stacked_vertically + sparar screenshot.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const START_URL = process.env.START_URL || 'http://localhost:8765/';
const SHOT_PATH = process.env.SHOT_PATH || '/tmp/begrepp-layout.png';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 414, height: 800 },  // iPhone-ish
    serviceWorkers: 'block',  // bypass SW cache for testing latest
  });
  const page = await context.newPage();

  page.on('console', msg => console.log('[browser]', msg.type(), msg.text()));
  page.on('pageerror', err => console.error('[browser pageerror]', err.message));

  console.log('Loading', START_URL);
  await page.goto(START_URL, { waitUntil: 'networkidle' });

  // Wait for subject picker
  await page.waitForSelector('#subjectPicker:not(.hidden)', { timeout: 10000 });
  console.log('✓ Subject picker rendered');

  // Click Historia
  await page.click('[data-subject-id="historia"]');
  await page.waitForSelector('#card:not(.hidden)', { timeout: 5000 });
  console.log('✓ Historia selected, card visible');

  // Inspect FORWARD mode (default)
  const forwardState = await page.evaluate(() => {
    const paper = document.getElementById('paperAppToggle');
    const fwd = document.getElementById('modeForwardBtn');
    const rev = document.getElementById('modeReverseBtn');
    return {
      paper: {
        hiddenAttr: paper.hasAttribute('hidden'),
        display: getComputedStyle(paper).display,
        visibility: getComputedStyle(paper).visibility,
        rect: paper.getBoundingClientRect().toJSON(),
      },
      forwardBtn: { rect: fwd.getBoundingClientRect().toJSON() },
      reverseBtn: { rect: rev.getBoundingClientRect().toJSON() },
    };
  });
  console.log('\n=== FORWARD MODE ===');
  console.log(JSON.stringify(forwardState, null, 2));

  // Switch to REVERSE
  await page.click('#modeReverseBtn');
  await page.waitForTimeout(300);

  const reverseState = await page.evaluate(() => {
    const paper = document.getElementById('paperAppToggle');
    const fwd = document.getElementById('modeForwardBtn');
    const rev = document.getElementById('modeReverseBtn');
    const headerEl = document.querySelector('header');
    return {
      paper: {
        hiddenAttr: paper.hasAttribute('hidden'),
        display: getComputedStyle(paper).display,
        visibility: getComputedStyle(paper).visibility,
        rect: paper.getBoundingClientRect().toJSON(),
        offsetParent: paper.offsetParent?.tagName,
        computedMargin: getComputedStyle(paper).margin,
        computedWidth: getComputedStyle(paper).width,
        nextSibling: paper.nextElementSibling?.id || paper.nextElementSibling?.className,
        parentTag: paper.parentElement?.tagName,
        parentDisplay: getComputedStyle(paper.parentElement).display,
      },
      forwardBtn: { rect: fwd.getBoundingClientRect().toJSON() },
      reverseBtn: { rect: rev.getBoundingClientRect().toJSON() },
      headerRect: headerEl.getBoundingClientRect().toJSON(),
    };
  });
  console.log('\n=== REVERSE MODE ===');
  console.log(JSON.stringify(reverseState, null, 2));

  // Stacking check
  const stacked = reverseState.paper.rect.top >= reverseState.reverseBtn.rect.bottom - 5;
  const visible = reverseState.paper.display !== 'none';
  console.log('\n=== VERDICT ===');
  console.log('paper-app-toggle visible:', visible, '  display:', reverseState.paper.display);
  console.log('forward btn bottom:', reverseState.forwardBtn.rect.bottom);
  console.log('reverse btn bottom:', reverseState.reverseBtn.rect.bottom);
  console.log('paper rect top:    ', reverseState.paper.rect.top);
  console.log('STACKED VERTICALLY under forward/reverse:', stacked);

  // Screenshot
  await page.screenshot({ path: SHOT_PATH, fullPage: true });
  console.log('\nScreenshot saved:', SHOT_PATH, '(' + fs.statSync(SHOT_PATH).size + ' bytes)');

  await browser.close();

  // Exit code
  process.exit(stacked && visible ? 0 : 1);
})().catch(err => {
  console.error('Test crashed:', err);
  process.exit(2);
});