export type SoundPhase = 'title' | 'playing' | 'evening' | 'ended';

interface ChordVoicing {
  bassRoot: number;
  bassFifth: number;
  bassApproach: number;
  rhodes: number[];
  pulseRoot: number;
  pulseThird: number;
  pulseFifth: number;
  pulseSeventh: number;
}

// D Dorian / D minor neo-noir 4-bar cycle: Dm9 -> Gm11 -> Bbmaj9 -> A7alt
const PROGRESSION: ChordVoicing[] = [
  {
    // Dm9
    bassRoot: 73.42, // D2
    bassFifth: 110.0, // A2
    bassApproach: 77.78, // Eb2 -> D2
    rhodes: [174.61, 220.0, 261.63, 329.63], // F3, A3, C4, E4
    pulseRoot: 146.83, // D3
    pulseThird: 174.61, // F3
    pulseFifth: 220.0, // A3
    pulseSeventh: 261.63, // C4
  },
  {
    // Gm11
    bassRoot: 49.0, // G1
    bassFifth: 73.42, // D2
    bassApproach: 51.91, // Ab1 -> G1
    rhodes: [233.08, 261.63, 349.23, 440.0], // Bb3, C4, F4, A4
    pulseRoot: 196.0, // G3
    pulseThird: 233.08, // Bb3
    pulseFifth: 293.66, // D4
    pulseSeventh: 349.23, // F4
  },
  {
    // Bbmaj9
    bassRoot: 58.27, // Bb1
    bassFifth: 87.31, // F2
    bassApproach: 61.74, // B1 -> Bb1
    rhodes: [146.83, 174.61, 220.0, 261.63], // D3, F3, A3, C4
    pulseRoot: 116.54, // Bb2
    pulseThird: 146.83, // D3
    pulseFifth: 174.61, // F3
    pulseSeventh: 220.0, // A3
  },
  {
    // Asus4 -> A7(b9)
    bassRoot: 55.0, // A1
    bassFifth: 82.41, // E2
    bassApproach: 69.3, // C#2 / Db2
    rhodes: [196.0, 233.08, 277.18, 329.63], // G3, Bb3, C#4, E4
    pulseRoot: 110.0, // A2
    pulseThird: 138.59, // C#3
    pulseFifth: 164.81, // E3
    pulseSeventh: 196.0, // G3
  },
];

const BPM = 88;
const SIXTEENTH_SEC = 60 / BPM / 4; // ~0.17045s
const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD_SEC = 0.14;
const TOTAL_STEPS = 64; // 4 bars x 16 steps

const BGM_MASTER_VOL = 0.28;
const SFX_MASTER_VOL = 0.4;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

const LYRIA_TRACKS = {
  title: './assets/audio/bgm_title.mp3',
  twilight: './assets/audio/bgm_twilight.mp3',
  tension: './assets/audio/bgm_tension.mp3',
  ending: './assets/audio/bgm_ending.mp3',
} as const;

