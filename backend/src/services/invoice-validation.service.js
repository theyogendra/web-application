const supabase = require('../config/supabase');

const ALLOWED_GST_RATES = [0, 5, 12, 18, 28];

const validateInvoicePayload = async (payload, context = {}) => {
  const { isUpdate = false, currentInvoiceId = null } = context;
  const errors = [];
  const warnings = [];
  
  const {
    customer_id,
    vendor_id,
    invoice_number,
    items = [],
    subtotal: frontendSubtotal,
    discount: frontendDiscount,
    tax_amount: frontendTax,
    grand_total: frontendGrandTotal
  } = payload;

  // 1. Customer & Vendor Checks
  // A denormalized customer_name satisfies the requirement on its own;
  // a linked customer_id / vendor_id is still validated when present.
  if (!customer_id && !vendor_id && !payload.customer_name) {
    errors.push({ code: 'CUSTOMER_REQUIRED', message: 'Customer name (or a customer/vendor record) is required.' });
  }
  if (customer_id) {
    const { data: customer } = await supabase.from('customers').select('id, gst_number').eq('id', customer_id).single();
    if (!customer) {
      errors.push({ code: 'CUSTOMER_NOT_FOUND', message: 'Customer does not exist.' });
    } else if (customer.gst_number && customer.gst_number.length !== 15) {
      warnings.push({ code: 'INVALID_GST_NUMBER', message: 'Customer GST number format may be invalid (expected 15 chars).' });
    }
  }
  if (vendor_id) {
    const { data: vendor } = await supabase.from('vendors').select('id, gst_number').eq('id', vendor_id).single();
    if (!vendor) {
      errors.push({ code: 'VENDOR_NOT_FOUND', message: 'Vendor does not exist.' });
    }
  }

  // 2. Duplicate Invoice Number Check
  if (invoice_number) {
    let query = supabase.from('invoices').select('id').eq('invoice_number', invoice_number);
    if (isUpdate && currentInvoiceId) {
      query = query.neq('id', currentInvoiceId);
    }
    const { data: duplicate } = await query.maybeSingle();
    if (duplicate) {
      errors.push({ code: 'DUPLICATE_INVOICE_NUMBER', message: 'Invoice number already exists.' });
    }
  }

  // 3. Items Integrity & Recalculation
  let calculatedSubtotal = 0;
  let calculatedDiscount = 0;
  let calculatedTax = 0;
  let calculatedGrandTotal = 0;
  const normalizedItems = [];

  // Batch-load every referenced product in a single query (was N+1 before).
  const productIds = Array.from(new Set(items.map((it) => it.product_id).filter(Boolean)));
  const productById = new Map();
  if (productIds.length > 0) {
    const { data: products } = await supabase.from('products').select('*').in('id', productIds);
    for (const p of products || []) productById.set(p.id, p);
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const qty = parseFloat(item.quantity) || 0;
    const price = parseFloat(item.unit_price) || 0;
    const discountPercent = parseFloat(item.discount) || 0; // assuming discount is percentage in this check
    const taxRate = parseFloat(item.tax_rate) || 0;

    let productDetails = null;

    if (!item.product_id && !item.description) {
      errors.push({ code: 'MISSING_DESCRIPTION', field: `items[${i}]`, message: 'Description is required if product is not selected.' });
    }

    if (item.product_id) {
      const product = productById.get(item.product_id);
      if (!product) {
        errors.push({ code: 'PRODUCT_NOT_FOUND', field: `items[${i}]`, message: 'Product does not exist.' });
      } else {
        productDetails = product;
        if (price < product.price) {
          warnings.push({ code: 'PRICE_BELOW_ALLOWED', field: `items[${i}]`, message: `Price ${price} is below standard price ${product.price}.` });
        }
      }
    }

    if (qty <= 0) errors.push({ code: 'INVALID_QUANTITY', field: `items[${i}].quantity`, message: 'Quantity must be greater than 0' });
    if (price < 0) errors.push({ code: 'INVALID_PRICE', field: `items[${i}].unit_price`, message: 'Price cannot be negative' });
    if (discountPercent < 0 || discountPercent > 100) {
      errors.push({ code: 'INVALID_DISCOUNT', field: `items[${i}].discount`, message: 'Discount must be between 0 and 100' });
    }
    if (!ALLOWED_GST_RATES.includes(taxRate)) {
      warnings.push({ code: 'INVALID_GST_RATE', field: `items[${i}].tax_rate`, message: `Tax rate ${taxRate}% is not a standard GST rate.` });
    }

    const lineSubtotal = qty * price;
    const itemDiscountAmount = (lineSubtotal * discountPercent) / 100;
    const taxableAmount = lineSubtotal - itemDiscountAmount;
    const itemTaxAmount = (taxableAmount * taxRate) / 100;
    const lineTotal = taxableAmount + itemTaxAmount;

    calculatedSubtotal += lineSubtotal;
    calculatedDiscount += itemDiscountAmount;
    calculatedTax += itemTaxAmount;
    calculatedGrandTotal += lineTotal;

    normalizedItems.push({
      product_id: item.product_id || null,
      description: item.description || null,
      quantity: qty,
      unit_price: price,
      discount: discountPercent,
      tax_rate: taxRate,
      // newly added fields from phase 2
      expected_unit_price: productDetails ? productDetails.price : price,
      price_variance: productDetails ? (price - productDetails.price) : 0,
      line_subtotal: Number(lineSubtotal.toFixed(2)),
      discount_amount: Number(itemDiscountAmount.toFixed(2)),
      tax_amount: Number(itemTaxAmount.toFixed(2)),
      line_total: Number(lineTotal.toFixed(2)),
      total: Number(lineTotal.toFixed(2)) // mapped for backward compatibility in Phase 1
    });
  }

  calculatedSubtotal = Number(calculatedSubtotal.toFixed(2));
  calculatedDiscount = Number(calculatedDiscount.toFixed(2));
  calculatedTax = Number(calculatedTax.toFixed(2));
  calculatedGrandTotal = Number(calculatedGrandTotal.toFixed(2));

  // Check if frontend matches
  if (frontendSubtotal !== undefined && Number(frontendSubtotal) !== calculatedSubtotal) {
    warnings.push({ code: 'FRONTEND_TOTAL_MISMATCH', message: `Frontend subtotal ${frontendSubtotal} mismatch with backend ${calculatedSubtotal}` });
  }
  if (frontendGrandTotal !== undefined && Number(frontendGrandTotal) !== calculatedGrandTotal) {
    warnings.push({ code: 'FRONTEND_TOTAL_MISMATCH', message: `Frontend grand total ${frontendGrandTotal} mismatch with backend ${calculatedGrandTotal}` });
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    calculatedTotals: {
      subtotal: calculatedSubtotal,
      discount_amount: calculatedDiscount,
      tax_amount: calculatedTax,
      grand_total: calculatedGrandTotal
    },
    normalizedItems
  };
};

module.exports = {
  validateInvoicePayload
};
