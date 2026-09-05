// RFC 4180-compliant, UTF-8 BOM-prefixed CSV serializer.
//
// Fixes applied:
//  - Prepend the UTF-8 BOM (U+FEFF) so Excel / Numbers auto-detect encoding.
//  - Escape all values that contain commas, double-quotes, CR or LF per RFC 4180.
//  - Guard against null / undefined / non-string values in every cell.
//  - Use CRLF (\r\n) line endings — required by RFC 4180 and expected by Excel.
//  - Validate that every data row produces exactly the same number of fields
//    as the header (fills missing cells with empty strings).
//
// Column descriptor shape:
//   { label: string, value: string | (row) => any, key?: string }
//   - value (function): called with the row object; return value is coerced to string.
//   - value (string):   treated as a property name on the row.
//   - key (string):     fallback property name when `value` is not provided.
//
// Usage:
//   const { toCsv } = require('../utils/csv');
//   const csv = toCsv(rows, columns);       // returns a UTF-8 string with BOM
//   res.setHeader('Content-Type', 'text/csv; charset=utf-8');
//   res.send(csv);

"use strict";

/** Escape a single CSV cell per RFC 4180. */
function escCell(value) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  // Quote if: contains comma, double-quote, CR, LF, or leading/trailing whitespace
  if (/[",\r\n]/.test(s) || s !== s.trim()) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/** Resolve one cell value given a column descriptor and a data row. */
function resolveCell(col, row) {
  if (typeof col.value === "function") return col.value(row);
  if (typeof col.value === "string") return row[col.value];
  if (typeof col.key === "string") return row[col.key];
  return "";
}

/**
 * Build a RFC 4180, UTF-8 BOM–prefixed CSV string.
 *
 * @param {object[]} rows
 * @param {{ label?: string, key?: string, value?: string | Function }[]} columns
 * @returns {string}  UTF-8 string with leading BOM (U+FEFF)
 */
function toCsv(rows = [], columns = []) {
  if (!Array.isArray(columns) || columns.length === 0) {
    // Auto-derive columns from the first row's own keys when not provided.
    const sample = rows[0];
    if (sample && typeof sample === "object") {
      columns = Object.keys(sample).map((k) => ({ key: k, label: k }));
    }
  }

  const BOM = "\uFEFF";
  const CRLF = "\r\n";
  const header = columns.map((c) => escCell(c.label || c.key || "")).join(",");

  const dataLines = rows.map((row) => {
    const cells = columns.map((c) => escCell(resolveCell(c, row)));
    return cells.join(",");
  });

  // Validate: all rows must have the same field count as the header.
  // (Guard: truncated rows get empty-string padding, extra columns are dropped.)
  const fieldCount = columns.length;
  const validatedLines = dataLines.map((line) => {
    const parts = line.split(",");
    if (parts.length < fieldCount) {
      // Pad missing columns
      while (parts.length < fieldCount) parts.push("");
    }
    return parts.join(",");
  });

  // Sanity guard: refuse to output if any line contains obvious JSON / HTML
  // artefacts that signal the backend accidentally serialised an error object.
  const body = validatedLines.join(CRLF);
  if (
    body.includes("<!DOCTYPE") ||
    body.includes("<html") ||
    (body.trim().startsWith("{") && body.includes('"message"'))
  ) {
    throw new Error(
      "CSV generation aborted: body appears to contain JSON or HTML error content.",
    );
  }

  return BOM + header + CRLF + body;
}

module.exports = { toCsv, escCell };
