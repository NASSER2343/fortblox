export type SoundKind =
  | 'shoot_ar'
  | 'shoot_smg'
  | 'shoot_pump'
  | 'shoot_tac'
  | 'shoot_sniper'
  | 'pickaxe_swing'
  | 'pickaxe_hit'
  | 'hit'
  | 'shieldBreak'
  | 'reload'
  | 'step'
  | 'whiz'
  | 'chest'
  | 'pirate'
  | 'heal'
  | 'drop'
  | 'glider'
  | 'bus_horn'
  | 'break'
  | 'ping'
  | 'victory'
  | 'defeat';

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private volume = 0.7;
  private muted = false;

  // Spatial Storm Audio graph nodes
  private stormWindGain: GainNode | null = null;
  private stormHumGain: GainNode | null = null;
  private stormFilter: BiquadFilterNode | null = null;
  private stormPanner: StereoPannerNode | null = null;
  private stormCrackleTimer = 0;

  public setVolume(vol: number, muted: boolean): void {
    this.volume = vol;
    this.muted = muted;
    if (this.muted || this.volume <= 0) {
      this.silenceStormAudio();
    }
  }

  public unlock(): void {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      if (!this.ctx) {
        this.ctx = new AudioCtx();
        const len = this.ctx.sampleRate * 2;
        this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const data = this.noiseBuffer.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        this.initStormAudioGraph();
      }
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
    } catch {
      // AudioContext unavailable in headless/restricted environments
    }
  }

  private initStormAudioGraph(): void {
    if (!this.ctx || !this.noiseBuffer || this.stormWindGain) return;
    const ctx = this.ctx;

    const windSrc = ctx.createBufferSource();
    windSrc.buffer = this.noiseBuffer;
    windSrc.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 340;
    filter.Q.value = 1.4;

    const windGain = ctx.createGain();
    windGain.gain.value = 0;

    const humOsc = ctx.createOscillator();
    humOsc.type = 'sawtooth';
    humOsc.frequency.value = 56;
    const humFilter = ctx.createBiquadFilter();
    humFilter.type = 'lowpass';
    humFilter.frequency.value = 140;
    const humGain = ctx.createGain();
    humGain.gain.value = 0;

    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;

    windSrc.connect(filter);
    filter.connect(windGain);
    humOsc.connect(humFilter);
    humFilter.connect(humGain);

    if (panner) {
      windGain.connect(panner);
      humGain.connect(panner);
      panner.connect(ctx.destination);
    } else {
      windGain.connect(ctx.destination);
      humGain.connect(ctx.destination);
    }

    windSrc.start();
    humOsc.start();

    this.stormWindGain = windGain;
    this.stormHumGain = humGain;
    this.stormFilter = filter;
    this.stormPanner = panner;
  }

  public silenceStormAudio(): void {
    if (!this.ctx || !this.stormWindGain || !this.stormHumGain) return;
    const now = this.ctx.currentTime;
    this.stormWindGain.gain.setTargetAtTime(0, now, 0.08);
    this.stormHumGain.gain.setTargetAtTime(0, now, 0.08);
  }

  public updateStormAudio(
    dt: number,
    intensity: number,
    pan: number,
    insideStorm: boolean,
    active: boolean,
  ): void {
    if (!this.ctx || !this.stormWindGain || !this.stormHumGain || !this.stormFilter) return;
    if (!active || this.muted || this.volume <= 0 || intensity <= 0.01) {
      this.silenceStormAudio();
      return;
    }

    const now = this.ctx.currentTime;
    const clamped = Math.max(0, Math.min(1, intensity));
    const windVol = clamped * (insideStorm ? 0.38 : 0.16) * this.volume;
    const humVol = clamped * (insideStorm ? 0.16 : 0.05) * this.volume;
    const cutoff = 280 + clamped * (insideStorm ? 1550 : 620);

    this.stormWindGain.gain.setTargetAtTime(windVol, now, 0.09);
    this.stormHumGain.gain.setTargetAtTime(humVol, now, 0.09);
    this.stormFilter.frequency.setTargetAtTime(cutoff, now, 0.1);
    if (this.stormPanner) {
      this.stormPanner.pan.setTargetAtTime(Math.max(-0.95, Math.min(0.95, pan)), now, 0.08);
    }

    if (insideStorm && clamped > 0.45) {
      this.stormCrackleTimer -= dt;
      if (this.stormCrackleTimer <= 0) {
        this.stormCrackleTimer = 0.55 + Math.random() * 0.9;
        this.playSpatialNoise(0.08, 3400 + Math.random() * 1400, 'highpass', 0.09 * clamped, pan);
      }
    }
  }

  private playSpatialNoise(
    duration: number,
    freq: number,
    type: BiquadFilterType,
    vol: number,
    pan: number,
  ): void {
    if (!this.ctx || !this.noiseBuffer || this.muted || this.volume <= 0) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(this.effectiveVol(vol), now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    src.connect(filter);
    filter.connect(gain);
    if (this.ctx.createStereoPanner) {
      const panner = this.ctx.createStereoPanner();
      panner.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), now);
      gain.connect(panner);
      panner.connect(this.ctx.destination);
    } else {
      gain.connect(this.ctx.destination);
    }
    src.start(now);
    src.stop(now + duration + 0.02);
  }

  private effectiveVol(base: number): number {
    if (this.muted) return 0;
    return Math.max(0.0001, base * this.volume);
  }

  private playNoise(duration: number, freq: number, type: BiquadFilterType, vol: number, delay = 0): void {
    if (!this.ctx || !this.noiseBuffer || this.muted || this.volume <= 0) return;
    const now = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq * (0.92 + Math.random() * 0.16), now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(this.effectiveVol(vol), now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    src.start(now);
    src.stop(now + duration + 0.02);
  }

  private playTone(
    type: OscillatorType,
    startFreq: number,
    endFreq: number,
    duration: number,
    vol: number,
    delay = 0,
  ): void {
    if (!this.ctx || this.muted || this.volume <= 0) return;
    const now = this.ctx.currentTime + delay;
    const pitchVar = 0.94 + Math.random() * 0.12;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(startFreq * pitchVar, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq * pitchVar), now + duration);

    gain.gain.setValueAtTime(this.effectiveVol(vol), now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  public play(kind: SoundKind): void {
    try {
      this.unlock();
      if (!this.ctx || this.muted || this.volume <= 0) return;

      switch (kind) {
        case 'shoot_ar':
          this.playNoise(0.14, 1800, 'bandpass', 0.32);
          this.playTone('sawtooth', 175, 48, 0.11, 0.22);
          this.playNoise(0.05, 4200, 'highpass', 0.12, 0.03);
          break;
        case 'shoot_smg':
          this.playNoise(0.09, 2500, 'bandpass', 0.24);
          this.playTone('square', 220, 75, 0.07, 0.15);
          break;
        case 'shoot_pump':
          this.playNoise(0.28, 950, 'lowpass', 0.52);
          this.playTone('triangle', 135, 30, 0.24, 0.42);
          this.playNoise(0.06, 3200, 'bandpass', 0.14, 0.28);
          this.playNoise(0.06, 2600, 'bandpass', 0.14, 0.38);
          break;
        case 'shoot_tac':
          this.playNoise(0.2, 1150, 'lowpass', 0.42);
          this.playTone('triangle', 150, 36, 0.17, 0.32);
          break;
        case 'shoot_sniper':
          this.playNoise(0.38, 2200, 'bandpass', 0.55);
          this.playTone('sawtooth', 360, 42, 0.28, 0.38);
          this.playNoise(0.45, 900, 'lowpass', 0.22, 0.08);
          break;
        case 'pickaxe_swing':
          this.playNoise(0.14, 1100, 'bandpass', 0.22);
          this.playTone('sine', 340, 140, 0.12, 0.12);
          break;
        case 'pickaxe_hit':
          this.playNoise(0.12, 850, 'lowpass', 0.32);
          this.playTone('triangle', 220, 72, 0.12, 0.26);
          break;
        case 'hit':
          this.playTone('sine', 1050, 720, 0.06, 0.22);
          break;
        case 'shieldBreak':
          this.playNoise(0.22, 4500, 'highpass', 0.35);
          this.playTone('triangle', 1400, 320, 0.18, 0.22);
          break;
        case 'reload':
          this.playNoise(0.05, 2800, 'bandpass', 0.16);
          this.playNoise(0.07, 2200, 'bandpass', 0.2, 0.35);
          break;
        case 'step':
          this.playNoise(0.05, 420, 'lowpass', 0.09);
          break;
        case 'whiz':
          this.playTone('sine', 950, 260, 0.11, 0.12);
          break;
        case 'chest':
          this.playNoise(0.28, 2100, 'bandpass', 0.14);
          [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) =>
            this.playTone('triangle', f, f * 1.015, 0.36, 0.2, i * 0.06),
          );
          break;
        case 'pirate':
          this.playTone('triangle', 196.0, 196.0, 0.72, 0.26);
          this.playNoise(0.36, 3200, 'bandpass', 0.16);
          [392.0, 493.88, 587.33, 783.99, 987.77, 1174.66].forEach((f, i) =>
            this.playTone('sine', f, f * 1.02, 0.56, 0.25, i * 0.075),
          );
          break;
        case 'heal':
          this.playTone('sine', 420, 880, 0.28, 0.18);
          break;
        case 'drop':
          this.playTone('triangle', 310, 160, 0.11, 0.16);
          this.playNoise(0.05, 900, 'lowpass', 0.12);
          break;
        case 'glider':
          this.playNoise(0.32, 720, 'bandpass', 0.24);
          this.playTone('sine', 240, 480, 0.22, 0.15);
          break;
        case 'bus_horn':
          this.playTone('sawtooth', 185, 180, 0.26, 0.16);
          this.playTone('sawtooth', 233, 228, 0.28, 0.14, 0.02);
          break;
        case 'break':
          this.playNoise(0.22, 420, 'lowpass', 0.34);
          this.playTone('sawtooth', 140, 48, 0.18, 0.22);
          break;
        case 'ping':
          this.playTone('sine', 1320, 1760, 0.075, 0.14);
          this.playTone('sine', 1640, 2120, 0.08, 0.12, 0.065);
          break;
        case 'victory':
          [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) =>
            this.playTone('triangle', f, f * 1.01, 0.4, 0.22, i * 0.09),
          );
          break;
        case 'defeat':
          [349.23, 311.13, 261.63, 196].forEach((f, i) =>
            this.playTone('sawtooth', f, f * 0.96, 0.35, 0.16, i * 0.12),
          );
          break;
      }
    } catch {
      // Safe fallback
    }
  }
}
