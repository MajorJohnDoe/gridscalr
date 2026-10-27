/** Local `YYYY-MM-DD HH:mm` timestamp for table columns, CSV and tooltips. */
export function formatTimestamp(value: string | undefined | null): string {
  if (!value) return "–";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "–";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/** Epoch milliseconds for sorting, or 0 when the timestamp is missing. */
export function timestampValue(value: string | undefined | null): number {
  if (!value) return 0;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}
