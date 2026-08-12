import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png'],
      manifest: {
        name: 'The Mews Arcade',
        short_name: 'The Mews',
        description: 'Chess, hex chess, and a fighting game about dead philosophers',
        theme_color: '#0f0f1a',
        background_color: '#0f0f1a',
        display: 'standalone',
        // 'any', not 'landscape': the chess and hex modes are portrait-designed, and
        // manifest orientation is app-wide. The fight screen asks for landscape itself
        // via the Screen Orientation API, with a rotate-prompt fallback for iOS.
        orientation: 'any',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        // Never precache the OpenCV wasm blob (~9 MB). It is a Rig Studio tool loaded
        // on demand; without this every player downloads it on first visit, including
        // everyone who never opens the editor.
        globIgnores: ['**/vendor/opencv/**'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
});
