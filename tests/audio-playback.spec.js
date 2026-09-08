/**
 * audio-playback.spec.js — Playwright E2E test for begrepp-app audio playback.
 * 
 * Verifies audio sequences: forward instruction, forward reveal, reverse, no duplicates.
 * Run: npx playwright test tests/audio-playback.spec.js
 * Requires: Playwright 1.63.0+, begrepp repo at /home/node/.openclaw/repos/begrepp
 */

const { test, expect } = require('@playwright/test');
const { AudioMonitor } = require('./audio-fixture');
const path = require('path');

const BEGREPP_DIR = '/home/node/.openclaw/repos/begrepp';

test.describe('Begrepp audio playback', () => {
  let audioMonitor;

  test.beforeEach(async ({ page }) => {
    audioMonitor = new AudioMonitor();
    await audioMonitor.install(page);
    const filePath = path.join(BEGREPP_DIR, 'concept.html');
    await page.goto(`file://${filePath}`);
    await page.waitForSelector('#revealBtn:not([disabled])', { timeout: 5000 });
  });

  test('Forward mode: instr_forward audio plays on card render', async ({ page }) => {
    await audioMonitor.reset(page);
    await page.waitForTimeout(600);
    const sounds = await audioMonitor.getSounds(page);
    const forwardSounds = sounds.filter(s => s.name.includes('instr-forward'));
    expect(forwardSounds.length).toBeGreaterThan(0);
  });

  test('Forward reveal: forklaring audio plays after reveal click', async ({ page }) => {
    await audioMonitor.reset(page);
    await page.waitForTimeout(600);
    await page.click('#revealBtn');
    await page.waitForTimeout(1000);
    const sounds = await audioMonitor.getSounds(page);
    const forklaringSounds = sounds.filter(s => s.name.includes('forklaring'));
    const begreppSounds = sounds.filter(s => s.name.includes('begrepp'));
    expect(forklaringSounds.length).toBeGreaterThan(0);
    expect(begreppSounds.length).toBe(0);
  });

  test('Reverse reveal: begrepp audio plays after reveal', async ({ page }) => {
    await page.click('#modeReverseBtn');
    await page.waitForTimeout(500);
    await audioMonitor.reset(page);
    await page.click('#revealBtn');
    await page.waitForTimeout(1000);
    const sounds = await audioMonitor.getSounds(page);
    const begreppSounds = sounds.filter(s => s.name.includes('begrepp'));
    expect(begreppSounds.length).toBeGreaterThan(0);
  });

  test('No duplicate play() calls for same audio', async ({ page }) => {
    await audioMonitor.reset(page);
    for (let i = 0; i < 3; i++) {
      await page.waitForTimeout(600);
      if (await page.$('#revealBtn:not([disabled])')) {
        await page.click('#revealBtn');
        await page.waitForTimeout(200);
        await page.click('#rattBtn');
        await page.waitForTimeout(300);
      }
    }
    const sounds = await audioMonitor.getSounds(page);
    const duplicates = [];
    for (let i = 1; i < sounds.length; i++) {
      if (sounds[i].name === sounds[i - 1].name &&
          sounds[i].timestamp - sounds[i - 1].timestamp < 100) {
        duplicates.push(sounds[i].name);
      }
    }
    expect(duplicates).toHaveLength(0);
  });
});
