import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['hr-logo.png', 'pwa-icon.svg'],
      manifest: {
        name: 'HydraRoll Management App',
        short_name: 'HydraRoll',
        description: 'HydraRoll heavy transport equipment service management.',
        theme_color: '#00a9e8',
        background_color: '#f4f6f7',
        display: 'standalone',
        start_url: '/',
        icons: [{ src: '/pwa-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        runtimeCaching: [],
      },
    }),
  ],
  test: { environment: 'node' },
});
