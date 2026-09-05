# Stock Control Test Payloads & Examples

These examples demonstrate how to test the Phase 3 Stock Control features.
All endpoints are relative to `POST /api/v1/invoices/:id`.

## Pre-requisites

1. A submitted invoice with valid products.

## Scenario 1: Stock Check (Sufficient Stock)

`GET /api/v1/invoices/:id/stock-check`

**Expected Response:**

```json
{
  "success": true,
  "data": {
    "invoice_id": "...",
    "stock_status": "not_reserved",
    "items": [
      {
        "invoice_item_id": "...",
        "product_id": "1",
        "required_quantity": 5,
        "available_stock": 10,
        "can_fulfill": true
      }
    ],
    "can_fulfill_all": true
  }
}
```

## Scenario 2: Stock Check (Insufficient Stock)

If product stock was updated to `4`, the same call returns:

**Expected Response:**

```json
...
        "required_quantity": 5,
        "available_stock": 4,
        "can_fulfill": false
...
    "can_fulfill_all": false
```

## Scenario 3: Reserve Stock Successfully

`POST /api/v1/invoices/:id/reserve-stock`

**Conditions:** Invoice `status = 'submitted'`, `stock_status = 'not_reserved'`, `can_fulfill_all = true`.
**Expected Outcome:**

- HTTP 200
- `product.stock` reduces by quantity.
- `invoices.stock_status` becomes `'reserved'`.
- `invoice_items.stock_reserved` becomes `true`.
- `stock_movements` logs `'invoice_reserve'`.

## Scenario 4: Prevent Duplicate Reservation

`POST /api/v1/invoices/:id/reserve-stock` (calling again on a reserved invoice)

**Expected Outcome:**

- HTTP 400
- `message: "Stock is already reserved or reduced"`
- No double deduction.

## Scenario 5: Confirm Stock From Reserved State

`POST /api/v1/invoices/:id/confirm-stock`

**Expected Outcome:**

- HTTP 200
- `product.stock` does NOT reduce again.
- `invoice_items.stock_reserved` becomes `false`, `stock_reduced` becomes `true`.
- `invoices.stock_status` becomes `'reduced'`.
- `invoices.status` becomes `'confirmed'`.
- `stock_movements` logs `'invoice_confirm'` with `0` quantity change (logical commit).

## Scenario 6: Confirm Stock Directly (Skipping Reserve)

If invoice `stock_status = 'not_reserved'` and you call `POST /api/v1/invoices/:id/confirm-stock` directly:

**Expected Outcome:**

- `product.stock` reduces by quantity.
- `invoice_items.stock_reduced` becomes `true`.
- `invoices.stock_status` becomes `'reduced'`.
- `stock_movements` logs `'invoice_confirm'` with `-quantity` reduction.

## Scenario 7: Release Reserved Stock

`POST /api/v1/invoices/:id/release-stock` (on a reserved invoice)

**Expected Outcome:**

- `product.stock` increases back to original.
- `invoices.stock_status` becomes `'released'`.
- `stock_movements` logs `'invoice_release'` with `+quantity`.

## Scenario 8: Restore Confirmed Stock

`POST /api/v1/invoices/:id/restore-stock` (on a reduced invoice)

**Expected Outcome:**

- `product.stock` increases back to original.
- `invoices.stock_status` becomes `'restored'`.
- `stock_movements` logs `'invoice_cancel_restore'` with `+quantity`.

## Scenario 9: Cancel Invoice

`POST /api/v1/invoices/:id/cancel`

**Expected Outcome:**

- If invoice was `reserved`, it automatically calls `release_invoice_stock`.
- If invoice was `reduced`, it automatically calls `restore_invoice_stock`.
- `invoices.status` becomes `'cancelled'`.
- Audit logs capture `invoice_cancelled`.
