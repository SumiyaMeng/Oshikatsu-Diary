/**
 * On-device face matching: suggests which member is in a cheki.
 * Uses @vladmandic/face-api with models shipped in /models. Nothing leaves the device.
 * Loaded lazily, only when a face feature is first used.
 */
import type { Member } from './types';

type FaceApi = typeof import('@vladmandic/face-api');
let api: FaceApi | null = null;
let loading: Promise<FaceApi> | null = null;

export function loadFaceApi(): Promise<FaceApi> {
  if (api) return Promise.resolve(api);
  if (!loading)
    loading = (async () => {
      const f = await import('@vladmandic/face-api');
      const base = import.meta.env.BASE_URL + 'models';
      await Promise.all([
        f.nets.ssdMobilenetv1.loadFromUri(base),
        f.nets.faceLandmark68Net.loadFromUri(base),
        f.nets.faceRecognitionNet.loadFromUri(base),
      ]);
      api = f;
      return f;
    })().catch((e) => {
      loading = null;
      throw e;
    });
  return loading;
}

export interface FoundFace {
  descriptor: number[];
  box: { x: number; y: number; width: number; height: number };
}

export async function findFaces(input: HTMLImageElement | HTMLCanvasElement): Promise<FoundFace[]> {
  const f = await loadFaceApi();
  const res = await f
    .detectAllFaces(input, new f.SsdMobilenetv1Options({ minConfidence: 0.45 }))
    .withFaceLandmarks()
    .withFaceDescriptors();
  return res
    .map((r) => ({ descriptor: Array.from(r.descriptor), box: { x: r.detection.box.x, y: r.detection.box.y, width: r.detection.box.width, height: r.detection.box.height } }))
    .sort((a, b) => b.box.width * b.box.height - a.box.width * a.box.height);
}

export const faceDistance = (a: number[], b: number[]) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s);
};

export interface FaceMatch {
  member: Member;
  distance: number;
}

/** Best member for each face, closest first. Faces matching the user's own face are dropped. */
export function matchFaces(faces: FoundFace[], members: Member[], threshold = 0.5): FaceMatch[] {
  const withFaces = members.filter((m) => m.faces?.length);
  const out: FaceMatch[] = [];
  for (const f of faces) {
    let best: FaceMatch | null = null;
    for (const m of withFaces)
      for (const d of m.faces!) {
        const dist = faceDistance(f.descriptor, d);
        if (!best || dist < best.distance) best = { member: m, distance: dist };
      }
    if (best && best.distance < threshold && !best.member.isMe && !out.some((o) => o.member.id === best!.member.id)) out.push(best);
  }
  return out.sort((a, b) => a.distance - b.distance);
}

/** Crops a square face thumbnail with some margin. */
export function cropFace(src: HTMLImageElement | HTMLCanvasElement, box: FoundFace['box'], size = 160): Promise<Blob | null> {
  const m = Math.max(box.width, box.height) * 0.35;
  const side = Math.max(box.width, box.height) + 2 * m;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  c.getContext('2d')!.drawImage(src, box.x + box.width / 2 - side / 2, box.y + box.height / 2 - side / 2, side, side, 0, 0, size, size);
  return new Promise((r) => c.toBlob((b) => r(b), 'image/jpeg', 0.85));
}

export async function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
