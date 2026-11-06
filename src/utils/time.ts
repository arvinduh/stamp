/**
 * @fileoverview Human-friendly timestamp formatting.
 */

/** Parses an ISO time, or returns null when it is blank or invalid. */
function parse(iso: string): Date | null {
  const date = new Date(iso);
  return iso && !Number.isNaN(date.getTime()) ? date : null;
}

/** Formats an ISO time as "11/02/2026" (mm/dd/yyyy). */
export function formatDate(iso: string): string {
  const date = parse(iso);
  if (!date) {
    return "";
  }
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${mm}/${dd}/${date.getFullYear()}`;
}

/** Formats an ISO time as "11/02/2026, 3:04 PM". */
export function formatDateTime(iso: string): string {
  const date = parse(iso);
  if (!date) {
    return "";
  }
  const time = date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${formatDate(iso)}, ${time}`;
}
