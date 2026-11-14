// Copies the three face-api models the app uses into public/models so they ship with the app
// (works offline, no CDN). Runs before dev and build.
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(root, 'node_modules/@vladmandic/face-api/model');
const to = join(root, 'public/models');
mkdirSync(to, { recursive: true });
for (const name of ['ssd_mobilenetv1_model', 'face_landmark_68_model', 'face_recognition_model']) {
  for (const ext of ['-weights_manifest.json', '.bin']) copyFileSync(join(from, name + ext), join(to, name + ext));
}
console.log('face models copied to public/models');
