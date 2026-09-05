// Unit test for the csv.js utility
const { toCsv, escCell } = require("../utils/csv");

let passed = 0;
let failed = 0;

function assert(desc, actual, expected) {
  if (actual === expected) {
    console.log(`  ✓ ${desc}`);
    passed++;
  } else {
    console.error(`  ✗ ${desc}`);
    console.error(`    Expected: ${JSON.stringify(expected)}`);
    console.error(`    Got:      ${JSON.stringify(actual)}`);
    failed++;
  }
}

// ── escCell tests ──────────────────────────────────────────────────────────────
console.log("\nescCell:");
assert("null → empty string", escCell(null), "");
assert("undefined → empty string", escCell(undefined), "");
assert("plain text passthrough", escCell("hello"), "hello");
assert("comma triggers quoting", escCell("a,b"), '"a,b"');
assert("double-quote escaping", escCell('say "hi"'), '"say ""hi"""');
assert("newline triggers quoting", escCell("line1\nline2"), '"line1\nline2"');
assert("number coercion", escCell(42), "42");
assert("zero", escCell(0), "0");

// ── toCsv tests ────────────────────────────────────────────────────────────────
console.log("\ntoCsv:");
const rows = [
  { invoice: "INV-0001", customer: "Acme, Inc.", total: 1234.56 },
  { invoice: "INV-0002", customer: 'Say "Hello" Ltd', total: 0 },
  { invoice: "INV-0003", customer: null, total: null },
];
const columns = [
  { label: "Invoice No", key: "invoice" },
  { label: "Customer", key: "customer" },
  { label: "Total", key: "total" },
];

const csv = toCsv(rows, columns);

// BOM
assert("starts with UTF-8 BOM", csv.charCodeAt(0), 0xfeff);

// Header
assert(
  "header row correct",
  csv.split("\r\n")[1], // line 1 (after BOM at pos 0, line 0 is header)
  "Invoice No,Customer,Total",
);

// BOM is first char — split gives: ['', 'Invoice No,...', 'INV-0001,...', ...]
// Actually BOM is inside the string, not a separate line. Let's check differently.
const lines = csv.replace(/^\uFEFF/, "").split("\r\n");
assert("header line", lines[0], "Invoice No,Customer,Total");
assert(
  "row 1 comma in value quoted",
  lines[1],
  'INV-0001,"Acme, Inc.",1234.56',
);
assert(
  "row 2 double-quote escaped",
  lines[2],
  'INV-0002,"Say ""Hello"" Ltd",0',
);
assert("row 3 null values empty", lines[3], "INV-0003,,");

// CRLF
assert("uses CRLF line endings", csv.includes("\r\n"), true);

// Function value accessor
const csv2 = toCsv(
  [{ a: "x", b: "y" }],
  [{ label: "Derived", value: (r) => r.a + "-" + r.b }],
);
const lines2 = csv2.replace(/^\uFEFF/, "").split("\r\n");
assert("function value accessor", lines2[1], "x-y");

// Auto-column derivation
const csv3 = toCsv([{ name: "Alice", age: 30 }]);
const lines3 = csv3.replace(/^\uFEFF/, "").split("\r\n");
assert("auto-column header", lines3[0], "name,age");
assert("auto-column data", lines3[1], "Alice,30");

// ── Summary ────────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
