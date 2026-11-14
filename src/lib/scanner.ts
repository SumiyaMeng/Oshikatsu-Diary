/**
 * Cheki scanner: finds the white instax frame in a photo, then straightens it
 * with a perspective transform. Runs fully on the device.
 */
export type Pt = [number, number];
export type Quad = [Pt, Pt, Pt, Pt]; // top-left, top-right, bottom-right, bottom-left

/** Instax film sizes in mm: full film, and the picture area [x, y, w, h] inside it. */
export const FILM = {
  mini: { w: 54, h: 86, img: [4, 6, 46, 62], label: 'Mini' },
  square: { w: 72, h: 86, img: [5, 6, 62, 62], label: 'Square' },
  wide: { w: 108, h: 86, img: [4.5, 6, 99, 62], label: 'Wide' },
} as const;
export type FilmKey = keyof typeof FILM;

export interface LoadedImage {
  canvas: HTMLCanvasElement;
  data: ImageData;
}

export const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const rotateQuad = (q: Quad): Quad => [q[3], q[0], q[1], q[2]];
export function quadAspect(q: Quad): number {
  const w = (dist(q[0], q[1]) + dist(q[3], q[2])) / 2;
  const h = (dist(q[0], q[3]) + dist(q[1], q[2])) / 2;
  return w / (h || 1);
}
export const filmForAspect = (a: number): FilmKey => (a < 0.73 ? 'mini' : a < 1.05 ? 'square' : 'wide');

export function polyArea(q: Pt[]): number {
  let a = 0;
  for (let i = 0; i < q.length; i++) {
    const p = q[i],
      n = q[(i + 1) % q.length];
    a += p[0] * n[1] - n[0] * p[1];
  }
  return a / 2;
}

export function isConvex(q: Pt[]): boolean {
  let sign = 0;
  for (let i = 0; i < q.length; i++) {
    const a = q[i],
      b = q[(i + 1) % q.length],
      c = q[(i + 2) % q.length];
    const z = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (z === 0) continue;
    const s = Math.sign(z);
    if (!sign) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

export function otsu(hist: Uint32Array, n: number): number {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sB = 0,
    wB = 0,
    best = -1,
    t = 128;
  for (let i = 0; i < 256; i++) {
    wB += hist[i];
    if (!wB) continue;
    const wF = n - wB;
    if (!wF) break;
    sB += i * hist[i];
    const mB = sB / wB,
      mF = (sum - sB) / wF,
      v = wB * wF * (mB - mF) * (mB - mF);
    if (v > best) {
      best = v;
      t = i;
    }
  }
  return t;
}

/**
 * Finds the cheki's outer corners in RGBA pixels (already downscaled).
 * Looks for the largest bright, low-saturation region (the white frame) that
 * doesn't run off the photo's edges, and takes its extreme corners.
 */
export function detectQuadInPixels(px: Uint8ClampedArray, W: number, H: number): { found: boolean; q: Quad } {
  const n = W * H,
    L = new Uint8Array(n),
    hist = new Uint32Array(256),
    mask = new Uint8Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const l = (px[j] * 77 + px[j + 1] * 150 + px[j + 2] * 29) >> 8;
    L[i] = l;
    hist[l]++;
  }
  const t = Math.max(otsu(hist, n), 135);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const mx = Math.max(px[j], px[j + 1], px[j + 2]),
      mn = Math.min(px[j], px[j + 1], px[j + 2]);
    mask[i] = L[i] > t && mx - mn < 60 ? 1 : 0;
  }
  const seen = new Uint8Array(n),
    queue = new Int32Array(n);
  let best: { score: number; q: Quad } | null = null;
  for (let p = 0; p < n; p++) {
    if (!mask[p] || seen[p]) continue;
    let head = 0,
      tail = 0;
    queue[tail++] = p;
    seen[p] = 1;
    let area = 0,
      minS = Infinity,
      maxS = -Infinity,
      maxD = -Infinity,
      minD = Infinity,
      x0 = W,
      x1 = 0,
      y0 = H,
      y1 = 0;
    let c1: Pt = [0, 0],
      c2: Pt = [0, 0],
      c3: Pt = [0, 0],
      c4: Pt = [0, 0];
    while (head < tail) {
      const cur = queue[head++],
        cx = cur % W,
        cy = (cur - cx) / W;
      area++;
      const S = cx + cy,
        D = cx - cy;
      if (S < minS) (minS = S), (c1 = [cx, cy]);
      if (S > maxS) (maxS = S), (c3 = [cx, cy]);
      if (D > maxD) (maxD = D), (c2 = [cx, cy]);
      if (D < minD) (minD = D), (c4 = [cx, cy]);
      if (cx < x0) x0 = cx;
      if (cx > x1) x1 = cx;
      if (cy < y0) y0 = cy;
      if (cy > y1) y1 = cy;
      if (cx > 0 && mask[cur - 1] && !seen[cur - 1]) (seen[cur - 1] = 1), (queue[tail++] = cur - 1);
      if (cx < W - 1 && mask[cur + 1] && !seen[cur + 1]) (seen[cur + 1] = 1), (queue[tail++] = cur + 1);
      if (cy > 0 && mask[cur - W] && !seen[cur - W]) (seen[cur - W] = 1), (queue[tail++] = cur - W);
      if (cy < H - 1 && mask[cur + W] && !seen[cur + W]) (seen[cur + W] = 1), (queue[tail++] = cur + W);
    }
    const touch = +(x0 === 0) + +(x1 === W - 1) + +(y0 === 0) + +(y1 === H - 1);
    const q: Quad = [c1, c2, c3, c4],
      qa = Math.abs(polyArea(q));
    const score = qa * (touch >= 2 ? 0.15 : touch === 1 ? 0.6 : 1);
    if (area > n * 0.015 && qa > n * 0.05 && isConvex(q) && (!best || score > best.score)) best = { score, q };
  }
  if (best) return { found: true, q: best.q };
  return { found: false, q: [[W * 0.15, H * 0.12], [W * 0.85, H * 0.12], [W * 0.85, H * 0.88], [W * 0.15, H * 0.88]] };
}

