/**
 * AudioMonitor — Playwright fixture for headless audio interception.
 * Monkey-patches HTMLAudioElement.prototype.play to capture all audio events.
 * 
 * Usage:
 *   const { audioMonitor } = await import('./audio-fixture.js');
 *   await audioMonitor.install(page);
 *   // ... interact with page ...
 *   const missing = audioMonitor.verifyExpectedSounds(['manniskor-instr-forward', 'manniskor-forklaring']);
 *   console.log(missing); // [] = all found
 */
class AudioMonitor {
  constructor() {
    this.sounds = [];
  }

  /** Install the monkey-patch into the page context. */
  async install(page) {
    await page.addInitScript(() => {
      window.__audioMonitor = { sounds: [] };
      const origPlay = HTMLAudioElement.prototype.play;
      HTMLAudioElement.prototype.play = function (...args) {
        const soundName = (this.src || '').split('/').pop()?.split('.')[0] || 'unknown';
        window.__audioMonitor.sounds.push({ name: soundName, src: this.src, timestamp: Date.now() });
        return origPlay.apply(this, args);
      };
    });
  }

  /** Clear recorded sounds (call before each test step). */
  async reset(page) {
    await page.evaluate(() => { window.__audioMonitor.sounds = []; });
    this.sounds = [];
  }

  /** Get all recorded sounds from the page. */
  async getSounds(page) {
    return await page.evaluate(() => window.__audioMonitor.sounds);
  }

  /**
   * Verify that all expected sound names were played.
   * @returns {string[]} missing sounds (empty array = all found)
   */
  async verifyExpectedSounds(expectedNames, page) {
    const sounds = await this.getSounds(page);
    const played = sounds.map(s => s.name);
    return expectedNames.filter(name => !played.includes(name));
  }

  /** Assert all expected sounds played, throw on mismatch. */
  async assertSounds(expectedNames, page, context = '') {
    const missing = await this.verifyExpectedSounds(expectedNames, page);
    if (missing.length > 0) {
      const played = (await this.getSounds(page)).map(s => s.name);
      throw new Error(
        `${context}\nExpected: ${expectedNames.join(', ')}\nPlayed: ${played.join(', ')}\nMissing: ${missing.join(', ')}`
      );
    }
  }
}

module.exports = { AudioMonitor };
