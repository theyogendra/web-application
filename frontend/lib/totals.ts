// Client-side totals calculation that mirrors the backend formula.
// Per line:
//   lineSubtotal = qty * price
//   discountAmt  = lineSubtotal * discount / 100
//   taxable      = lineSubtotal - discountAmt
//   tax          = taxable * taxRate / 100
//   lineTotal    = taxable + tax

export type LineItemInput = {
  description?: string;
  quantity?: any;
  unit_price?: any;
  discount?: any;
  tax_rate?: any;
};

export type Totals = {
  subtotal: number;
  discount: number;
  tax_amount: number;
  grand_total: number;
};

function num(v: any): number {
  const n = Number(v);
  return isFinite(n) ? n : 0;
}

export function computeLineTotal(item: LineItemInput): {
  lineSubtotal: number;
  discountAmt: number;
  taxable: number;
  tax: number;
  lineTotal: number;
} {
  const qty = num(item.quantity);
  const price = num(item.unit_price);
  const discount = num(item.discount);
  const taxRate = num(item.tax_rate);

  const lineSubtotal = qty * price;
  const discountAmt = (lineSubtotal * discount) / 100;
  const taxable = lineSubtotal - discountAmt;
  const tax = (taxable * taxRate) / 100;
  const lineTotal = taxable + tax;

  return { lineSubtotal, discountAmt, taxable, tax, lineTotal };
}

export function computeTotals(items: LineItemInput[]): Totals {
  let subtotal = 0;
  let discount = 0;
  let tax_amount = 0;
  let grand_total = 0;

  for (const item of items || []) {
    const r = computeLineTotal(item);
    subtotal += r.lineSubtotal;
    discount += r.discountAmt;
    tax_amount += r.tax;
    grand_total += r.lineTotal;
  }

  return { subtotal, discount, tax_amount, grand_total };
}
