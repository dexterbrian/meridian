// CSV export. RFC 4180 quoting. Cells that a spreadsheet would treat as a
// formula (=, +, -, @) get a leading apostrophe so an export cannot run code.

export type CsvRow = Record<string, string | number | null | undefined>;

function cell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let s = typeof value === "number" ? String(value) : value;
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(columns: { key: string; label: string }[], rows: CsvRow[]): string {
  const head = columns.map((c) => cell(c.label)).join(",");
  const body = rows.map((r) => columns.map((c) => cell(r[c.key])).join(","));
  return [head, ...body].join("\r\n") + "\r\n";
}
