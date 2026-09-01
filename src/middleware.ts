import { defineMiddleware } from 'astro:middleware';

const BENELUX_COUNTRIES = ['NL', 'BE', 'LU'];

export const onRequest = defineMiddleware(async (context, next) => {
  // If being prerendered at build time, bypass edge logic
  if (context.isPrerendered) {
    return next();
  }

  const { pathname, search } = context.url;

  // 1. Skip if already on the Dutch locale or accessing static/system assets
  if (
    pathname.startsWith('/nl') ||
    pathname.startsWith('/_astro') ||
    pathname.startsWith('/_image') ||
    pathname.startsWith('/api') ||
    pathname.includes('.')
  ) {
    return next();
  }

  // 2. Check for explicit user language preference cookie
  const preferredLocale =
    context.cookies.get('preferred_locale')?.value ||
    context.cookies.get('lang')?.value ||
    context.cookies.get('locale')?.value;

  if (preferredLocale) {
    return next();
  }

  // 3. Extract country header injected at the edge by Vercel
  const country = context.request.headers.get('x-vercel-ip-country')?.toUpperCase();

  // 4. If visitor is within Benelux, redirect to the Dutch localized route
  if (country && BENELUX_COUNTRIES.includes(country)) {
    const targetPath = `/nl${pathname === '/' ? '' : pathname}${search}`;
    return context.redirect(targetPath, 302);
  }

  return next();
});
