import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import vercel from '@astrojs/vercel';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://thijsraaijmakers.me',
  output: 'static',
  adapter: vercel(),
  integrations: [sitemap()],
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