// A short beep made with WebAudio, so the extension ships no sound file, and a chime that beeps once per new state.
import { logError } from '../core/log';

let audio: AudioContext | undefined;

/** Plays a short tone. Browsers allow sound once the player interacted with the page, which opening a window is. */
export function playTone(): void {
  try {
    if (typeof AudioContext === 'undefined') return;
    audio ??= new AudioContext();
    if (audio.state === 'suspended') audio.resume().catch(() => {});
    const start = audio.currentTime;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.2, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.25);
    osc.connect(gain).connect(audio.destination);
    osc.start(start);
    osc.stop(start + 0.26);
  } catch (error) {
    logError('playing a tone failed', error);
  }
}

export interface Chime {
  /** beeps unless `key` is the one of the last ring; `audible` false only remembers the key */
  ring(key: string, audible?: boolean): void;
  /** forgets the last key, so the next ring beeps whatever it is */
  reset(): void;
}

/** A chime that stays silent for the same key as last time, so a redraw of the same state does not beep again. */
export function createChime(tone: () => void = playTone): Chime {
  let last: string | undefined;
  return {
    ring(key, audible = true) {
      if (audible && key !== last) tone();
      last = key;
    },
    reset() {
      last = undefined;
    },
  };
}
