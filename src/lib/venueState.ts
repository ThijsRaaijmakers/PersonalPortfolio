export type TradingVenue = 'paper' | 'live';

const STORAGE_KEY = 'quant_active_venue';
const COOKIE_NAME = 'quant_venue';

export function isValidVenue(val: unknown): val is TradingVenue {
  return val === 'paper' || val === 'live';
}

export function getActiveVenue(defaultVenue: TradingVenue = 'paper'): TradingVenue {
  if (typeof window === 'undefined') return defaultVenue;

  // 1. Als er nog een legacy ?venue= in de URL staat, adopteer die en strip hem direct
  const url = new URL(window.location.href);
  const urlVenue = url.searchParams.get('venue')?.toLowerCase();
  if (isValidVenue(urlVenue)) {
    setActiveVenue(urlVenue);
    stripVenueFromCurrentUrl();
    return urlVenue;
  }

  // 2. Lees uit sessionStorage of localStorage
  try {
    const sessionVal = window.sessionStorage.getItem(STORAGE_KEY);
    if (isValidVenue(sessionVal)) return sessionVal;
    const localVal = window.localStorage.getItem(STORAGE_KEY);
    if (isValidVenue(localVal)) return localVal;
  } catch {
    // Negeer storage errors in private browsing
  }

  // 3. Lees uit cookie
  const match = document.cookie.match(new RegExp('(?:^|; )' + COOKIE_NAME + '=([^;]*)'));
  const cookieVal = match ? decodeURIComponent(match[1]) : null;
  if (isValidVenue(cookieVal)) return cookieVal;

  return defaultVenue;
}

export function setActiveVenue(venue: TradingVenue): void {
  if (typeof window === 'undefined' || !isValidVenue(venue)) return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, venue);
    window.localStorage.setItem(STORAGE_KEY, venue);
  } catch {
    // Ignore storage quota/privacy errors
  }
  document.cookie = `${COOKIE_NAME}=${venue}; path=/; max-age=31536000; SameSite=Lax`;
  stripVenueFromCurrentUrl();
  window.dispatchEvent(new CustomEvent('quant:venue-change', { detail: { venue } }));
}

export function stripVenueFromCurrentUrl(): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  let mutated = false;

  if (url.searchParams.has('venue')) {
    url.searchParams.delete('venue');
    mutated = true;
  }

  // Repareer eventuele corrupte parameters zoals ?date=2026-06-15?venue=paper
  for (const [key, val] of Array.from(url.searchParams.entries())) {
    if (val.includes('?venue=') || val.includes('&venue=')) {
      const cleanVal = val.split(/[?&]venue=/)[0];
      url.searchParams.set(key, cleanVal);
      mutated = true;
    }
  }

  if (mutated) {
    const cleanSearch = url.searchParams.toString();
    const cleanHref = `${url.pathname}${cleanSearch ? `?${cleanSearch}` : ''}${url.hash}`;
    window.history.replaceState(window.history.state, '', cleanHref);
  }
}

