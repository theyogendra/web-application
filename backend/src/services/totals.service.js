// Shared per-line totals math used by quotations / proposals / (and the
// invoice validator). Discount and tax_rate are percentages (0-100).

const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;

function calculateTotals(items = []) {
  let subtotal = 0;
  let discount = 0;
  let tax = 0;
  let grand = 0;
  const normalized = [];

  for (const raw of items) {
    const qty = Number(raw.quantity) || 0;
    const price = Number(raw.unit_price) || 0;
    const discPct = Math.max(0, Math.min(100, Number(raw.discount) || 0));
    const taxRate = Math.max(0, Number(raw.tax_rate) || 0);

    const lineSubtotal = qty * price;
    const discountAmount = (lineSubtotal * discPct) / 100;
    const taxable = lineSubtotal - discountAmount;
    const taxAmount = (taxable * taxRate) / 100;
    const lineTotal = taxable + taxAmount;

    subtotal += lineSubtotal;
    discount += discountAmount;
    tax += taxAmount;
    grand += lineTotal;

    normalized.push({
      product_id: raw.product_id || null,
      description: raw.description || null,
      quantity: qty,
      unit_price: round2(price),
      discount: discPct,
      discount_amount: round2(discountAmount),
      tax_rate: taxRate,
      tax_amount: round2(taxAmount),
      line_subtotal: round2(lineSubtotal),
      line_total: round2(lineTotal),
      total: round2(lineTotal),
    });
  }

  return {
    items: normalized,
    totals: {
      subtotal: round2(subtotal),
      discount: round2(discount),
      tax_amount: round2(tax),
      grand_total: round2(grand),
    },
  };
}

module.exports = { calculateTotals, round2 };
