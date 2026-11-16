export const pad = (n: number) => String(n).padStart(2, '0');
export const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => iso(new Date());
export const yen = (n: number | undefined) => '¥' + Math.round(+(n ?? 0) || 0).toLocaleString('ja-JP');
export const yenShort = (n: number) =>
  !n ? '' : n >= 10000 ? '¥' + Math.round(n / 1000) + 'k' : n >= 1000 ? '¥' + (n / 1000).toFixed(1) + 'k' : yen(n);
const WD = ['日', '月', '火', '水', '木', '金', '土'];
export function fmtDate(s?: string): string {
  if (!s) return '';
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return `${y !== new Date().getFullYear() ? y + '/' : ''}${m}/${d} (${WD[dt.getDay()]})`;
}
/** "11/22 (日)–11/23 (月)" for a live over several days, otherwise the single date. */
export function fmtRange(s?: string, e?: string): string {
  if (!s) return '';
  if (!e || e <= s) return fmtDate(s);
  return `${fmtDate(s)}–${fmtDate(e).replace(/^\d{4}\//, '')}`;
}
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
