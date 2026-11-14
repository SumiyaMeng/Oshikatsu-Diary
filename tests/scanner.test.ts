import { describe, expect, it } from 'vitest';
import { applyH, detectQuadInPixels, filmForAspect, homography, quadAspect, type Quad } from '../src/lib/scanner';

describe('homography', () => {
  it('maps the output rectangle onto a tilted quad', () => {
    const q: Quad = [[10, 20], [110, 15], [120, 180], [5, 170]];
    const h = homography([[0, 0], [100, 0], [100, 160], [0, 160]], q);
    const [x, y] = applyH(h, 100, 160);
    expect(x).toBeCloseTo(120, 6);
    expect(y).toBeCloseTo(180, 6);
  });
});

describe('frame detection', () => {
  it('finds a white rotated cheki on a dark table', () => {
    const W = 300,
      H = 400,
      px = new Uint8ClampedArray(W * H * 4);
    const t = (10 * Math.PI) / 180,
      cx = 150,
      cy = 200,
      hw = 67,
      hh = 107;
    const corners: [number, number][] = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([a, b]) => [cx + a * Math.cos(t) - b * Math.sin(t), cy + a * Math.sin(t) + b * Math.cos(t)]);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const dx = x - cx,
          dy = y - cy,
          u = dx * Math.cos(-t) - dy * Math.sin(-t),
          v = dx * Math.sin(-t) + dy * Math.cos(-t);
        const o = (y * W + x) * 4;
        const inFilm = Math.abs(u) <= hw && Math.abs(v) <= hh;
        const inPic = Math.abs(u) <= hw - 10 && v > -hh + 14 && v < hh - 40;
        const c = inPic ? [220, 120, 160] : inFilm ? [245, 243, 240] : [50, 44, 40];
        px.set([...c, 255], o);
      }
    const r = detectQuadInPixels(px, W, H);
    expect(r.found).toBe(true);
    r.q.forEach((p, i) => expect(Math.hypot(p[0] - corners[i][0], p[1] - corners[i][1])).toBeLessThan(4));
    expect(filmForAspect(quadAspect(r.q))).toBe('mini');
  });
});
