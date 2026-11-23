/**
 * 极简环境音：三个持续振荡器构成的和弦铺底 + 指针调制 + 点击铃音。
 * 音频上下文必须在用户手势后创建，因此 enable() 由点击/按键触发。
 */
export class AmbientAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private voices: OscillatorNode[] = [];
  private voiceGains: GainNode[] = [];
  private shimmer: OscillatorNode | null = null;
  private shimmerGain: GainNode | null = null;
  private enabled = false;

  get isEnabled() {
    return this.enabled;
  }

  async enable(): Promise<boolean> {
    if (this.enabled) return true;
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return false;
      const ctx = new Ctor();
      this.ctx = ctx;
      await ctx.resume();

      const master = ctx.createGain();
      master.gain.value = 0;
      master.connect(ctx.destination);
      this.master = master;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 620;
      filter.Q.value = 0.9;
      filter.connect(master);
      this.filter = filter;

      // 大三和弦 + 低八度，营造空旷的空间感
      const notes = [110, 164.81, 220, 277.18];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        osc.type = i === 0 ? 'sine' : 'triangle';
        osc.frequency.value = freq;
        osc.detune.value = (i - 1.5) * 6;

        const gain = ctx.createGain();
        gain.gain.value = i === 0 ? 0.14 : 0.055;
        osc.connect(gain);
        gain.connect(filter);
        osc.start();

        this.voices.push(osc);
        this.voiceGains.push(gain);
      });

      // 高频微光，跟随指针产生呼吸感
      const shimmer = ctx.createOscillator();
      shimmer.type = 'sine';
      shimmer.frequency.value = 1320;
      const shimmerGain = ctx.createGain();
      shimmerGain.gain.value = 0;
      shimmer.connect(shimmerGain);
      shimmerGain.connect(master);
      shimmer.start();
      this.shimmer = shimmer;
      this.shimmerGain = shimmerGain;

      master.gain.setTargetAtTime(0.32, ctx.currentTime, 1.4);
      this.enabled = true;
      return true;
    } catch {
      this.enabled = false;
      return false;
    }
  }

  disable() {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    this.master.gain.setTargetAtTime(0, ctx.currentTime, 0.25);
    this.enabled = false;
    window.setTimeout(() => {
      this.voices.forEach((v) => v.stop());
      this.shimmer?.stop();
      this.voices = [];
      this.voiceGains = [];
      this.shimmer = null;
      this.shimmerGain = null;
      void ctx.close();
      this.ctx = null;
      this.master = null;
      this.filter = null;
    }, 600);
  }

  /** 指针在画布中的归一化位置（-1..1），驱动滤波与微光 */
  setPointer(nx: number, ny: number, active: boolean) {
    if (!this.ctx || !this.filter || !this.shimmer || !this.shimmerGain) return;
    const t = this.ctx.currentTime;
    const cutoff = active ? 520 + (nx + 1) * 0.5 * 900 + (1 - Math.abs(ny)) * 420 : 560;
    this.filter.frequency.setTargetAtTime(cutoff, t, 0.18);
    this.shimmer.frequency.setTargetAtTime(1180 + (ny + 1) * 0.5 * 620, t, 0.3);
    this.shimmerGain.gain.setTargetAtTime(active ? 0.012 + (1 - Math.abs(nx)) * 0.016 : 0.004, t, 0.2);
  }

  /** 形态切换：一段上扬的滑音 */
  morph() {
    if (!this.ctx || !this.filter) return;
    const t = this.ctx.currentTime;
    this.filter.frequency.cancelScheduledValues(t);
    this.filter.frequency.setValueAtTime(this.filter.frequency.value, t);
    this.filter.frequency.linearRampToValueAtTime(2400, t + 0.35);
    this.filter.frequency.linearRampToValueAtTime(700, t + 1.6);
  }

  /** 点击脉冲：短促的铃音 */
  burst(intensity = 1) {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const base = 440 * (0.9 + Math.random() * 0.35);
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(base * 2, t);
    osc.frequency.exponentialRampToValueAtTime(base, t + 0.28);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.12 * intensity, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);

    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.8);
  }
}
