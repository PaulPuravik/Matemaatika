/** Formats a timestamp for Estonian readers, e.g. "14. august 2026 kell 16:00". */
export function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("et-EE", {
    dateStyle: "long",
    timeStyle: "short",
  });
}

/** Formats a date-only column without letting the viewer's timezone shift it. */
export function formatDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("et-EE", {
    dateStyle: "long",
    timeZone: "UTC",
  });
}

/** Value for a datetime-local input, in the viewer's local time. */
export function toLocalInputValue(value: string): string {
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}
