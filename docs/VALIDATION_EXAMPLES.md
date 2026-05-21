# Invoice Validation Test Payloads

These payloads can be used to test the `POST /api/v1/invoices` or `POST /api/v1/invoices/:id/validate` endpoints for Phase 2.

## Test 1: Valid Draft Invoice
```json
{
  "customer_id": "c1f2e3d4-b5a6-4c7d-8e9f-0a1b2c3d4e5f",
  "invoice_number": "INV-2026-001",
  "items": [
    {
      "product_id": 1,
      "quantity": 10,
      "unit_price": 500,
      "discount": 5,
      "tax_rate": 18
    }
  ]
}
```
**Expected:** Invoice created successfully. `status` = 'draft', `validation_status` = 'passed'. Backend recalculates subtotal and taxes.

## Test 2: Invalid Quantity (Quantity 0)
```json
{
  "customer_id": "c1f2e3d4-b5a6-4c7d-8e9f-0a1b2c3d4e5f",
  "items": [
    {
      "description": "Custom Service",
      "quantity": 0,
      "unit_price": 1000
    }
  ]
}
```
**Expected:** Invoice draft created with `validation_status` = 'failed'. Response contains `errors: [{ code: "INVALID_QUANTITY" }]`.

## Test 3: Invalid GST Rate (e.g., 19%)
```json
{
  "customer_id": "c1f2e3d4-b5a6-4c7d-8e9f-0a1b2c3d4e5f",
  "items": [
    {
      "description": "Imported Good",
      "quantity": 5,
      "unit_price": 200,
      "tax_rate": 19
    }
  ]
}
```
**Expected:** Invoice draft created. Response contains `warnings: [{ code: "INVALID_GST_RATE" }]`.

## Test 4: Duplicate Invoice Number
```json
{
  "customer_id": "c1f2e3d4-b5a6-4c7d-8e9f-0a1b2c3d4e5f",
  "invoice_number": "INV-2026-001",
  "items": [
    {
      "description": "Item",
      "quantity": 1,
      "unit_price": 100
    }
  ]
}
```
**Expected:** Validation failure `DUPLICATE_INVOICE_NUMBER`. 

## Test 5: Frontend Total Mismatch
```json
{
  "customer_id": "c1f2e3d4-b5a6-4c7d-8e9f-0a1b2c3d4e5f",
  "subtotal": 50000, 
  "items": [
    {
      "description": "Real Item",
      "quantity": 1,
      "unit_price": 100
    }
  ]
}
```
**Expected:** Backend saves the *actual* calculated subtotal (100). Response contains `warnings: [{ code: "FRONTEND_TOTAL_MISMATCH" }]`.

## Test 6: Submit Valid Invoice
`POST /api/v1/invoices/:id/submit` (with an invoice ID that has valid items)
**Expected:** `status` changes to 'submitted', `validation_status` becomes 'passed', audit log `invoice_submitted` created.

## Test 7: Submit Invalid Invoice
`POST /api/v1/invoices/:id/submit` (with an invoice ID that has quantity=0 or duplicate number)
**Expected:** HTTP 400. `status` becomes 'needs_review', `validation_status` becomes 'failed', audit log `invoice_validation_failed` created.
