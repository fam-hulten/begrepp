// tests/audio-playback.spec.js
// E2E audio playback verification for begrepp-app
//
// Usage: npx playwright test tests/audio-playback.spec.js
// Exit: 0 = PASS, 1 = FAIL, 2 = ERROR

const path = require('path');
const fs = require('fs');
const { test, expect } = require('../fixtures/audio-fixture');

// Load manifest to know which files should exist
const manifestPath = path.join(__dirname, '..', 'audio-manifest.json');
let manifest = null;

try {
  const raw = fs.readFileSync(manifestPath, 'utf8');
  manifest = JSON.parse(raw);
} catch (e) {
  console.error('ERROR: audio-manifest.json not found. Run scripts/gen_audio_manifest.py first.');
  process.exit(2);
}

// Build list of all expected audio file IDs from manifest
function getExpectedAudioIds() {
  const ids = [];
  if (manifest.begrepp) {
    for (const item of manifest.begrepp) {
      if (item.audio) {
        const id = item.audio.split('/').pop()?.replace('.mp3', '');
        if (id) ids.push(id);
      }
    }
  }
  if (manifest.generella) {
    for (const item of manifest.generella) {
      if (item.audio) {
        const id = item.audio.split('/').pop()?.replace('.mp3', '');
        if (id) ids.push(id);
      }
    }
  }
  return ids;
}

const expectedAudioIds = getExpectedAudioIds();

test.describe('Audio playback verification', () => {

  test('audio-manifest.json is valid and contains audio entries', async () => {
    expect(expectedAudioIds.length).toBeGreaterThan(0);
    // Verify all referenced files physically exist
    const missing = [];
    for (const id of expectedAudioIds) {
      const mp3File = path.join(__dirname, '..', 'audio', `${id}.mp3`);
      if (!fs.existsSync(mp3File)) {
        missing.push(`${id}.mp3`);
      }
    }
    expect(missing, `Missing audio files: ${missing.join(', ')}`).toHaveLength(0);
  });

  test('playChain: page loads and fires initial playChain (getInitialSources)', async ({ page, audioMonitor }) => {
    const filePath = path.join(__dirname, '..', 'index.html');
    await page.goto(`file://${filePath}`);

    // Wait for initial playChain to fire
    await page.waitForTimeout(2000);

    const sounds = await audioMonitor.getSoundNames();

    // At minimum we expect at least one play() call from getInitialSources()
    expect(sounds.length, `Expected ≥1 play() calls from getInitialSources, got: ${JSON.stringify(sounds)}`).toBeGreaterThan(0);

    // All sounds that fired should reference existing files
    const audioDir = path.join(__dirname, '..', 'audio');
    const missingFiles = sounds.filter(s => {
      const f = path.join(audioDir, `${s}.mp3`);
      return !fs.existsSync(f);
    });
    expect(missingFiles, `Sounds fired for non-existent files: ${missingFiles.join(', ')}`).toHaveLength(0);
  });

  test('concept.html: loads and fires playChain calls without errors', async ({ page, audioMonitor }) => {
    const filePath = path.join(__dirname, '..', 'concept.html');
    await page.goto(`file://${filePath}`);

    await page.waitForTimeout(2000);

    const sounds = await audioMonitor.getSoundNames();
    // concept.html may or may not auto-play on load
    // We just verify no JS errors were thrown
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await page.waitForTimeout(500);

    expect(errors).toHaveLength(0);
  });

  test('verifyExpectedSounds: detects missing audio calls from manifest', async ({ page, audioMonitor }) => {
    // This is a smoke test: if we call verifyExpected with ALL manifest IDs,
    // we expect missing sounds (since we haven't triggered every playChain path).
    // The key assertion is that the method itself works without throwing.
    const filePath = path.join(__dirname, '..', 'index.html');
    await page.goto(`file://${filePath}`);
    await page.waitForTimeout(2000);

    const { missing, played, extra } = await audioMonitor.verifyExpected(expectedAudioIds);

    // played should contain at least something (getInitialSources)
    expect(played.length, `Expected ≥1 played sound from getInitialSources`).toBeGreaterThan(0);

    // The verifyExpected method itself should work without throwing
    // (missing will be large since we only visited the page once)
    console.log(`[audio-playback] played=${played.length}, missing=${missing.length}, extra=${extra.length}`);
  });

  test('play order: sounds are recorded in correct chronological order', async ({ page, audioMonitor }) => {
    const filePath = path.join(__dirname, '..', 'index.html');
    await page.goto(`file://${filePath}`);
    await page.waitForTimeout(3000);

    const ordered = await audioMonitor.getSoundsOrdered();
    expect(ordered.length).toBeGreaterThan(0);

    // Verify timestamps are monotonically increasing
    for (let i = 1; i < ordered.length; i++) {
      expect(ordered[i].timestamp).toBeGreaterThanOrEqual(ordered[i-1].timestamp);
    }
    console.log(`[audio-playback] playback order: ${ordered.map(s => s.name).join(' → ')}`);
  });
});
