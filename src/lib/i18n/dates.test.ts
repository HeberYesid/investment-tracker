import { expect, it } from "vitest";
import { formatRelativeEs } from "./dates";

const now = new Date("2026-06-17T23:32:00Z");
it.each([
  ["2026-06-17T23:32:00Z", "ahora"], ["2026-06-17T23:27:00Z", "hace 5 min"],
  ["2026-06-17T22:32:00Z", "hace 1 h"], ["2026-06-17T21:18:00Z", "hace 2 h 14 min"],
  ["2026-06-16T23:32:00Z", "ayer 18:32"], ["2026-06-09T23:32:00Z", "9 jun 18:32"],
])("formatea %s en español", (iso, expected) => expect(formatRelativeEs(iso, now)).toBe(expected));
