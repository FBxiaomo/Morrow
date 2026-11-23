/**
 * 玻璃水珠（前景层）：2D canvas 覆盖层，模拟屏幕玻璃外侧的水珠。
 * 重力 + 随机游走下滑、小滴并入大滴、渐隐拖尾；
 * 上限 60 滴；雨停后 5 秒内全部排空。
 */

interface Drop {
  x: number;
  y: number;
  r: number;
  vy: number;
  wobble: number;
  alpha: number;
}

const MAX_DROPS = 60;

export class DropletsLayer {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private drops: Drop[] = [];
  private intensity = 0;
  private target = 0;
  private spawnAcc = 0;
  private draining = false;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'glass-canvas';
    this.ctx = this.canvas.getContext('2d')!;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /** level 0–1：降水强度。归零后进入排空（5 秒） */
  setIntensity(level: number) {
    const prev = this.target;
    this.target = Math.min(1, Math.max(0, level));
    if (prev > 0 && this.target === 0) this.draining = true;
    if (this.target > 0) this.draining = false;
  }

  update(dt: number, _time: number) {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 渐入渐出
    const rate = dt / 3;
    if (this.intensity < this.target) this.intensity = Math.min(this.target, this.intensity + rate);
    else if (this.intensity > this.target) this.intensity = Math.max(this.target, this.intensity - rate);

    const px = canvas.width / window.innerWidth; // 物理像素比

    // 生成
    if (!this.draining && this.intensity > 0.02) {
      this.spawnAcc += dt * this.intensity * 6; // 全强度约 6 滴/秒
      while (this.spawnAcc >= 1 && this.drops.length < MAX_DROPS) {
        this.spawnAcc -= 1;
        this.drops.push({
          x: Math.random() * canvas.width,
          y: -20 * px,
          r: (2 + Math.random() * 6) * px,
          vy: 0,
          wobble: Math.random() * Math.PI * 2,
          alpha: 0.1 + Math.random() * 0.16,
        });
      }
      if (this.spawnAcc > 4) this.spawnAcc = 4;
    }

    const gravity = this.draining ? 900 * px : 120 * px;
    const alive: Drop[] = [];
    for (const d of this.drops) {
      d.vy += gravity * dt * (d.r / (8 * px)); // 大滴更快
      d.vy = Math.min(d.vy, (this.draining ? 1400 : 260) * px);
      d.y += d.vy * dt;
      d.wobble += dt * 3;
      d.x += Math.sin(d.wobble) * 12 * px * dt;

      // 拖尾
      if (d.vy > 40 * px) {
        const trail = Math.min(1, d.vy / (600 * px));
        ctx.strokeStyle = 'rgba(210, 215, 225,' + (d.alpha * 0.22 * trail).toFixed(3) + ')';
        ctx.lineWidth = d.r * 0.55;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(d.x, d.y - d.vy * 0.06);
        ctx.lineTo(d.x - Math.sin(d.wobble) * 2 * px, d.y - d.r);
        ctx.stroke();
      }

      // 水珠本体：暗底 + 亮缘 + 高光
      const grad = ctx.createRadialGradient(d.x - d.r * 0.35, d.y - d.r * 0.35, d.r * 0.1, d.x, d.y, d.r);
      grad.addColorStop(0, 'rgba(225, 230, 240,' + (d.alpha * 0.5).toFixed(3) + ')');
      grad.addColorStop(0.7, 'rgba(160, 170, 190,' + (d.alpha * 0.16).toFixed(3) + ')');
      grad.addColorStop(1, 'rgba(120, 130, 150,' + (d.alpha * 0.3).toFixed(3) + ')');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fill();

      if (d.y - d.r < canvas.height + 30 * px) alive.push(d);
    }
    this.drops = alive;

    // 合并：小滴靠近大滴时并入（sqrt 面积守恒）
    for (let i = 0; i < this.drops.length; i++) {
      for (let j = i + 1; j < this.drops.length; j++) {
        const a = this.drops[i], b = this.drops[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const rr = a.r + b.r;
        if (dist < rr * 0.62 && Math.abs(a.r - b.r) > 1.5 * px) {
          const [big, small] = a.r > b.r ? [a, b] : [b, a];
          big.r = Math.sqrt(big.r * big.r + small.r * small.r);
          big.vy = (big.vy + small.vy) * 0.5;
          small.r = 0; // 移除
          if (small === a) { this.drops.splice(i, 1); i--; break; }
          else { this.drops.splice(j, 1); j--; }
        }
      }
    }
    // 清理零半径
    this.drops = this.drops.filter(d => d.r > 0.5 * px);

    if (this.draining && this.drops.length === 0) this.draining = false;
  }

  /** 当前水珠数（探针用） */
  get count() {
    return this.drops.length;
  }

  /** 是否处于排空阶段（探针用） */
  get isDraining() {
    return this.draining;
  }

  private resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.floor(window.innerWidth * dpr);
    this.canvas.height = Math.floor(window.innerHeight * dpr);
    this.canvas.style.width = window.innerWidth + 'px';
    this.canvas.style.height = window.innerHeight + 'px';
  }

  dispose() {
    this.canvas.remove();
  }
}
