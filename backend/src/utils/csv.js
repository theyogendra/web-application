// Minimal, dependency-free CSV serializer.
// Each column resolves its cell value from, in order of precedence:
//   value()  -> a function called with the row
//   value    -> a string treated as a row property name
//   key      -> a string treated as a row property name
// columns: [{ key?, label?, value? }]
function toCsv(rows = [], columns = []) {
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };

  const cell = (c, row) => {
    if (typeof c.value === 'function') return c.value(row);
    if (typeof c.value === 'string') return row[c.value];
    return row[c.key];
  };

  const header = columns.map((c) => esc(c.label || c.key)).join(',');
  const lines = rows.map((row) => columns.map((c) => esc(cell(c, row))).join(','));

  return [header, ...lines].join('\r\n');
}

module.exports = { toCsv };
