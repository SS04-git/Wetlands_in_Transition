// Optional sound: smooth and calm, made in the browser (no audio files and no noise). Off until
// the visitor turns it on with the switch. Only pure, soft tones:
//   - a warm, open major chord that breathes slowly and drifts, every twenty seconds or so, to
//     another bright chord and back (never minor, never detuned, so it stays settled and light);
//   - once in a while a single soft high note from the same key, swelling in and fading away,
//     like light on water.
// Nothing sudden: every change takes seconds. Inside a tunnel the sound is softened, as if
// underwater.

// C major, kept in a warm middle register: C, F, C again, then G with C held (resolving home)
const CHORDS = [
  [130.81, 196.0, 261.63, 329.63],   // C  G  C  E
  [174.61, 220.0, 261.63, 349.23],   // F  A  C  F
  [130.81, 196.0, 293.66, 329.63],   // C  G  D  E (open, airy)
  [196.0, 261.63, 293.66, 392.0],    // G  C  D  G (suspended, settles back to C)
];
const NOTES = [523.25, 587.33, 659.25, 783.99, 880.0];   // C D E G A: the major pentatonic, high

export class Ambience {
  constructor() { this.on = false; this.ctx = null; this.chord = 0; this.nextChord = 0; this.nextNote = 0; }

  build() {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const master = ctx.createGain(); master.gain.value = 0;
    const soft = ctx.createBiquadFilter(); soft.type = 'lowpass'; soft.frequency.value = 2400; soft.Q.value = 0.2;
    soft.connect(master); master.connect(ctx.destination);
    // the chord: four pure sine voices, each breathing at its own slow pace
    this.voices = CHORDS[0].map((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain(), sway = ctx.createOscillator(), swayD = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.value = [0.2, 0.15, 0.11, 0.08][i];
      sway.frequency.value = 0.04 + i * 0.013; swayD.gain.value = g.gain.value * 0.45;
      sway.connect(swayD); swayD.connect(g.gain); sway.start();
      o.connect(g); g.connect(soft); o.start();
      return o;
    });
    Object.assign(this, { ctx, master, soft });
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend(); else if (this.on) this.ctx.resume();
    });
  }

  /** Turn the sound on or off (from a click, so the browser allows audio). Returns the new state. */
  toggle() {
    this.on = !this.on;
    if (this.on && !this.ctx) this.build();
    if (!this.ctx) return this.on;
    const now = this.ctx.currentTime;
    if (this.on) this.ctx.resume();
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(this.on ? 0.28 : 0, now, 1.8);   // fades in slowly
    if (this.on) { this.nextChord = now + 20; this.nextNote = now + 6; }
    return this.on;
  }

  /** One soft high note that swells in and fades, with its octave very faintly above. */
  note(now) {
    const { ctx } = this;
    const f = NOTES[Math.floor(Math.random() * NOTES.length)];
    const o = ctx.createOscillator(), g = ctx.createGain();
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.05, now + 1.2);          // a slow swell, no strike
    g.gain.setTargetAtTime(0, now + 1.4, 1.1);                // then a long, gentle fade
    o.connect(g);
    if (pan) { pan.pan.value = Math.random() * 1.0 - 0.5; g.connect(pan); pan.connect(this.soft); } else g.connect(this.soft);
    o.start(now); o.stop(now + 7);
  }

  /** The same calm sound throughout; softened inside the tunnels. */
  update(S) {
    if (!this.ctx || !this.on) return;
    const now = this.ctx.currentTime;
    const tp = (S.tunnel ?? 0) - Math.floor(S.tunnel ?? 0);
    const inTunnel = tp > 0.001 && tp < 0.999 ? Math.sin(Math.PI * tp) : 0;
    this.soft.frequency.setTargetAtTime(2400 - 1700 * inTunnel, now, 0.5);
    // move to the next chord, gliding over a few seconds
    if (now > this.nextChord) {
      this.chord = (this.chord + 1) % CHORDS.length;
      CHORDS[this.chord].forEach((f, i) => this.voices[i].frequency.setTargetAtTime(f, now, 2.5));
      this.nextChord = now + 18 + Math.random() * 6;
    }
    if (now > this.nextNote) {
      if (inTunnel < 0.3) this.note(now);
      this.nextNote = now + 9 + Math.random() * 9;
    }
  }
}
