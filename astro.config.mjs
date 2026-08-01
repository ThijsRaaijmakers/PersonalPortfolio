import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import vercel from '@astrojs/vercel';

// https://astro.build/config
export default defineConfig({
  output: 'static',
  adapter: vercel(),
  i18n: {
    defaultLocale: "en",
    locales: ["en", "nl"],
    routing: {
      prefixDefaultLocale: false
    }
  },
  server: {
    allowedHosts: true
  },
  vite: {
    plugins: [tailwindcss()]
  }
});