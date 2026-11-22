import * as XLSX from "xlsx";

export type FileFormat = "csv" | "xlsx" | "xls" | "html" | "unknown";

export type RawSheet = {
  name: string;
  rows: Record<string, string>[];
  rawNumbers?: (number | undefined)[];
};

export type RawFileContent = {
  format: FileFormat;
  sheets: RawSheet[];
};

export type ReadFileOptions = {
  /**
   * For XLSX files, optionally skip the first N rows before treating the
   * next row as the header. Useful for sheets with metadata rows.
   */
  skipRows?: Record<string, number>;
  rawNumberColumn?: string;
};

/**
 * Detects the file format based on the file extension and/or content.
 */
export function detectFormat(
  fileName: string,
  buffer?: ArrayBuffer,
): FileFormat {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  if (ext === "csv") return "csv";
  if (ext === "xlsx") return "xlsx";
  if (ext === "xls") {
    if (buffer) {
      // Check if it's actually HTML
      const decoder = new TextDecoder("utf-8");
      const head = decoder.decode(buffer.slice(0, 512)).trim();
      if (head.startsWith("<") || head.includes("<table") || head.includes("<html")) {
        return "html";
      }
    }
    return "xls";
  }
  return "unknown";
}

/**
 * Reads a file buffer and returns a normalized structure with sheets and rows.
 * Each row is a Record<string, string> with trimmed headers and stringified values.
 */
export function readFile(
  fileName: string,
  buffer: ArrayBuffer,
  options?: ReadFileOptions,
): RawFileContent {
  const format = detectFormat(fileName, buffer);

  if (format === "csv") {
    const decoder = new TextDecoder("utf-8");
    const text = decoder.decode(buffer);
    return { format, sheets: [{ name: "csv", rows: parseCsvText(text) }] };
  }

  if (format === "xlsx" || format === "xls") {
    const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
    const sheets: RawSheet[] = workbook.SheetNames.map((name) => {
      const skip = options?.skipRows?.[name] ?? 0;
      const sheet = workbook.Sheets[name];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        raw: false,
        defval: "",
        blankrows: false,
        range: skip > 0 ? skip : undefined,
      });
      const column = options?.rawNumberColumn;
      const rawByRow = column && new Map(XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        raw: true, range: skip > 0 ? skip : undefined,
      }).map((row) => [row.__rowNum__, row[column]]));
      return {
        name,
        rows: rows.map((row) => stringifyRow(row)),
        ...(rawByRow ? { rawNumbers: rows.map((row) => {
          const value = rawByRow.get(row.__rowNum__);
          return typeof value === "number" ? value : undefined;
        }) } : {}),
      };
    });
    return { format, sheets };
  }

  if (format === "html") {
    const decoder = new TextDecoder("utf-8");
    const text = decoder.decode(buffer);
    return { format, sheets: [{ name: "html", rows: parseHtmlTable(text) }] };
  }

  throw new Error(`Formato de archivo no soportado: ${fileName}`);
}

/**
 * Parses CSV text into rows. Handles quoted fields and commas inside quotes.
 */
function parseCsvText(text: string): Record<string, string>[] {
  const lines = splitCsvLines(text);
  if (lines.length === 0) return [];

  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    if (fields.every((f) => f === "")) continue;
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      const header = headers[j];
      if (header) {
        row[header] = (fields[j] ?? "").trim();
      }
    }
    rows.push(row);
  }

  return rows;
}

/**
 * Splits CSV text into logical lines, respecting quoted fields with newlines.
 */
function splitCsvLines(text: string): string[] {
  const lines: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      current += ch;
    } else if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (current.length > 0) {
        lines.push(current);
        current = "";
      }
      // Skip \r in \r\n
      if (ch === "\r" && text[i + 1] === "\n") i++;
    } else {
      current += ch;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines;
}

/**
 * Parses a single CSV line into fields, respecting quoted values.
 */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

/**
 * Extracts the first <table> from an HTML document and parses it into rows.
 * Used for eTrading Bancolombia's "XLS" file which is actually HTML.
 */
function parseHtmlTable(html: string): Record<string, string>[] {
  // Find the first <table> ... </table>
  const tableMatch = html.match(/<table[\s\S]*?<\/table>/i);
  if (!tableMatch) return [];

  const tableHtml = tableMatch[0];
  // Extract <tr> rows
  const rowMatches = tableHtml.match(/<tr[\s\S]*?<\/tr>/gi) ?? [];

  if (rowMatches.length < 2) return [];

  // First row = headers
  const firstRow = rowMatches[0];
  if (!firstRow) return [];
  const headerCells = extractCells(firstRow);
  const headers = headerCells.map((c) => stripTags(c).trim());

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < rowMatches.length; i++) {
    const cells = extractCells(rowMatches[i]);
    if (cells.every((c) => stripTags(c).trim() === "")) continue;
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      const header = headers[j];
      if (header) {
        row[header] = stripTags(cells[j] ?? "").trim();
      }
    }
    rows.push(row);
  }

  return rows;
}

function extractCells(trHtml: string): string[] {
  const cells: string[] = [];
  const cellRegex = /<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi;
  let match: RegExpExecArray | null;
  while ((match = cellRegex.exec(trHtml)) !== null) {
    cells.push(match[1]);
  }
  return cells;
}

function stripTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stringifyRow(row: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value === null || value === undefined) {
      result[key] = "";
    } else if (value instanceof Date) {
      result[key] = value.toISOString();
    } else {
      result[key] = String(value).trim();
    }
  }
  return result;
}
