-- Add stock control fields to invoices
ALTER TABLE public.invoices
ADD COLUMN IF NOT EXISTS stock_status text default 'not_reserved',
ADD COLUMN IF NOT EXISTS stock_reserved_at timestamptz,
ADD COLUMN IF NOT EXISTS stock_confirmed_at timestamptz,
ADD COLUMN IF NOT EXISTS stock_released_at timestamptz;

-- Add stock control fields to invoice_items
ALTER TABLE public.invoice_items
ADD COLUMN IF NOT EXISTS stock_reserved boolean default false,
ADD COLUMN IF NOT EXISTS stock_reduced boolean default false,
ADD COLUMN IF NOT EXISTS reserved_quantity numeric default 0,
ADD COLUMN IF NOT EXISTS reduced_quantity numeric default 0;

-- Create stock_movements table
CREATE TABLE IF NOT EXISTS public.stock_movements (
    id uuid primary key default gen_random_uuid(),
    product_id bigint references public.products(id) on delete restrict,
    invoice_id uuid references public.invoices(id) on delete set null,
    invoice_item_id uuid references public.invoice_items(id) on delete set null,
    movement_type text not null,
    quantity numeric not null,
    old_stock numeric,
    new_stock numeric,
    reason text,
    reference_type text default 'invoice',
    reference_id uuid,
    created_by uuid references public.users(id),
    created_at timestamptz default now()
);

-- RPC Functions for Atomic Stock Operations

