/**
 * 麦克风律动：AnalyserNode 频段包络（低/中/高 + 总能量）。
 * 快攻慢放的包络平滑；未激活时返回全 0 —— 各样式自行回退时间驱动，
 * 画面永不因缺麦克风而中断（静默降级）。
 */

export interface Bands {
  bass: number;
  mid: number;
  treble: number;
  rms: number;
}

const ZERO: Bands = { bass: 0, mid: 0, treble: 0, rms: 0 };

export class AudioService {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private stream: MediaStream | null = null;
  private data: Uint8Array<ArrayBuffer> | null = null;
  private env: Bands = { ...ZERO };
  private active = false;
  private request = 0;

  async enable(): Promise<boolean> {
    if (this.active) return true;
    const request = ++this.request;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      if (request !== this.request) {
        for (const track of stream.getTracks()) track.stop();
        return false;
      }
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.82;
      src.connect(analyser);
      this.stream = stream;
      this.ctx = ctx;
      this.analyser = analyser;
      this.data = new Uint8Array(analyser.frequencyBinCount);
      this.active = true;
      return true;
    } catch {
      this.teardown();
      return false;
    }
  }

  disable() {
    this.request++;
    this.teardown();
    this.env = { ...ZERO };
  }

  isActive(): boolean {
    return this.active;
  }

  /** 当前频段包络（未激活全 0） */
  bands(): Bands {
    return this.env;
  }

  /** 每帧一次：采样 + 快攻慢放包络 */
  update(): Bands {
    if (!this.active || !this.analyser || !this.data) {
      this.env = {
        bass: this.env.bass * 0.9,
        mid: this.env.mid * 0.9,
        treble: this.env.treble * 0.9,
        rms: this.env.rms * 0.9,
      };
      return this.env;
    }
    this.analyser.getByteFrequencyData(this.data);
    const avg = (lo: number, hi: number): number => {
      let s = 0;
      let n = 0;
      for (let i = lo; i < Math.min(hi, this.data!.length); i++) {
        s += this.data![i];
        n++;
      }
      return n ? s / n / 255 : 0;
    };
    // 512 FFT @ 44.1/48k：bin ≈ 86–94Hz；低频 1–8 bin、中频 8–40、高频 40–160
    const next: Bands = {
      bass: avg(1, 8),
      mid: avg(8, 40),
      treble: avg(40, 160),
      rms: avg(1, 160),
    };
    const mix = (prev: number, n: number): number => (n > prev ? n : prev * 0.88 + n * 0.12);
    this.env = {
      bass: mix(this.env.bass, next.bass),
      mid: mix(this.env.mid, next.mid),
      treble: mix(this.env.treble, next.treble),
      rms: mix(this.env.rms, next.rms),
    };
    return this.env;
  }

  private teardown() {
    if (this.stream) {
      for (const t of this.stream.getTracks()) t.stop();
    }
    if (this.ctx) {
      void this.ctx.close().catch(() => {});
    }
    this.stream = null;
    this.ctx = null;
    this.analyser = null;
    this.data = null;
    this.active = false;
  }
}

export const audio = new AudioService();
