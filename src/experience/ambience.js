// Optional sound, off until the visitor turns it on with the switch. It follows the journey:
//   - in space: a calm, deep chord of pure tones that breathes very slowly (made in the browser);
//   - through the clouds: a soft, low rush of air as the camera flies down through them;
//   - at Kundapur: the recording of nature (assets/audio), looped, fading in as the clouds open
//     over the estuary and out again when the story leaves through the clouds at the end.
// Every change is a slow crossfade, and inside the tunnels everything is softened, as if
// underwater.

const NATURE_URL = '/assets/audio/freesound_community-backyard-nature-14737.mp3';
// a deep, open chord: D, A, D, E, F sharp (D major with an added ninth), never minor
const SPACE = [73.42, 110.0, 146.83, 164.81, 185.0];

export class Ambience {
  constructor() { this.on = false; this.ctx = null; this.nature = null; }

  build() {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const master = ctx.createGain(); master.gain.value = 0;
    const soften = ctx.createBiquadFilter(); soften.type = 'lowpass'; soften.frequency.value = 18000; soften.Q.value = 0.2;
    soften.connect(master); master.connect(ctx.destination);

    // space: pure sine voices, each swelling and settling at its own slow pace
    const spaceBus = ctx.createGain(); spaceBus.gain.value = 0;
    const spaceTone = ctx.createBiquadFilter(); spaceTone.type = 'lowpass'; spaceTone.frequency.value = 1200;
    spaceBus.connect(spaceTone); spaceTone.connect(soften);
    SPACE.forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), depth = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.value = [0.26, 0.2, 0.14, 0.09, 0.07][i];
      lfo.frequency.value = 0.025 + i * 0.011; depth.gain.value = g.gain.value * 0.5;
      lfo.connect(depth); depth.connect(g.gain); lfo.start();
      o.connect(g); g.connect(spaceBus); o.start();
    });

    // the clouds: a deep, rounded rush of air (low frequencies only, so it is smooth, not hissy)
    const len = ctx.sampleRate * 6, buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch); let last = 0;
      for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
      const x = ctx.sampleRate * 0.5;
      for (let i = 0; i < x; i++) { const k = i / x; d[i] = d[i] * k + d[len - x + i] * (1 - k); }
    }
    const air = ctx.createBufferSource(); air.buffer = buf; air.loop = true; air.start();
    const airTone = ctx.createBiquadFilter(); airTone.type = 'lowpass'; airTone.frequency.value = 520; airTone.Q.value = 0.3;
    const airBus = ctx.createGain(); airBus.gain.value = 0;
    air.connect(airTone); airTone.connect(airBus); airBus.connect(soften);

    // Kundapur: the nature recording, loaded when the sound is first turned on
    const natureBus = ctx.createGain(); natureBus.gain.value = 0; natureBus.connect(soften);
    fetch(NATURE_URL).then((r) => r.arrayBuffer()).then((a) => ctx.decodeAudioData(a)).then((b) => {
      const s = ctx.createBufferSource(); s.buffer = b; s.loop = true;
      // skip the very ends of the file, so the loop has no click
      s.loopStart = Math.min(0.05, b.duration / 10); s.loopEnd = Math.max(s.loopStart + 1, b.duration - 0.05);
      s.connect(natureBus); s.start(0, s.loopStart);
      this.nature = s;
    }).catch((e) => console.warn('Nature sound could not be loaded', e));

    Object.assign(this, { ctx, master, soften, spaceBus, airBus, airTone, natureBus });
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
    this.master.gain.setTargetAtTime(this.on ? 0.7 : 0, now, 1.5);   // fades in slowly
    return this.on;
  }

  /** Follow the journey: space, then the clouds, then Kundapur's nature; softened in tunnels. */
  update(S) {
    if (!this.ctx || !this.on) return;
    const now = this.ctx.currentTime;
    const clouds = Math.min(1, S.cloudOp ?? 0);
    // at Kundapur once the estuary is there and the clouds have opened
    const here = Math.min(1, S.estuary ?? 0) * (1 - clouds);
    const tp = (S.tunnel ?? 0) - Math.floor(S.tunnel ?? 0);
    const inTunnel = tp > 0.001 && tp < 0.999 ? Math.sin(Math.PI * tp) : 0;
    this.spaceBus.gain.setTargetAtTime(0.3 * (1 - here) * (1 - 0.5 * clouds), now, 1.5);
    this.airBus.gain.setTargetAtTime(0.5 * clouds, now, 0.8);
    this.airTone.frequency.setTargetAtTime(380 + 260 * clouds, now, 0.8);   // the rush opens a little in the thick of the clouds
    this.natureBus.gain.setTargetAtTime(0.85 * here, now, 2.0);
    this.soften.frequency.setTargetAtTime(18000 - 17200 * inTunnel, now, 0.4);
  }
}
