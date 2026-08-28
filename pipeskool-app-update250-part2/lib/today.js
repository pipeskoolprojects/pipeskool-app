// Local date in YYYY-MM-DD (not UTC) — avoids the "day behind" issue late at night in IST
export function todayLocal() {
  const d = new Date();
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
}
export function monthLocal() {
  return todayLocal().slice(0, 7);
}
