import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'logo-ciruela.png'],
      manifest: {
        name: 'Uniform.ar',
        short_name: 'Uniform.ar',
        description: 'Contenidos, calendario y proyectos de Uniform.ar',
        lang: 'es-AR',
        start_url: './',
        display: 'standalone',
        theme_color: '#775D66',
        background_color: '#F6F4F3',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Solo se cachea el shell; los datos siempre van a la red
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/health/, /^\/privacidad\.html$/],
        runtimeCaching: [],
      },
    }),
  ],
  server: { proxy: { '/api': 'http://localhost:3000' } },
  test: { environment: 'jsdom', setupFiles: './test/setup.js', globals: true, css: { modules: { classNameStrategy: 'non-scoped' } } },
});