function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  for (let i = 0; i < n; i++) {
    let m = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[m][i])) m = r;
    [A[i], A[m]] = [A[m], A[i]];
    [b[i], b[m]] = [b[m], b[i]];
    const p = A[i][i] || 1e-12;
    for (let r = i + 1; r < n; r++) {
      const f = A[r][i] / p;
      if (!f) continue;
      for (let k = i; k < n; k++) A[r][k] -= f * A[i][k];
      b[r] -= f * b[i];
    }
  }
  const x = new Array<number>(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i];
    for (let k = i + 1; k < n; k++) s -= A[i][k] * x[k];
    x[i] = s / (A[i][i] || 1e-12);
  }
  return x;
}

/** Homography mapping points of `dst` onto `src`. */
export function homography(dst: Quad, src: Quad): number[] {
  const A: number[][] = [],
    b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = dst[i],
      [u, v] = src[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  return solve(A, b);
}

export function applyH(h: number[], x: number, y: number): Pt {
  const w = h[6] * x + h[7] * y + 1;
  return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w];
}

/** Straightens the quad into flat film pixels (RGBA), optionally white-balancing from the frame. */
export function warpPixels(src: Uint8ClampedArray, sw: number, sh: number, q: Quad, film: FilmKey, fix: boolean, pxPerMm = 12) {
  const F = FILM[film],
    OW = Math.round(F.w * pxPerMm),
    OH = Math.round(F.h * pxPerMm);
  const h = homography([[0, 0], [OW, 0], [OW, OH], [0, OH]], q);
  const out = new Uint8ClampedArray(OW * OH * 4);
  for (let y = 0; y < OH; y++)
    for (let x = 0; x < OW; x++) {
      const w = h[6] * x + h[7] * y + 1,
        u = (h[0] * x + h[1] * y + h[2]) / w,
        v = (h[3] * x + h[4] * y + h[5]) / w,
        o = (y * OW + x) * 4;
      out[o + 3] = 255;
      if (!(u >= 0 && v >= 0 && u < sw - 1 && v < sh - 1)) {
        out[o] = out[o + 1] = out[o + 2] = 255;
        continue;
      }
      const x0 = u | 0,
        y0 = v | 0,
        fx = u - x0,
        fy = v - y0,
        i0 = (y0 * sw + x0) * 4,
        i2 = i0 + sw * 4;
      for (let k = 0; k < 3; k++)
        out[o + k] = (src[i0 + k] * (1 - fx) + src[i0 + 4 + k] * fx) * (1 - fy) + (src[i2 + k] * (1 - fx) + src[i2 + 4 + k] * fx) * fy;
    }
  if (fix) {
    const ya = Math.round((F.img[1] + F.img[3] + 2.5) * pxPerMm),
      yb = OH - Math.round(2.5 * pxPerMm),
      xa = Math.round(3 * pxPerMm),
      xb = OW - xa;
    let r = 0,
      g = 0,
      bb = 0,
      c = 0;
    for (let y = ya; y < yb; y += 3)
      for (let x = xa; x < xb; x += 3) {
        const o = (y * OW + x) * 4;
        r += out[o];
        g += out[o + 1];
        bb += out[o + 2];
        c++;
      }
    if (c) {
      r /= c;
      g /= c;
      bb /= c;
      if ((r + g + bb) / 3 > 90) {
        const gain = [r, g, bb].map((v) => Math.min(1.7, Math.max(0.85, 246 / Math.max(v, 1))));
        for (let i = 0; i < out.length; i += 4) {
          out[i] *= gain[0];
          out[i + 1] *= gain[1];
          out[i + 2] *= gain[2];
        }
      }
    }
  }
  return { pixels: out, width: OW, height: OH };
}

