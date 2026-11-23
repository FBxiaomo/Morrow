export interface SurfacePoint { x: number; y: number }

/** A cropped, pixel-accurate collision surface rebuilt only when clock geometry changes. */
export class GlyphSurface {
  readonly canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
  private pixels = new Uint8ClampedArray(0);
  bounds = { x: 0, y: 0, width: 0, height: 0 };
  tops: SurfacePoint[] = [];
  bottoms: SurfacePoint[] = [];
  dirty = true;
  revision = 0;
  ink = '#ffffff';

  rebuild() {
    if (!this.dirty) return false;
    this.dirty = false;
    const spans = Array.from(document.querySelectorAll<HTMLElement>('.clock-time > span')).filter(el => el.textContent && el.offsetWidth);
    if (!spans.length) return false;
    const rectangles = spans.map(el => el.getBoundingClientRect());
    const x = Math.max(0, Math.floor(Math.min(...rectangles.map(r => r.left))) - 5);
    const y = Math.max(0, Math.floor(Math.min(...rectangles.map(r => r.top))) - 5);
    const right = Math.min(innerWidth, Math.ceil(Math.max(...rectangles.map(r => r.right))) + 5);
    const bottom = Math.min(innerHeight, Math.ceil(Math.max(...rectangles.map(r => r.bottom))) + 5);
    this.bounds = { x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) };
    this.canvas.width = this.bounds.width; this.canvas.height = this.bounds.height;
    this.ctx.fillStyle = '#fff';
    this.ctx.textBaseline = 'alphabetic';
    this.ink = getComputedStyle(spans[0]).color;
    for (const span of spans) {
      const style = getComputedStyle(span), rect = span.getBoundingClientRect();
      this.ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      this.ctx.fontKerning = 'none';
      const metrics = this.ctx.measureText(span.textContent!);
      const ascent = metrics.fontBoundingBoxAscent || parseFloat(style.fontSize) * .8;
      const descent = metrics.fontBoundingBoxDescent || parseFloat(style.fontSize) * .2;
      const baseline = rect.top - y + (rect.height - ascent - descent) / 2 + ascent;
      const node = span.firstChild;
      if (!node || node.nodeType !== Node.TEXT_NODE) continue;
      for (let i = 0; i < span.textContent!.length; i++) {
        const range = document.createRange();
        range.setStart(node, i); range.setEnd(node, i + 1);
        const charRect = range.getBoundingClientRect();
        const char = span.textContent![i], m = this.ctx.measureText(char);
        const letterSpacing = parseFloat(style.letterSpacing) || 0;
        const offset = (charRect.width - letterSpacing - m.width) / 2;
        this.ctx.fillText(char, charRect.left - x + offset, baseline);
      }
    }
    this.pixels = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height).data;
    this.tops = []; this.bottoms = [];
    for (let px = 0; px < this.canvas.width; px += 3) {
      let previous = false;
      for (let py = 0; py < this.canvas.height; py++) {
        const solid = this.pixels[(py * this.canvas.width + px) * 4 + 3] > 100;
        if (solid && !previous) this.tops.push({ x: x + px, y: y + py });
        if (!solid && previous) this.bottoms.push({ x: x + px, y: y + py - 1 });
        previous = solid;
      }
    }
    this.revision++;
    return true;
  }

  contains(x: number, y: number) {
    const px = Math.floor(x - this.bounds.x), py = Math.floor(y - this.bounds.y);
    if (px < 0 || py < 0 || px >= this.canvas.width || py >= this.canvas.height) return false;
    return this.pixels[(py * this.canvas.width + px) * 4 + 3] > 100;
  }

  hit(x0: number, y0: number, x1: number, y1: number): SurfacePoint | null {
    const b = this.bounds;
    if (Math.max(x0, x1) < b.x || Math.min(x0, x1) > b.x + b.width || y1 < b.y || y0 > b.y + b.height) return null;
    // Swept collision prevents fast drops tunnelling through thin font strokes.
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 2));
    for (let i = 1; i <= steps; i++) {
      const x = x0 + (x1 - x0) * i / steps, y = y0 + (y1 - y0) * i / steps;
      if (this.contains(x, y)) return { x, y };
    }
    return null;
  }

  dispose() {
    this.canvas.width = this.canvas.height = 1;
    this.pixels = new Uint8ClampedArray(0); this.tops = []; this.bottoms = [];
  }
}
