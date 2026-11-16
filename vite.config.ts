import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves the app from /<repo>/. Override with BASE=/ for local use.
const base = process.env.BASE ?? '/Oshikatsu-Diary/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Oshi Log',
        short_name: 'Oshi Log',
        description: 'Your chekis, 特典会 memos, lives and recaps.',
        lang: 'ja',
        theme_color: '#d22e6d',
        background_color: '#fbf5f7',
        display: 'standalone',
        start_url: base,
        scope: base,
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: `${base}index.html`,
        globIgnores: ['**/models/**', '**/feeds/**'],
        // Face models are large: cache them the first time face matching is used.
        // Group calendars change: always try the network first, fall back to the last copy offline.
        runtimeCaching: [
          { urlPattern: /\/models\//, handler: 'CacheFirst', options: { cacheName: 'face-models' } },
          { urlPattern: /\/feeds\/.*\.json$/, handler: 'NetworkFirst', options: { cacheName: 'group-calendars', networkTimeoutSeconds: 5 } },
        ],
      },
    }),
  ],
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
