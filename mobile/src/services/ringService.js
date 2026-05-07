/**
 * RingService — caller ringback tone + callee ringtone
 *
 * Native: expo-av loops a bundled ring.wav (440+480 Hz, 2s on / 4s off)
 *         and adds a vibration pattern alongside.
 * Web   : AudioContext oscillators (no files needed)
 */
import { Platform, Vibration } from 'react-native';
import { Audio } from 'expo-av';

class RingService {
  constructor() {
    this._ringing = false;
    this._timer = null;
    this._gen = 0;         // incremented on each stopAll() to invalidate stale callbacks
    this._audioCtx = null;
    this._sound = null;
  }

  // ─── Web Audio helpers ────────────────────────────────────────────

  _ctx() {
    if (Platform.OS !== 'web') return null;
    if (!this._audioCtx) {
      // eslint-disable-next-line no-undef
      this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this._audioCtx.state === 'suspended') {
      this._audioCtx.resume();
    }
    return this._audioCtx;
  }

  /** Play two mixed sine tones for `duration` seconds starting at `when` */
  _tone(freq1, freq2, when, duration, gain = 0.25) {
    const ctx = this._ctx();
    if (!ctx) return;

    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0, when);
    gainNode.gain.linearRampToValueAtTime(gain, when + 0.01);
    gainNode.gain.setValueAtTime(gain, when + duration - 0.015);
    gainNode.gain.linearRampToValueAtTime(0, when + duration);
    gainNode.connect(ctx.destination);

    [freq1, freq2].forEach((freq) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.connect(gainNode);
      osc.start(when);
      osc.stop(when + duration);
    });
  }

  // ─── Native: bundled ring.wav playback ────────────────────────────

  async _playLoopedRingNative(volume = 1.0) {
    try {
      // Configure audio mode so the ring is audible even on iOS silent mode
      // and routed through the loud speaker on Android.
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: false,
      }).catch(() => {});
      const { sound } = await Audio.Sound.createAsync(
        require('../../assets/ring.wav'),
        { isLooping: true, volume, shouldPlay: true }
      );
      this._sound = sound;
    } catch (e) {
      // Fail quietly — vibration still gives feedback
      // eslint-disable-next-line no-console
      console.log('[ringService] sound load failed', e?.message || e);
    }
  }

  async _stopSound() {
    const s = this._sound;
    this._sound = null;
    if (!s) return;
    try { await s.stopAsync(); } catch {}
    try { await s.unloadAsync(); } catch {}
  }

  // ─── Ringback tone (caller hears while waiting) ───────────────────
  // Classic ring: 440 Hz + 480 Hz, 2 s on / 4 s off

  _ringbackCycle(gen) {
    if (!this._ringing || gen !== this._gen) return;
    const ctx = this._ctx();
    const now = ctx.currentTime;
    this._tone(440, 480, now, 2.0);
    this._timer = setTimeout(() => this._ringbackCycle(gen), 6000); // 2s + 4s
  }

  startRingback() {
    this.stopAll();
    this._ringing = true;
    const gen = ++this._gen;

    if (Platform.OS === 'web') {
      this._ringbackCycle(gen);
      return;
    }
    // Native: play the bundled ring.wav at a moderate volume + subtle haptic
    this._playLoopedRingNative(0.7);
    Vibration.vibrate([0, 200, 5800], true);
  }

  // ─── Ringtone (callee hears on incoming call) ─────────────────────
  // Double ring: 425 Hz + 452 Hz, (0.4 s on, 0.2 s off) × 2, then 3 s silence

  _ringtoneCycle(gen) {
    if (!this._ringing || gen !== this._gen) return;
    const ctx = this._ctx();
    const now = ctx.currentTime;
    // two quick bursts
    this._tone(425, 452, now, 0.4, 0.3);
    this._tone(425, 452, now + 0.6, 0.4, 0.3);
    this._timer = setTimeout(() => this._ringtoneCycle(gen), 3200);
  }

  startRingtone() {
    this.stopAll();
    this._ringing = true;
    const gen = ++this._gen;

    if (Platform.OS === 'web') {
      this._ringtoneCycle(gen);
      return;
    }
    // Native: louder ring for incoming + classic double-ring vibration
    this._playLoopedRingNative(1.0);
    Vibration.vibrate([0, 400, 200, 400, 3000], true);
  }

  // ─── Stop everything ──────────────────────────────────────────────

  stopAll() {
    this._ringing = false;
    this._gen++;   // invalidate any in-flight setTimeout callback
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    if (Platform.OS !== 'web') {
      Vibration.cancel();
      this._stopSound();
    } else if (this._audioCtx && this._audioCtx.state === 'running') {
      // Suspend (not close) so it can be reused quickly on next call
      this._audioCtx.suspend().catch(() => {});
    }
  }
}

export const ringService = new RingService();
