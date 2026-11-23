/** An artistic cold tint; manual weather has no measured temperature. */
export function snowTone(temperature?: number) {
  const temp = Number.isFinite(temperature) ? temperature! : -5;
  const iceRatio = Math.min(1, Math.max(0, (-temp - 5) / 15));
  const r = Math.round(220 - iceRatio * 60), g = Math.round(235 - iceRatio * 20);
  return { iceRatio, r, g, b: 255, rgb: `${r},${g},255` };
}