export type LyriaTrackKey = keyof typeof LYRIA_TRACKS;

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private bgmBus: GainNode | null = null;
  private proceduralBgmBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;

  // Lyria 3.5 adaptive BGM tracks (separate Title theme vs Gameplay adaptive score vs Ending)
  private lyriaBus: GainNode | null = null;
  private lyriaFilter: BiquadFilterNode | null = null;
  private lyriaElements: Partial<Record<LyriaTrackKey, HTMLAudioElement>> = {};
  private lyriaGains: Partial<Record<LyriaTrackKey, GainNode>> = {};
  private lyriaTargets: Record<LyriaTrackKey, number> = {
    title: 0,
    twilight: 0,
    tension: 0,
    ending: 0,
  };
  private lyriaPauseTimers: Partial<Record<LyriaTrackKey, number>> = {};
  private lyriaActive = false;

  // BGM procedural fallback layer buses
  private layer1Gain: GainNode | null = null; // Sub-bass + Rhodes + vinyl rain
  private layer2Gain: GainNode | null = null; // Brushed percussion & rim-click
  private layer3Gain: GainNode | null = null; // Tense 16th muted synth pulse
  private layer4Gain: GainNode | null = null; // Ominous drone + radar ping
  private layer1Filter: BiquadFilterNode | null = null;
  private layer3Filter: BiquadFilterNode | null = null;

  // Ambient continuous nodes (vinyl/rain texture + drone)
  private rainSource: AudioBufferSourceNode | null = null;
  private droneOscA: OscillatorNode | null = null;
  private droneOscB: OscillatorNode | null = null;

  // Shared delay ("noir room echo")
  private delaySend: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  // State
  private muted = false;
  private policeTrace = 0;
  private phase: SoundPhase = 'title';

  // Scheduler state
  private schedulerTimer: number | null = null;
  private nextStepTime = 0;
  private currentStep = 0;
  private bgmRunning = false;

  /**
   * Safely creates/resumes AudioContext on first user gesture and starts BGM.
   * Never throws in headless browsers or when audio hardware is unavailable.
   */
  public unlock(): void {
    try {
      if (typeof window === 'undefined') return;

      if (!this.ctx) {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (!AudioCtx) return;

        this.ctx = new AudioCtx();
        this.buildGraph(this.ctx);
      }

      if (this.ctx.state === 'suspended') {
        void this.ctx
          .resume()
          .then(() => {
            this.applyTensionTargets();
            this.scheduleAhead();
          })
          .catch(() => {
            // Ignore resume failures in restricted/headless contexts
          });
      }

      this.applyTensionTargets();

      if (!this.bgmRunning) {
        this.startBgm();
      }
      this.startLyriaTracks();
    } catch {
      // Never throw if Web Audio API is unavailable
    }
  }

  public setMuted(muted: boolean): void {
    this.muted = Boolean(muted);
    try {
      if (!this.ctx || !this.masterGain) return;
      const now = this.ctx.currentTime;
      const target = this.muted ? 0 : 1;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setTargetAtTime(target, now, 0.04);

      if (!this.muted && this.ctx.state === 'suspended') {
        void this.ctx.resume().catch(() => {});
      }
    } catch {
      // Ignore
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setTension(policeTrace: number, phase: SoundPhase): void {
    const prevPhase = this.phase;
    this.policeTrace = clamp(Number.isFinite(policeTrace) ? policeTrace : 0, 0, 100);
    this.phase = phase;
    const isMajorSceneSwitch =
      prevPhase !== phase &&
      (prevPhase === 'title' ||
        phase === 'title' ||
        prevPhase === 'ended' ||
        phase === 'ended');
    this.applyTensionTargets(isMajorSceneSwitch);
  }

  public getActiveTrackKey(): LyriaTrackKey {
    return this.getPrimaryTrackForPhase();
  }

  private getPrimaryTrackForPhase(): LyriaTrackKey {
    if (this.phase === 'title') return 'title';
    if (this.phase === 'ended') return 'ending';
    return this.policeTrace >= 60 ? 'tension' : 'twilight';
  }

  /**
   * Subtle crisp tactile mechanical click.
   */
  public playClick(): void {
    try {
      if (!this.canPlaySfx()) return;
      const ctx = this.ctx!;
      const bus = this.sfxBus!;
      const now = ctx.currentTime;

      // Micro transient noise snap
      this.triggerNoiseBurst(now, 0.014, 2400, 1.4, 0.16, 'bandpass', bus);

      // Tactile body tick
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1650, now);
      osc.frequency.exponentialRampToValueAtTime(620, now + 0.022);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.22, now + 0.002);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.026);

      osc.connect(gain);
      gain.connect(bus);
      osc.start(now);
      osc.stop(now + 0.032);
    } catch {
      // Safe no-op
    }
  }

  /**
   * Ultra-soft micro-tick for button/card hover.
   */
  public playHover(): void {
    try {
      if (!this.canPlaySfx()) return;
      const ctx = this.ctx!;
      const bus = this.sfxBus!;
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(2200, now);
      osc.frequency.exponentialRampToValueAtTime(1400, now + 0.01);

      gain.gain.setValueAtTime(0.0005, now);
      gain.gain.linearRampToValueAtTime(0.055, now + 0.0015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.012);

      osc.connect(gain);
      gain.connect(bus);
      osc.start(now);
      osc.stop(now + 0.016);
    } catch {
      // Safe no-op
    }
  }

  /**
   * Realistic encrypted burner phone two-tone chime (+ subtle low buzz if urgent).
   */
  public playMessagePing(urgent = false): void {
    try {
      if (!this.canPlaySfx()) return;
      const ctx = this.ctx!;
      const bus = this.sfxBus!;
      const now = ctx.currentTime;

      if (urgent) {
        // Double haptic desk-vibration buzz
        for (const offset of [0, 0.11]) {
          const vibOsc = ctx.createOscillator();
          const vibLfo = ctx.createOscillator();
          const vibLfoGain = ctx.createGain();
          const vibGain = ctx.createGain();

          vibOsc.type = 'sawtooth';
          vibOsc.frequency.setValueAtTime(128, now + offset);

          vibLfo.type = 'sine';
          vibLfo.frequency.setValueAtTime(34, now + offset);
          vibLfoGain.gain.setValueAtTime(22, now + offset);
          vibLfo.connect(vibLfoGain);
          vibLfoGain.connect(vibOsc.frequency);

          const lp = ctx.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.setValueAtTime(380, now + offset);

          vibGain.gain.setValueAtTime(0.0001, now + offset);
          vibGain.gain.linearRampToValueAtTime(0.18, now + offset + 0.01);
          vibGain.gain.setValueAtTime(0.16, now + offset + 0.06);
          vibGain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.085);

          vibOsc.connect(lp);
          lp.connect(vibGain);
          vibGain.connect(bus);

          vibOsc.start(now + offset);
          vibLfo.start(now + offset);
          vibOsc.stop(now + offset + 0.095);
          vibLfo.stop(now + offset + 0.095);
        }
      }

      // Two-tone encrypted chime
      const f1 = urgent ? 987.77 : 880.0; // B5 or A5
      const f2 = urgent ? 1479.98 : 1174.66; // F#6 or D6
      const delay = urgent ? 0.03 : 0;

      this.triggerBellTone(now + delay, f1, 0.09, 0.2, 2.0, bus, true);
      this.triggerBellTone(now + delay + 0.075, f2, 0.18, 0.24, 2.0, bus, true);
    } catch {
      // Safe no-op
    }
  }

  /**
   * Sleek encrypted transmission whoosh + confirmation blip.
   */
  public playDispatch(): void {
    try {
      if (!this.canPlaySfx()) return;
      const ctx = this.ctx!;
      const bus = this.sfxBus!;
      const now = ctx.currentTime;

      // Swept filtered noise whoosh
      if (this.noiseBuffer) {
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuffer;

        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.Q.setValueAtTime(2.6, now);
        bp.frequency.setValueAtTime(320, now);
        bp.frequency.exponentialRampToValueAtTime(3400, now + 0.16);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(0.24, now + 0.045);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);

        src.connect(bp);
        bp.connect(gain);
        gain.connect(bus);
        if (this.delaySend) gain.connect(this.delaySend);

        src.start(now);
        src.stop(now + 0.22);
      }

      // Digital confirmation double-blip
      this.triggerPureTone(now + 0.11, 587.33, 0.055, 'triangle', 0.18, bus, false); // D5
      this.triggerPureTone(now + 0.165, 1174.66, 0.11, 'sine', 0.22, bus, true); // D6
    } catch {
      // Safe no-op
    }
  }

  /**
   * Satisfying metallic/digital ledger chime.
   * positive = bright minor-to-major chord; negative = muted low drop.
   */
  public playCash(positive = true): void {
    try {
      if (!this.canPlaySfx()) return;
      const ctx = this.ctx!;
      const bus = this.sfxBus!;
      const now = ctx.currentTime;

      if (positive) {
        // Metallic coin/ledger clink transient
        this.triggerBellTone(now, 2637.02, 0.08, 0.12, 2.75, bus, false); // E7 metallic ping
        // Minor-to-major luminous resolution: D5 -> F5 -> F#5/A5/D6
        this.triggerBellTone(now + 0.02, 587.33, 0.22, 0.18, 2.0, bus, true); // D5
        this.triggerBellTone(now + 0.055, 698.46, 0.14, 0.14, 2.0, bus, false); // F5 (brief minor tension)
        this.triggerBellTone(now + 0.105, 739.99, 0.32, 0.2, 2.0, bus, true); // F#5 (major lift)
        this.triggerBellTone(now + 0.14, 880.0, 0.34, 0.18, 2.0, bus, true); // A5
        this.triggerBellTone(now + 0.175, 1174.66, 0.38, 0.16, 2.0, bus, true); // D6
      } else {
        // Muted low ledger drain
        const notes = [220.0, 207.65, 146.83]; // A3 -> Ab3 -> D3
        notes.forEach((freq, i) => {
          const t = now + i * 0.075;
          const osc = ctx.createOscillator();
          const lp = ctx.createBiquadFilter();
          const gain = ctx.createGain();

          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, t);
          osc.frequency.exponentialRampToValueAtTime(freq * 0.94, t + 0.13);

          lp.type = 'lowpass';
          lp.frequency.setValueAtTime(620, t);

          gain.gain.setValueAtTime(0.0001, t);
          gain.gain.linearRampToValueAtTime(0.24, t + 0.008);
          gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);

          osc.connect(lp);
          lp.connect(gain);
          gain.connect(bus);
          osc.start(t);
          osc.stop(t + 0.16);
        });
      }
    } catch {
      // Safe no-op
    }
  }

  /**
   * Dramatic Japanese noir bass sting + sharp dissonance chord.
   */
  public playLieExposed(): void {
    try {
      if (!this.canPlaySfx()) return;
      const ctx = this.ctx!;
      const bus = this.sfxBus!;
      const now = ctx.currentTime;

      // 1. Deep punchy sub-bass noir impact
      const sub = ctx.createOscillator();
      const subGain = ctx.createGain();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(110, now);
      sub.frequency.exponentialRampToValueAtTime(36.71, now + 0.28); // Drops to D1
      subGain.gain.setValueAtTime(0.001, now);
      subGain.gain.linearRampToValueAtTime(0.55, now + 0.008);
      subGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.72);
      sub.connect(subGain);
      subGain.connect(bus);
      sub.start(now);
      sub.stop(now + 0.75);

      // 2. Crisp slap transient
      this.triggerNoiseBurst(now, 0.04, 1800, 0.9, 0.32, 'bandpass', bus);

      // 3. Sharp noir dissonance cluster (minor 2nd + tritone: D4, Eb4, G#4, C#5)
      const clusterFreqs = [293.66, 311.13, 415.3, 554.37];
      const clusterFilter = ctx.createBiquadFilter();
      clusterFilter.type = 'bandpass';
      clusterFilter.frequency.setValueAtTime(2400, now);
      clusterFilter.frequency.exponentialRampToValueAtTime(750, now + 0.85);
      clusterFilter.Q.setValueAtTime(1.1, now);

      const clusterMaster = ctx.createGain();
      clusterMaster.gain.setValueAtTime(0.0001, now);
      clusterMaster.gain.linearRampToValueAtTime(0.28, now + 0.012);
      clusterMaster.gain.exponentialRampToValueAtTime(0.0001, now + 0.95);

      clusterFilter.connect(clusterMaster);
      clusterMaster.connect(bus);
      if (this.delaySend) clusterMaster.connect(this.delaySend);

      clusterFreqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        osc.type = idx % 2 === 0 ? 'sawtooth' : 'triangle';
        osc.frequency.setValueAtTime(freq, now);
        osc.detune.setValueAtTime((idx - 1.5) * 9, now);
        osc.connect(clusterFilter);
        osc.start(now);
        osc.stop(now + 0.98);
      });
    } catch {
      // Safe no-op
    }
  }

  /**
   * Heavy ink dossier stamp thud.
   */
  public playStamp(): void {
    try {
      if (!this.canPlaySfx()) return;
      const ctx = this.ctx!;
      const bus = this.sfxBus!;
      const now = ctx.currentTime;

      // Heavy low body thump
      const thump = ctx.createOscillator();
      const thumpGain = ctx.createGain();
      thump.type = 'sine';
      thump.frequency.setValueAtTime(155, now);
      thump.frequency.exponentialRampToValueAtTime(42, now + 0.085);

      thumpGain.gain.setValueAtTime(0.001, now);
      thumpGain.gain.linearRampToValueAtTime(0.62, now + 0.004);
      thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);

      thump.connect(thumpGain);
      thumpGain.connect(bus);
      thump.start(now);
      thump.stop(now + 0.18);

      // Desk wood resonance knock
      const wood = ctx.createOscillator();
      const woodGain = ctx.createGain();
      wood.type = 'triangle';
      wood.frequency.setValueAtTime(220, now);
      wood.frequency.exponentialRampToValueAtTime(115, now + 0.05);

      woodGain.gain.setValueAtTime(0.001, now);
      woodGain.gain.linearRampToValueAtTime(0.32, now + 0.003);
      woodGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);

      wood.connect(woodGain);
      woodGain.connect(bus);
      wood.start(now);
      wood.stop(now + 0.09);

      // Ink-pad paper slap
      this.triggerNoiseBurst(now, 0.038, 720, 0.8, 0.42, 'lowpass', bus);
    } catch {
      // Safe no-op
    }
  }

  /**
   * Crisp 4-note Japanese evening TV news broadcast chime.
   */
  public playNewsJingle(): void {
    try {
      if (!this.canPlaySfx()) return;
      const ctx = this.ctx!;
      const bus = this.sfxBus!;
      const now = ctx.currentTime;

      // Broadcast cadence: D5 -> F5 -> A5 -> D6
      const notes = [
        { freq: 587.33, offset: 0.0, dur: 0.22 },
        { freq: 698.46, offset: 0.125, dur: 0.22 },
        { freq: 880.0, offset: 0.25, dur: 0.24 },
        { freq: 1174.66, offset: 0.375, dur: 0.68 },
      ];

      for (const n of notes) {
        this.triggerBellTone(now + n.offset, n.freq, n.dur, 0.24, 2.0, bus, true);
      }
    } catch {
      // Safe no-op
    }
  }

  /**
   * Distant muffled police siren sweep + tension pulse.
   */
  public playAlert(): void {
    try {
      if (!this.canPlaySfx()) return;
      const ctx = this.ctx!;
      const bus = this.sfxBus!;
      const now = ctx.currentTime;

      // Distant muffled urban siren (two cycles through heavy low-pass)
      const siren = ctx.createOscillator();
      const sirenFilter = ctx.createBiquadFilter();
      const sirenGain = ctx.createGain();

      siren.type = 'sawtooth';
      siren.frequency.setValueAtTime(620, now);
      siren.frequency.linearRampToValueAtTime(910, now + 0.26);
      siren.frequency.linearRampToValueAtTime(610, now + 0.56);
      siren.frequency.linearRampToValueAtTime(890, now + 0.82);
      siren.frequency.linearRampToValueAtTime(580, now + 1.12);

      sirenFilter.type = 'lowpass';
      sirenFilter.frequency.setValueAtTime(860, now);
      sirenFilter.Q.setValueAtTime(1.6, now);

      sirenGain.gain.setValueAtTime(0.0001, now);
      sirenGain.gain.linearRampToValueAtTime(0.16, now + 0.12);
      sirenGain.gain.setValueAtTime(0.15, now + 0.78);
      sirenGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.18);

      siren.connect(sirenFilter);
      sirenFilter.connect(sirenGain);
      sirenGain.connect(bus);
      if (this.delaySend) sirenGain.connect(this.delaySend);

      siren.start(now);
      siren.stop(now + 1.22);

      // Twin low tension heartbeat pulses
      for (const offset of [0.0, 0.32]) {
        const pulse = ctx.createOscillator();
        const pGain = ctx.createGain();
        pulse.type = 'sine';
        pulse.frequency.setValueAtTime(73.42, now + offset);
        pulse.frequency.exponentialRampToValueAtTime(48.0, now + offset + 0.22);

        pGain.gain.setValueAtTime(0.0001, now + offset);
        pGain.gain.linearRampToValueAtTime(0.32, now + offset + 0.015);
        pGain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.26);

        pulse.connect(pGain);
        pGain.connect(bus);
        pulse.start(now + offset);
        pulse.stop(now + offset + 0.28);
      }
    } catch {
      // Safe no-op
    }
  }

  /**
   * Short soft invalid action buzz.
   */
  public playError(): void {
    try {
      if (!this.canPlaySfx()) return;
      const ctx = this.ctx!;
      const bus = this.sfxBus!;
      const now = ctx.currentTime;

      for (const [idx, offset] of [0, 0.075].entries()) {
        const osc = ctx.createOscillator();
        const lp = ctx.createBiquadFilter();
        const gain = ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(idx === 0 ? 142 : 124, now + offset);

        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(420, now + offset);

        gain.gain.setValueAtTime(0.0001, now + offset);
        gain.gain.linearRampToValueAtTime(0.18, now + offset + 0.006);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.06);

        osc.connect(lp);
        lp.connect(gain);
        gain.connect(bus);
        osc.start(now + offset);
        osc.stop(now + offset + 0.068);
      }
    } catch {
      // Safe no-op
    }
  }

  /**
   * Cleanly stops scheduler, ambient oscillators, and closes AudioContext.
   */
  public dispose(): void {
    try {
      if (this.schedulerTimer !== null && typeof window !== 'undefined') {
        window.clearInterval(this.schedulerTimer);
        this.schedulerTimer = null;
      }
      this.bgmRunning = false;

      try {
        this.rainSource?.stop();
      } catch {
        // Ignore
      }
      try {
        this.droneOscA?.stop();
      } catch {
        // Ignore
      }
      try {
        this.droneOscB?.stop();
      } catch {
        // Ignore
      }

      this.rainSource = null;
      this.droneOscA = null;
      this.droneOscB = null;

      for (const el of Object.values(this.lyriaElements)) {
        if (el) {
          try {
            el.pause();
            el.removeAttribute('src');
            el.load();
          } catch {
            // Ignore
          }
        }
      }
      this.lyriaElements = {};
      this.lyriaGains = {};
      this.lyriaActive = false;

      if (this.ctx && this.ctx.state !== 'closed') {
        void this.ctx.close().catch(() => {});
      }
    } catch {
      // Ignore
    } finally {
      this.ctx = null;
      this.masterGain = null;
      this.compressor = null;
      this.bgmBus = null;
      this.proceduralBgmBus = null;
      this.lyriaBus = null;
      this.lyriaFilter = null;
      this.sfxBus = null;
      this.layer1Gain = null;
      this.layer2Gain = null;
      this.layer3Gain = null;
      this.layer4Gain = null;
      this.layer1Filter = null;
      this.layer3Filter = null;
      this.delaySend = null;
      this.noiseBuffer = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Internal Audio Graph & BGM Scheduler
  // ---------------------------------------------------------------------------

  private buildGraph(ctx: AudioContext): void {
    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.setValueAtTime(-14, ctx.currentTime);
    this.compressor.knee.setValueAtTime(18, ctx.currentTime);
    this.compressor.ratio.setValueAtTime(4, ctx.currentTime);
    this.compressor.attack.setValueAtTime(0.005, ctx.currentTime);
    this.compressor.release.setValueAtTime(0.18, ctx.currentTime);

    this.masterGain = ctx.createGain();
    this.masterGain.gain.setValueAtTime(this.muted ? 0 : 1, ctx.currentTime);

    this.bgmBus = ctx.createGain();
    this.bgmBus.gain.setValueAtTime(BGM_MASTER_VOL, ctx.currentTime);

    this.proceduralBgmBus = ctx.createGain();
    this.proceduralBgmBus.gain.setValueAtTime(1.0, ctx.currentTime);
    this.proceduralBgmBus.connect(this.bgmBus);

    // Lyria 3.5 adaptive BGM sub-bus (fades in smoothly once tracks start playing)
    this.lyriaFilter = ctx.createBiquadFilter();
    this.lyriaFilter.type = 'lowpass';
    this.lyriaFilter.frequency.setValueAtTime(18000, ctx.currentTime);
    this.lyriaFilter.Q.setValueAtTime(0.6, ctx.currentTime);

    this.lyriaBus = ctx.createGain();
    this.lyriaBus.gain.setValueAtTime(0.0, ctx.currentTime);
    this.lyriaFilter.connect(this.lyriaBus);
    this.lyriaBus.connect(this.bgmBus);

    this.initLyriaAudioElements(ctx);

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.setValueAtTime(SFX_MASTER_VOL, ctx.currentTime);

    this.compressor.connect(this.masterGain);
    this.masterGain.connect(ctx.destination);
    this.bgmBus.connect(this.compressor);
    this.sfxBus.connect(this.compressor);

    // Subtle noir feedback delay bus routed into compressor
    const delay = ctx.createDelay(1.0);
    delay.delayTime.setValueAtTime(SIXTEENTH_SEC * 3, ctx.currentTime); // Dotted 8th
    const delayFeedback = ctx.createGain();
    delayFeedback.gain.setValueAtTime(0.28, ctx.currentTime);
    const delayFilter = ctx.createBiquadFilter();
    delayFilter.type = 'lowpass';
    delayFilter.frequency.setValueAtTime(1650, ctx.currentTime);
    const delayWet = ctx.createGain();
    delayWet.gain.setValueAtTime(0.24, ctx.currentTime);
    this.delaySend = ctx.createGain();
    this.delaySend.gain.setValueAtTime(0.32, ctx.currentTime);

    this.delaySend.connect(delay);
    delay.connect(delayFilter);
    delayFilter.connect(delayFeedback);
    delayFeedback.connect(delay);
    delayFilter.connect(delayWet);
    delayWet.connect(this.compressor);

    // Layer 1: Warm sub-bass + Rhodes + vinyl/rain texture
    this.layer1Filter = ctx.createBiquadFilter();
    this.layer1Filter.type = 'lowpass';
    this.layer1Filter.frequency.setValueAtTime(1250, ctx.currentTime);
    this.layer1Filter.Q.setValueAtTime(0.7, ctx.currentTime);

    this.layer1Gain = ctx.createGain();
    this.layer1Gain.gain.setValueAtTime(0.85, ctx.currentTime);
    this.layer1Filter.connect(this.layer1Gain);
    this.layer1Gain.connect(this.proceduralBgmBus);

    // Layer 2: Brushed percussion & rim-click nocturnal groove
    this.layer2Gain = ctx.createGain();
    this.layer2Gain.gain.setValueAtTime(0, ctx.currentTime);
    this.layer2Gain.connect(this.proceduralBgmBus);

    // Layer 3: Tense 16th-note muted synth pulse
    this.layer3Filter = ctx.createBiquadFilter();
    this.layer3Filter.type = 'lowpass';
    this.layer3Filter.frequency.setValueAtTime(620, ctx.currentTime);
    this.layer3Filter.Q.setValueAtTime(2.4, ctx.currentTime);

    this.layer3Gain = ctx.createGain();
    this.layer3Gain.gain.setValueAtTime(0, ctx.currentTime);
    this.layer3Filter.connect(this.layer3Gain);
    this.layer3Gain.connect(this.proceduralBgmBus);

    // Layer 4: Low ominous drone + radar ping harmonics
    this.layer4Gain = ctx.createGain();
    this.layer4Gain.gain.setValueAtTime(0, ctx.currentTime);
    this.layer4Gain.connect(this.proceduralBgmBus);

    // Pre-generate 2s pink-ish noise buffer
    this.noiseBuffer = this.createNoiseBuffer(ctx, 2.0);
    this.startAmbientBeds(ctx);
  }

  private initLyriaAudioElements(ctx: AudioContext): void {
    try {
      if (typeof Audio === 'undefined' || !this.lyriaFilter) return;
      const primary = this.getPrimaryTrackForPhase();
      (Object.keys(LYRIA_TRACKS) as LyriaTrackKey[]).forEach((key) => {
        const el = new Audio(LYRIA_TRACKS[key]);
        el.loop = true;
        // Preload both Title theme and Gameplay main theme for instant transition
        el.preload = key === 'title' || key === 'twilight' ? 'auto' : 'metadata';
        el.crossOrigin = 'anonymous';

        const src = ctx.createMediaElementSource(el);
        const gain = ctx.createGain();
        const initialGain = key === primary ? 1.0 : 0.0;
        gain.gain.setValueAtTime(initialGain, ctx.currentTime);
        src.connect(gain);
        gain.connect(this.lyriaFilter!);

        this.lyriaElements[key] = el;
        this.lyriaGains[key] = gain;
        this.lyriaTargets[key] = initialGain;
      });
    } catch {
      // Fallback seamlessly to procedural BGM if MediaElementSource is unavailable
    }
  }

  private startLyriaTracks(): void {
    try {
      if (!this.ctx) return;
      const primaryKey = this.getPrimaryTrackForPhase();
      const primaryEl = this.lyriaElements[primaryKey];
      if (!primaryEl) return;

      const onPlaying = () => {
        if (!this.ctx || !this.lyriaBus || !this.proceduralBgmBus) return;
        this.lyriaActive = true;
        const now = this.ctx.currentTime;
        this.lyriaBus.gain.setTargetAtTime(1.15, now, 0.4);
        this.proceduralBgmBus.gain.setTargetAtTime(0.0, now, 0.4);
        this.applyTensionTargets(false);
      };

      if (primaryEl.paused) {
        const p = primaryEl.play();
        if (p && typeof p.then === 'function') {
          void p.then(onPlaying).catch(() => {
            // Keep procedural fallback active
          });
        }
      } else if (!this.lyriaActive) {
        onPlaying();
      } else {
        this.applyTensionTargets(false);
      }
    } catch {
      // Ignore
    }
  }

  private createNoiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
    const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      // Paul Kellet's economical pink noise filter
      b0 = 0.99765 * b0 + white * 0.099046;
      b1 = 0.963 * b1 + white * 0.2965164;
      b2 = 0.57 * b2 + white * 1.0526913;
      data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.18;
    }
    return buffer;
  }

  private startAmbientBeds(ctx: AudioContext): void {
    if (!this.noiseBuffer || !this.layer1Gain || !this.layer4Gain) return;

    // Subtle rain / vinyl texture routed directly into Layer 1
    const rain = ctx.createBufferSource();
    rain.buffer = this.noiseBuffer;
    rain.loop = true;

    const rainBp = ctx.createBiquadFilter();
    rainBp.type = 'bandpass';
    rainBp.frequency.setValueAtTime(2100, ctx.currentTime);
    rainBp.Q.setValueAtTime(0.6, ctx.currentTime);

    const rainGain = ctx.createGain();
    rainGain.gain.setValueAtTime(0.045, ctx.currentTime);

    rain.connect(rainBp);
    rainBp.connect(rainGain);
    rainGain.connect(this.layer1Gain);
    rain.start();
    this.rainSource = rain;

    // Layer 4 continuous ominous D1 drone
    const droneFilter = ctx.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.frequency.setValueAtTime(165, ctx.currentTime);
    droneFilter.Q.setValueAtTime(1.5, ctx.currentTime);

    const droneGain = ctx.createGain();
    droneGain.gain.setValueAtTime(0.32, ctx.currentTime);
    droneFilter.connect(droneGain);
    droneGain.connect(this.layer4Gain);

    const oscA = ctx.createOscillator();
    oscA.type = 'sawtooth';
    oscA.frequency.setValueAtTime(36.71, ctx.currentTime); // D1

    const oscB = ctx.createOscillator();
    oscB.type = 'triangle';
    oscB.frequency.setValueAtTime(36.96, ctx.currentTime); // Slight beating detune

    oscA.connect(droneFilter);
    oscB.connect(droneFilter);
    oscA.start();
    oscB.start();
    this.droneOscA = oscA;
    this.droneOscB = oscB;
  }

  private startBgm(): void {
    if (!this.ctx || this.bgmRunning || typeof window === 'undefined') return;
    this.bgmRunning = true;
    this.currentStep = 0;
    this.nextStepTime = this.ctx.currentTime + 0.06;

    this.schedulerTimer = window.setInterval(() => {
      this.scheduleAhead();
    }, LOOKAHEAD_MS);
  }

  private scheduleAhead(): void {
    if (!this.ctx || !this.bgmRunning || this.ctx.state !== 'running') return;
    try {
      const now = this.ctx.currentTime;
      // Recover gracefully if tab was backgrounded and fell behind
      if (this.nextStepTime < now - 0.5) {
        this.nextStepTime = now + 0.05;
      }

      while (this.nextStepTime < now + SCHEDULE_AHEAD_SEC) {
        this.scheduleStep(this.currentStep, this.nextStepTime);
        this.nextStepTime += SIXTEENTH_SEC;
        this.currentStep = (this.currentStep + 1) % TOTAL_STEPS;
      }
    } catch {
      // Ignore scheduling errors
    }
  }

  private scheduleStep(step: number, time: number): void {
    if (!this.ctx || this.lyriaActive) return;

    const barIndex = Math.floor(step / 16) % PROGRESSION.length;
    const stepInBar = step % 16;
    const chord = PROGRESSION[barIndex];

    // Dedicated atmospheric Title Screen procedural motif (distinct from gameplay groove)
    if (this.phase === 'title') {
      if (this.layer1Filter && this.layer1Gain) {
        if (stepInBar === 0 && barIndex % 2 === 0) {
          this.triggerSubBass(time, chord.bassRoot, SIXTEENTH_SEC * 28, 0.34);
          this.triggerRhodesChord(time, chord.rhodes, SIXTEENTH_SEC * 24, 0.16);
        }
        // Sparse nocturnal title bell motif (D5 -> A4 -> F4 -> E4 across 4 bars)
        const titleMotif: Record<number, number> = {
          0: 587.33, // D5
          12: 440.0, // A4
          24: 349.23, // F4
          36: 329.63, // E4
          48: 523.25, // C5
          56: 440.0, // A4
        };
        const motifNote = titleMotif[step];
        if (motifNote) {
          this.triggerBellTone(
            time,
            motifNote,
            SIXTEENTH_SEC * 10,
            0.09,
            2.0,
            this.layer1Filter,
            true,
          );
        }
      }
      return;
    }

    // Subtle swing on off-beat 16ths for nocturnal jazz feel
    const swingOffset = step % 2 === 1 ? 0.011 : 0;
    const t = time + swingOffset;

    // -------------------------------------------------------------------------
    // LAYER 1: Sub-bass walking pattern + warm Rhodes minor-9th/11th chords
    // -------------------------------------------------------------------------
    if (this.layer1Filter && this.layer1Gain) {
      // Rhodes main chord swell on beat 1, softer re-voice on "and" of 3 (step 10)
      if (stepInBar === 0) {
        this.triggerRhodesChord(time, chord.rhodes, SIXTEENTH_SEC * 11, 0.2);
      } else if (stepInBar === 10) {
        this.triggerRhodesChord(t, chord.rhodes.slice(0, 3), SIXTEENTH_SEC * 5, 0.11);
      }

      // Warm sub-bass walking pattern
      if (stepInBar === 0) {
        this.triggerSubBass(time, chord.bassRoot, SIXTEENTH_SEC * 5.5, 0.42);
      } else if (stepInBar === 6) {
        this.triggerSubBass(time, chord.bassFifth, SIXTEENTH_SEC * 3.5, 0.28);
      } else if (stepInBar === 10) {
        this.triggerSubBass(t, chord.bassRoot, SIXTEENTH_SEC * 3.5, 0.32);
      } else if (stepInBar === 14) {
        this.triggerSubBass(time, chord.bassApproach, SIXTEENTH_SEC * 1.9, 0.25);
      }
    }

    // -------------------------------------------------------------------------
    // LAYER 2: Brushed hi-hat / rim-click nocturnal groove ('playing')
    // -------------------------------------------------------------------------
    if (this.layer2Gain) {
      // Soft muffled kick on beat 1 and syncopated step 10
      if (stepInBar === 0 || stepInBar === 10) {
        this.triggerSoftKick(time, stepInBar === 0 ? 0.34 : 0.22);
      }

      // Brushed hi-hats on 8ths + ghost 16ths
      if (stepInBar % 2 === 0) {
        const accent = stepInBar % 4 === 2 ? 0.12 : 0.065;
        this.triggerBrushedHat(time, accent, 0.045);
      } else if (stepInBar === 7 || stepInBar === 15) {
        this.triggerBrushedHat(t, 0.04, 0.032);
      }

      // Noir cross-stick / rim-click on beat 2 (step 4) and beat 4 (step 12)
      if (stepInBar === 4 || stepInBar === 12) {
        this.triggerRimClick(time, 0.16);
      } else if (stepInBar === 14 && barIndex % 2 === 1) {
        this.triggerRimClick(time, 0.075);
      }
    }

    // -------------------------------------------------------------------------
    // LAYER 3: Tense 16th-note muted synth pulse (policeTrace >= 45)
    // -------------------------------------------------------------------------
    const isActivePhase = this.phase === 'playing' || this.phase === 'evening';
    if (this.layer3Filter && isActivePhase && this.policeTrace >= 45) {
      const pattern = [
        chord.pulseRoot,
        chord.pulseRoot,
        chord.pulseThird,
        chord.pulseRoot,
        chord.pulseFifth,
        chord.pulseRoot,
        chord.pulseSeventh,
        chord.pulseFifth,
      ];
      const noteFreq = pattern[stepInBar % pattern.length];
      const vel = stepInBar % 4 === 0 ? 0.2 : 0.12;
      this.triggerMutedPulse(t, noteFreq, SIXTEENTH_SEC * 0.65, vel);
    }

    // -------------------------------------------------------------------------
    // LAYER 4: Subtle radar ping harmonics (policeTrace >= 75)
    // -------------------------------------------------------------------------
    if (this.layer4Gain && isActivePhase && this.policeTrace >= 75 && (step === 0 || step === 26 || step === 48)) {
      const pingFreq = step === 26 ? 1760.0 : 1174.66; // A6 or D6
      this.triggerRadarPing(time, pingFreq);
    }
  }

  private ensureLyriaTrackPlaying(key: LyriaTrackKey, resetIfPaused = false): void {
    const existingTimer = this.lyriaPauseTimers[key];
    if (existingTimer !== undefined && typeof window !== 'undefined') {
      window.clearTimeout(existingTimer);
      delete this.lyriaPauseTimers[key];
    }

    const el = this.lyriaElements[key];
    if (el && el.paused) {
      if (resetIfPaused) {
        try {
          el.currentTime = 0;
        } catch {
          // Ignore seek errors before metadata is ready
        }
      }
      const p = el.play();
      if (p && typeof p.catch === 'function') {
        void p.catch(() => {});
      }
    }
  }

  private scheduleLyriaTrackPause(key: LyriaTrackKey): void {
    if (typeof window === 'undefined') return;
    if (this.lyriaPauseTimers[key] !== undefined) return;
    this.lyriaPauseTimers[key] = window.setTimeout(() => {
      delete this.lyriaPauseTimers[key];
      if (this.lyriaTargets[key] <= 0.001) {
        const el = this.lyriaElements[key];
        if (el && !el.paused) {
          el.pause();
        }
      }
    }, 2600);
  }

  private applyTensionTargets(isMajorSceneSwitch = false): void {
    try {
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const trace = this.policeTrace;
      const phase = this.phase;

      // Adaptive Lyria 3.5 multi-track crossfade:
      // - 'title': Dedicated cinematic main title theme (bgm_title.mp3)
      // - 'playing' / 'evening': Gameplay adaptive score (bgm_twilight.mp3 <-> bgm_tension.mp3)
      // - 'ended': Epilogue dossier theme (bgm_ending.mp3)
      if (this.lyriaActive && this.lyriaFilter) {
        const targets: Record<LyriaTrackKey, number> = {
          title: 0,
          twilight: 0,
          tension: 0,
          ending: 0,
        };
        let cutoff = 18000;

        if (phase === 'title') {
          targets.title = 0.92;
          cutoff = 18000;
        } else if (phase === 'ended') {
          targets.ending = 0.92;
          cutoff = 18000;
        } else {
          // 'playing' or 'evening'
          const tNorm = clamp((trace - 35) / 50, 0, 1);
          targets.twilight = Math.cos(tNorm * Math.PI * 0.5) * 0.95;
          targets.tension = Math.sin(tNorm * Math.PI * 0.5) * 0.95;
          cutoff = phase === 'evening' ? 3200 : 18000;
        }

        const fadeTau = isMajorSceneSwitch ? 0.55 : 0.85;
        (Object.keys(LYRIA_TRACKS) as LyriaTrackKey[]).forEach((key) => {
          const target = targets[key];
          this.lyriaTargets[key] = target;
          if (target > 0.01) {
            this.ensureLyriaTrackPlaying(key, isMajorSceneSwitch);
          } else {
            this.scheduleLyriaTrackPause(key);
          }
          this.lyriaGains[key]?.gain.setTargetAtTime(target, now, fadeTau);
        });

        this.lyriaFilter.frequency.setTargetAtTime(cutoff, now, 0.5);
      }

      // Layer 1 (always active, dimmed in 'ended', slightly dreamier on 'title')
      if (this.layer1Gain && this.layer1Filter) {
        const l1Gain =
          phase === 'ended'
            ? 0.45
            : phase === 'title'
              ? 0.78
              : phase === 'evening'
                ? 0.72
                : 0.9;
        const l1Cutoff =
          phase === 'ended'
            ? 520
            : phase === 'title'
              ? 950
              : phase === 'evening'
                ? 880
                : 1350;

        this.layer1Gain.gain.setTargetAtTime(l1Gain, now, 0.4);
        this.layer1Filter.frequency.setTargetAtTime(l1Cutoff, now, 0.4);
      }

      // Layer 2 (active during 'playing', subtle whisper in 'evening', off in 'title'/'ended')
      if (this.layer2Gain) {
        const l2Gain =
          phase === 'playing' ? 0.85 : phase === 'evening' ? 0.2 : 0.0;
        this.layer2Gain.gain.setTargetAtTime(l2Gain, now, 0.35);
      }

      // Layer 3 (fades in when policeTrace >= 45)
      if (this.layer3Gain && this.layer3Filter) {
        let l3Amount = 0;
        if (trace >= 45) {
          l3Amount = clamp((trace - 45) / 40, 0.18, 1.0);
        }
        const phaseScale =
          phase === 'playing'
            ? 1.0
            : phase === 'evening'
              ? 0.45
              : phase === 'title'
                ? 0.0
                : 0.0;

        this.layer3Gain.gain.setTargetAtTime(l3Amount * phaseScale * 0.75, now, 0.4);
        this.layer3Filter.frequency.setTargetAtTime(
          480 + l3Amount * 720,
          now,
          0.4,
        );
      }

      // Layer 4 (fades in when policeTrace >= 75)
      if (this.layer4Gain) {
        let l4Amount = 0;
        if (trace >= 75) {
          l4Amount = clamp((trace - 75) / 25, 0.22, 1.0);
        }
        const phaseScale =
          phase === 'playing'
            ? 1.0
            : phase === 'evening'
              ? 0.5
              : 0.0;

        this.layer4Gain.gain.setTargetAtTime(l4Amount * phaseScale * 0.85, now, 0.45);
      }
    } catch {
      // Ignore
    }
  }

  // ---------------------------------------------------------------------------
  // BGM Instrument Voices
  // ---------------------------------------------------------------------------

  private triggerSubBass(
    time: number,
    freq: number,
    dur: number,
    vol: number,
  ): void {
    const ctx = this.ctx!;
    const out = this.layer1Filter!;

    const osc = ctx.createOscillator();
    const body = ctx.createOscillator();
    const lp = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, time);

    body.type = 'triangle';
    body.frequency.setValueAtTime(freq * 2, time);

    const bodyGain = ctx.createGain();
    bodyGain.gain.setValueAtTime(0.18, time);

    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(240, time);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(vol, time + 0.014);
    gain.gain.exponentialRampToValueAtTime(vol * 0.55, time + dur * 0.55);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    osc.connect(lp);
    body.connect(bodyGain);
    bodyGain.connect(lp);
    lp.connect(gain);
    gain.connect(out);

    osc.start(time);
    body.start(time);
    osc.stop(time + dur + 0.03);
    body.stop(time + dur + 0.03);
  }

  private triggerRhodesChord(
    time: number,
    freqs: number[],
    dur: number,
    vol: number,
  ): void {
    const ctx = this.ctx!;
    const out = this.layer1Filter!;

    const chordGain = ctx.createGain();
    chordGain.gain.setValueAtTime(0.0001, time);
    chordGain.gain.linearRampToValueAtTime(vol, time + 0.028);
    chordGain.gain.exponentialRampToValueAtTime(vol * 0.42, time + dur * 0.45);
    chordGain.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    chordGain.connect(out);
    if (this.delaySend) {
      const send = ctx.createGain();
      send.gain.setValueAtTime(0.38, time);
      chordGain.connect(send);
      send.connect(this.delaySend);
    }

    for (const freq of freqs) {
      // Warm sine fundamental
      const fund = ctx.createOscillator();
      fund.type = 'sine';
      fund.frequency.setValueAtTime(freq, time);
      fund.detune.setValueAtTime((Math.random() - 0.5) * 5, time);
      fund.connect(chordGain);
      fund.start(time);
      fund.stop(time + dur + 0.04);

      // Soft Rhodes tine transient (2x harmonic, quick decay)
      const tine = ctx.createOscillator();
      const tineGain = ctx.createGain();
      tine.type = 'sine';
      tine.frequency.setValueAtTime(freq * 3, time);
      tineGain.gain.setValueAtTime(0.0001, time);
      tineGain.gain.linearRampToValueAtTime(0.09, time + 0.005);
      tineGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.14);

      tine.connect(tineGain);
      tineGain.connect(chordGain);
      tine.start(time);
      tine.stop(time + 0.16);
    }
  }

  private triggerSoftKick(time: number, vol: number): void {
    const ctx = this.ctx!;
    const out = this.layer2Gain!;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(92, time);
    osc.frequency.exponentialRampToValueAtTime(42, time + 0.08);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(vol, time + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.15);

    osc.connect(gain);
    gain.connect(out);
    osc.start(time);
    osc.stop(time + 0.17);
  }

  private triggerBrushedHat(time: number, vol: number, dur: number): void {
    if (!this.noiseBuffer || !this.layer2Gain) return;
    this.triggerNoiseBurst(time, dur, 6400, 1.7, vol, 'bandpass', this.layer2Gain);
  }

  private triggerRimClick(time: number, vol: number): void {
    const ctx = this.ctx!;
    const out = this.layer2Gain!;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(920, time);
    osc.frequency.exponentialRampToValueAtTime(540, time + 0.018);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(vol, time + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.032);

    osc.connect(gain);
    gain.connect(out);
    osc.start(time);
    osc.stop(time + 0.038);

    this.triggerNoiseBurst(time, 0.016, 2600, 2.2, vol * 0.45, 'bandpass', out);
  }

  private triggerMutedPulse(
    time: number,
    freq: number,
    dur: number,
    vol: number,
  ): void {
    const ctx = this.ctx!;
    const out = this.layer3Filter!;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, time);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(vol, time + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    osc.connect(gain);
    gain.connect(out);
    osc.start(time);
    osc.stop(time + dur + 0.02);
  }

  private triggerRadarPing(time: number, freq: number): void {
    const ctx = this.ctx!;
    const out = this.layer4Gain!;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, time);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(0.11, time + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.55);

    osc.connect(gain);
    gain.connect(out);
    if (this.delaySend) gain.connect(this.delaySend);

    osc.start(time);
    osc.stop(time + 0.58);
  }

  // ---------------------------------------------------------------------------
  // Shared SFX Primitives
  // ---------------------------------------------------------------------------

  private canPlaySfx(): boolean {
    return Boolean(this.ctx && this.sfxBus && !this.muted);
  }

  private triggerBellTone(
    time: number,
    freq: number,
    dur: number,
    vol: number,
    harmonicRatio: number,
    dest: AudioNode,
    sendToDelay: boolean,
  ): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const harm = ctx.createOscillator();
    const harmGain = ctx.createGain();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, time);

    harm.type = 'sine';
    harm.frequency.setValueAtTime(freq * harmonicRatio, time);

    harmGain.gain.setValueAtTime(0.28, time);
    harmGain.gain.exponentialRampToValueAtTime(0.01, time + dur * 0.45);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(vol, time + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    osc.connect(gain);
    harm.connect(harmGain);
    harmGain.connect(gain);
    gain.connect(dest);
    if (sendToDelay && this.delaySend) {
      gain.connect(this.delaySend);
    }

    osc.start(time);
    harm.start(time);
    osc.stop(time + dur + 0.03);
    harm.stop(time + dur + 0.03);
  }

  private triggerPureTone(
    time: number,
    freq: number,
    dur: number,
    type: OscillatorType,
    vol: number,
    dest: AudioNode,
    sendToDelay: boolean,
  ): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(vol, time + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    osc.connect(gain);
    gain.connect(dest);
    if (sendToDelay && this.delaySend) {
      gain.connect(this.delaySend);
    }

    osc.start(time);
    osc.stop(time + dur + 0.02);
  }

  private triggerNoiseBurst(
    time: number,
    dur: number,
    filterFreq: number,
    q: number,
    vol: number,
    filterType: BiquadFilterType,
    dest: AudioNode,
  ): void {
    if (!this.ctx || !this.noiseBuffer) return;
    const ctx = this.ctx;

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(filterFreq, time);
    filter.Q.setValueAtTime(q, time);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(vol, time + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(dest);

    src.start(time);
    src.stop(time + dur + 0.01);
  }
}

export const soundEngine = new SoundEngine();
