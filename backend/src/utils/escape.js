// Sanitize a user-supplied search term before interpolating it into a
// PostgREST `.or(...)` or `.ilike(...)` filter.
//
// PostgREST uses `,` and `()` as filter syntax tokens and passes `%` / `_`
// through to SQL `LIKE`. If we drop user input straight into the filter
// string, a query like `?search=a,b.eq.1` rewrites the OR filter (injection).
// Strip those characters entirely — for an SMB search box, the loss of
// literal `%` searches is acceptable.
function sanitizeSearch(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[,()*%_\\]/g, '');
}

// Escape user-supplied text before embedding it in HTML (e.g. invoice /
// receipt email templates). Anything that lands in `${...}` inside a
// template literal that produces HTML MUST go through this.
function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = { sanitizeSearch, escapeHtml };
