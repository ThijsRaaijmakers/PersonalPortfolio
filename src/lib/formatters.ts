export function formatEngineCapacity(cc: number | null | undefined): string {
  if (!cc) return 'N/A';
  return cc >= 1000 ? `${(cc / 1000).toFixed(1)}L` : `${cc}cc`;
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return 'N/A';
  const p = dateStr.split('-');
  return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : dateStr;
}

export function formatPrice(price: number | null | undefined): string {
  if (!price) return 'Unknown';
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0
  }).format(price);
}

export function formatVehicleTitle(
  year: number | null | undefined,
  make: string | null | undefined,
  model: string | null | undefined
): string {
  const y = year ? `${year} ` : '';
  const mk = (make || '').trim();
  let md = (model || '').trim();
  
  // If model already starts with make (e.g. Make: "Opel", Model: "Opel Astra"), prevent duplication
  if (mk && md.toLowerCase().startsWith(mk.toLowerCase())) {
    md = md.substring(mk.length).trim();
  }
  
  return `${y}${mk} ${md}`.replace(/\s+/g, ' ').trim();
}
