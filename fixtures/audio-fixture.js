// fixtures/audio-fixture.js
// AudioMonitor for Playwright — intercepts HTMLAudioElement.prototype.play
// Based on Kazi Dev Blog (2026-01-02): https://kazi-dev-blog.vercel.app/blogs/playwright-sounds-test

const { test as base } = require('@playwright/test');

class AudioMonitor {
  constructor(page) {
    this.page = page;
  }

  /** Inject monkey-patch into page context. Call once before test runs. */
  async start() {
    await this.page.addInitScript(() => {
      window.__soundsPlayed = [];

      // Patch HTMLAudioElement.prototype.play
      const originalPlay = HTMLAudioElement.prototype.play;
      HTMLAudioElement.prototype.play = function (...args) {
        const src = this.src || '';
        const name = src.split('/').pop()?.split('.')[0] || 'unknown';
        window.__soundsPlayed.push({
          name,
          src,
          type: 'HTMLAudio',
          timestamp: Date.now(),
        });
        return originalPlay.apply(this, args).catch(() => {
          // Swallow autoplay errors — we only care about call tracking
        });
      };

      // Patch AudioBufferSourceNode.prototype.start (Web Audio API)
      const originalStart = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (...args) {
        const name = this.__audioName || `buffer_${this.buffer?.length || 'unknown'}`;
        window.__soundsPlayed.push({
          name,
          type: 'WebAudio',
          timestamp: Date.now(),
        });
        return originalStart.apply(this, args);
      };
    });
  }

  /** Get list of sound names played so far. */
  async getSounds() {
    return this.page.evaluate(() => window.__soundsPlayed || []);
  }

  /** Get names only (convenience). */
  async getSoundNames() {
    const sounds = await this.getSounds();
    return sounds.map(s => s.name);
  }

  /** Verify that all expected sounds were played. */
  async verifyExpected(expectedSounds) {
    const played = await this.getSoundNames();
    const missing = expectedSounds.filter(s => !played.includes(s));
    const extra = played.filter(s => !expectedSounds.includes(s));
    return { played, missing, extra };
  }

  /** Get sounds in playback order (by timestamp). */
  async getSoundsOrdered() {
    const sounds = await this.getSounds();
    return sounds.sort((a, b) => a.timestamp - b.timestamp);
  }
}

// Extend Playwright base test to include audioMonitor fixture
const test = base.extend({
  audioMonitor: async ({ page }, use) => {
    const monitor = new AudioMonitor(page);
    await monitor.start();
    await use(monitor);
  },
});

module.exports = { test, AudioMonitor };