/** Picture-area crop of a warped film, in pixels. */
export function imageArea(film: FilmKey, pxPerMm = 12) {
  const [x, y, w, h] = FILM[film].img.map((v) => Math.round(v * pxPerMm));
  return { x, y, w, h };
}

/* ---------- browser helpers ---------- */

export async function loadImage(file: Blob, maxSide = 2400): Promise<LoadedImage> {
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * s);
  canvas.height = Math.round(bmp.height * s);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return { canvas, data: ctx.getImageData(0, 0, canvas.width, canvas.height) };
}

export function detectQuad(img: LoadedImage): { found: boolean; q: Quad } {
  const W = Math.min(360, img.canvas.width),
    s = W / img.canvas.width,
    H = Math.max(1, Math.round(img.canvas.height * s));
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d', { willReadFrequently: true })!;
  x.drawImage(img.canvas, 0, 0, W, H);
  const r = detectQuadInPixels(x.getImageData(0, 0, W, H).data, W, H);
  return { found: r.found, q: r.q.map(([a, b]) => [a / s, b / s]) as Quad };
}

export function warpToCanvas(img: LoadedImage, q: Quad, film: FilmKey, keepFrame: boolean, fix: boolean, pxPerMm = 12): HTMLCanvasElement {
  const r = warpPixels(img.data.data, img.canvas.width, img.canvas.height, q, film, fix, pxPerMm);
  let cv = document.createElement('canvas');
  cv.width = r.width;
  cv.height = r.height;
  cv.getContext('2d')!.putImageData(new ImageData(r.pixels, r.width, r.height), 0, 0);
  if (!keepFrame) {
    const a = imageArea(film, pxPerMm),
      c2 = document.createElement('canvas');
    c2.width = a.w;
    c2.height = a.h;
    c2.getContext('2d')!.drawImage(cv, a.x, a.y, a.w, a.h, 0, 0, a.w, a.h);
    cv = c2;
  }
  return cv;
}

export async function shrinkImage(file: Blob, maxSide = 1800): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const s = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * s);
    c.height = Math.round(bmp.height * s);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise<Blob>((r) => c.toBlob((b) => r(b ?? file), 'image/jpeg', 0.86));
  } catch {
    return file;
  }
}
