/**
 * Date parsers for various broker formats.
 */

const MONTHS_ES: Record<string, string> = {
  ene: "01",
  en: "01",
  feb: "02",
  mar: "03",
  abr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  ago: "08",
  sep: "09",
  oct: "10",
  nov: "11",
  dic: "12",
};

/**
 * Parses a Spanish-locale date like "14 may 2026" or "14 may 2026, 8:43 a. m."
 * Returns ISO date string "YYYY-MM-DD" or null if cannot parse.
 */
export function parseSpanishDate(input: string): string | null {
  if (!input) return null;
  // Normalize: remove AM/PM marker, trim
  const cleaned = input
    .toLowerCase()
    .replace(/a\.\s*m\.|p\.\s*m\./g, "")
    .replace(/\s+/g, " ")
    .trim();

  // Pattern: "14 may 2026" or "14 may 2026, 8:43"
  const match = cleaned.match(/^(\d{1,2})\s+([a-záéíóú]+)\s+(\d{4})/);
  if (!match) return null;

  const day = match[1].padStart(2, "0");
  const monthName = match[2].slice(0, 3);
  const year = match[3];
  const month = MONTHS_ES[monthName];
  if (!month) return null;

  return `${year}-${month}-${day}`;
}

/**
 * Parses eToro date format "01/08/2025 16:00:15" (DD/MM/YYYY HH:MM:SS)
 * Returns "YYYY-MM-DD" or null.
 */
export function parseEtoroDate(input: string): string | null {
  if (!input) return null;
  // Handle ISO date or DD/MM/YYYY HH:MM:SS
  const datePart = input.split(" ")[0] ?? input;
  const parts = datePart.split("/");
  if (parts.length !== 3) return null;
  const [dd, mm, yyyy] = parts;
  if (!dd || !mm || !yyyy) return null;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

/**
 * Parses XTB date format which comes as Excel datetime.
 * Input may be ISO string from XLSX library (cellDates: true) or a raw date.
 * Returns "YYYY-MM-DD" or null.
 */
export function parseXtbDate(input: string | Date | number | null | undefined): string | null {
  if (input === null || input === undefined || input === "") return null;

  // If it's a Date object (from cellDates: true)
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return null;
    return input.toISOString().split("T")[0] ?? null;
  }

  // If it's a number (Excel serial date)
  if (typeof input === "number") {
    const date = new Date(Math.round((input - 25569) * 86400 * 1000));
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().split("T")[0] ?? null;
  }

  // If it's a string, try multiple formats
  const str = String(input).trim();
  if (!str) return null;

  // ISO format "2025-07-14 13:30:03.628000"
  if (str.includes("T") || str.match(/^\d{4}-\d{2}-\d{2}/)) {
    return str.split("T")[0]?.split(" ")[0] ?? null;
  }

  // DD/MM/YYYY format
  const parts = str.split("/");
  if (parts.length === 3) {
    const [dd, mm, yyyy] = parts;
    if (dd && mm && yyyy) {
      return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
    }
  }

  return null;
}

/**
 * Parses a Colombian number with thousands separator "." and decimal ",".
 * Example: "1.500,00" → 1500, "45.447,6100" → 45447.61
 */
export function parseColombianNumber(input: string): number {
  if (!input || input === "-") return 0;
  const sanitized = input
    .replace(/\./g, "") // remove thousands separator
    .replace(/,/g, ".") // decimal comma → dot
    .replace(/[^0-9.\-]/g, "");
  const num = Number.parseFloat(sanitized);
  return Number.isNaN(num) ? 0 : num;
}

/**
 * Parses a generic number that may have thousands separators "," and decimal ".".
 * Example: "1,500.00" → 1500
 */
export function parseEnglishNumber(input: string): number {
  if (!input || input === "-") return 0;
  const sanitized = input.replace(/[^0-9.\-]/g, "");
  const num = Number.parseFloat(sanitized);
  return Number.isNaN(num) ? 0 : num;
}

/**
 * Returns today's date in YYYY-MM-DD format.
 */
export function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