-- 1. Reserve Invoice Stock
CREATE OR REPLACE FUNCTION public.reserve_invoice_stock(invoice_id_input uuid, user_id_input uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    inv_record RECORD;
    item_record RECORD;
BEGIN
    -- Check invoice
    SELECT * INTO inv_record FROM public.invoices WHERE id = invoice_id_input FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Invoice not found');
    END IF;

    IF inv_record.status NOT IN ('submitted', 'approved') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Invoice must be submitted or approved to reserve stock');
    END IF;

    IF inv_record.stock_status != 'not_reserved' AND inv_record.stock_status != 'released' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Stock is already reserved or reduced');
    END IF;

    FOR item_record IN
        SELECT
            ii.id AS invoice_item_id,
            ii.product_id,
            ii.quantity,
            p.stock AS current_stock
        FROM public.invoice_items ii
        JOIN public.products p ON p.id = ii.product_id
        WHERE ii.invoice_id = invoice_id_input
          AND ii.product_id IS NOT NULL
        FOR UPDATE OF p
    LOOP
        IF item_record.current_stock < item_record.quantity THEN
            RAISE EXCEPTION 'INSUFFICIENT_STOCK: product %, required %, available %',
                item_record.product_id,
                item_record.quantity,
                item_record.current_stock;
        END IF;

        -- Update product
        UPDATE public.products
        SET stock = stock - item_record.quantity
        WHERE id = item_record.product_id;
        
        -- Log movement
        INSERT INTO public.stock_movements (
            product_id,
            invoice_id,
            invoice_item_id,
            movement_type,
            quantity,
            old_stock,
            new_stock,
            reason,
            reference_type,
            reference_id,
            created_by
        )
        VALUES (
            item_record.product_id,
            invoice_id_input,
            item_record.invoice_item_id,
            'invoice_reserve',
            -item_record.quantity,
            item_record.current_stock,
            item_record.current_stock - item_record.quantity,
            'Stock reserved for submitted invoice',
            'invoice',
            invoice_id_input,
            user_id_input
        );
        
        -- Update item
        UPDATE public.invoice_items
        SET stock_reserved = true, reserved_quantity = item_record.quantity
        WHERE id = item_record.invoice_item_id;
    END LOOP;

    -- Update invoice
    UPDATE public.invoices SET stock_status = 'reserved', stock_reserved_at = now() WHERE id = invoice_id_input;

    RETURN jsonb_build_object('success', true, 'message', 'Stock reserved successfully');
END;
$$;

-- 2. Confirm Invoice Stock
CREATE OR REPLACE FUNCTION public.confirm_invoice_stock(invoice_id_input uuid, user_id_input uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    inv_record RECORD;
    item_record RECORD;
BEGIN
    SELECT * INTO inv_record FROM public.invoices WHERE id = invoice_id_input FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Invoice not found');
    END IF;

    IF inv_record.status NOT IN ('submitted', 'approved') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Invoice must be submitted or approved to confirm');
    END IF;

    IF inv_record.stock_status = 'reduced' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Stock already reduced');
    END IF;

    FOR item_record IN
        SELECT
            ii.id AS invoice_item_id,
            ii.product_id,
            ii.quantity,
            ii.stock_reserved,
            ii.reserved_quantity,
            p.stock AS current_stock
        FROM public.invoice_items ii
        JOIN public.products p ON p.id = ii.product_id
        WHERE ii.invoice_id = invoice_id_input
          AND ii.product_id IS NOT NULL
        FOR UPDATE OF p
    LOOP
        IF inv_record.stock_status = 'reserved' THEN
            -- Convert reserved to reduced
            UPDATE public.invoice_items
            SET stock_reserved = false, stock_reduced = true, reduced_quantity = reserved_quantity
            WHERE id = item_record.invoice_item_id;
            
            INSERT INTO public.stock_movements (
                product_id, invoice_id, invoice_item_id, movement_type, quantity, old_stock, new_stock, reason, reference_type, reference_id, created_by
            )
            VALUES (
                item_record.product_id, invoice_id_input, item_record.invoice_item_id, 'invoice_confirm', 0, item_record.current_stock, item_record.current_stock, 'Reserved stock confirmed permanently', 'invoice', invoice_id_input, user_id_input
            );
        ELSE
            -- Reduce directly
            IF item_record.current_stock < item_record.quantity THEN
                RAISE EXCEPTION 'INSUFFICIENT_STOCK: product %, required %, available %',
                    item_record.product_id,
                    item_record.quantity,
                    item_record.current_stock;
            END IF;

            UPDATE public.products
            SET stock = stock - item_record.quantity
            WHERE id = item_record.product_id;
            
            UPDATE public.invoice_items
            SET stock_reduced = true, reduced_quantity = item_record.quantity
            WHERE id = item_record.invoice_item_id;
            
            INSERT INTO public.stock_movements (
                product_id, invoice_id, invoice_item_id, movement_type, quantity, old_stock, new_stock, reason, reference_type, reference_id, created_by
            )
            VALUES (
                item_record.product_id, invoice_id_input, item_record.invoice_item_id, 'invoice_confirm', -item_record.quantity, item_record.current_stock, item_record.current_stock - item_record.quantity, 'Stock reduced directly on confirm', 'invoice', invoice_id_input, user_id_input
            );
        END IF;
    END LOOP;

    -- Update invoice
    UPDATE public.invoices SET status = 'confirmed', stock_status = 'reduced', stock_confirmed_at = now() WHERE id = invoice_id_input;

    RETURN jsonb_build_object('success', true, 'message', 'Stock confirmed successfully');
END;
$$;

-- 3. Release Invoice Stock
CREATE OR REPLACE FUNCTION public.release_invoice_stock(invoice_id_input uuid, user_id_input uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    inv_record RECORD;
    item_record RECORD;
BEGIN
    SELECT * INTO inv_record FROM public.invoices WHERE id = invoice_id_input FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Invoice not found');
    END IF;

    IF inv_record.stock_status != 'reserved' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Invoice stock is not reserved');
    END IF;

    FOR item_record IN
        SELECT
            ii.id AS invoice_item_id,
            ii.product_id,
            ii.reserved_quantity,
            p.stock AS current_stock
        FROM public.invoice_items ii
        JOIN public.products p ON p.id = ii.product_id
        WHERE ii.invoice_id = invoice_id_input
          AND ii.product_id IS NOT NULL
          AND ii.stock_reserved = true
        FOR UPDATE OF p
    LOOP
        UPDATE public.products
        SET stock = stock + item_record.reserved_quantity
        WHERE id = item_record.product_id;
        
        UPDATE public.invoice_items
        SET stock_reserved = false, reserved_quantity = 0
        WHERE id = item_record.invoice_item_id;
        
        INSERT INTO public.stock_movements (
            product_id, invoice_id, invoice_item_id, movement_type, quantity, old_stock, new_stock, reason, reference_type, reference_id, created_by
        )
        VALUES (
            item_record.product_id, invoice_id_input, item_record.invoice_item_id, 'invoice_release', item_record.reserved_quantity, item_record.current_stock, item_record.current_stock + item_record.reserved_quantity, 'Reserved stock released', 'invoice', invoice_id_input, user_id_input
        );
    END LOOP;

    UPDATE public.invoices SET stock_status = 'released', stock_released_at = now() WHERE id = invoice_id_input;

    RETURN jsonb_build_object('success', true, 'message', 'Stock released successfully');
END;
$$;

-- 4. Restore Invoice Stock
CREATE OR REPLACE FUNCTION public.restore_invoice_stock(invoice_id_input uuid, user_id_input uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    inv_record RECORD;
    item_record RECORD;
BEGIN
    SELECT * INTO inv_record FROM public.invoices WHERE id = invoice_id_input FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Invoice not found');
    END IF;

    IF inv_record.stock_status != 'reduced' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Invoice stock is not reduced');
    END IF;

    FOR item_record IN
        SELECT
            ii.id AS invoice_item_id,
            ii.product_id,
            ii.reduced_quantity,
            p.stock AS current_stock
        FROM public.invoice_items ii
        JOIN public.products p ON p.id = ii.product_id
        WHERE ii.invoice_id = invoice_id_input
          AND ii.product_id IS NOT NULL
          AND ii.stock_reduced = true
        FOR UPDATE OF p
    LOOP
        UPDATE public.products
        SET stock = stock + item_record.reduced_quantity
        WHERE id = item_record.product_id;
        
        UPDATE public.invoice_items
        SET stock_reduced = false, reduced_quantity = 0
        WHERE id = item_record.invoice_item_id;
        
        INSERT INTO public.stock_movements (
            product_id, invoice_id, invoice_item_id, movement_type, quantity, old_stock, new_stock, reason, reference_type, reference_id, created_by
        )
        VALUES (
            item_record.product_id, invoice_id_input, item_record.invoice_item_id, 'invoice_cancel_restore', item_record.reduced_quantity, item_record.current_stock, item_record.current_stock + item_record.reduced_quantity, 'Confirmed stock restored', 'invoice', invoice_id_input, user_id_input
        );
    END LOOP;

    UPDATE public.invoices SET stock_status = 'restored' WHERE id = invoice_id_input;

    RETURN jsonb_build_object('success', true, 'message', 'Stock restored successfully');
END;
$$;
