-- Migration: Create database indexes to optimize report queries and table listings
-- Targets sequential scans on invoices and payments tables.

CREATE INDEX IF NOT EXISTS idx_invoices_invoice_date ON public.invoices(invoice_date);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_customer_name ON public.invoices(customer_name);
CREATE INDEX IF NOT EXISTS idx_invoices_created_by ON public.invoices(created_by);
CREATE INDEX IF NOT EXISTS idx_payments_created_by ON public.payments(created_by);
