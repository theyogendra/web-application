const express = require("express");
const router = express.Router();
const supabase = require("../config/supabase");
const {
  authenticate,
  requirePermission,
} = require("../middleware/auth.middleware");
const { createAuditLog } = require("../services/audit.service");
const { sanitizeSearch } = require("../utils/escape");

router.use(authenticate);

const EDITABLE_FIELDS = [
  "name",
  "description",
  "sku",
  "unit",
  "category",
  "price",
  "cost",
  "tax_rate",
  "stock",
  "reorder_level",
  "is_active",
];

// GET /inventory  -- list with filters (search, category, is_active, low_stock)
router.get("/", async (req, res, next) => {
  try {
    const { category, is_active, low_stock } = req.query;
    const search = sanitizeSearch(req.query.search);

    let q = supabase
      .from("products")
      .select("*")
      .order("created_at", { ascending: false });
    if (search) q = q.or(`name.ilike.*${search}*,sku.ilike.*${search}*`);
    if (category) q = q.eq("category", category);
    if (is_active !== undefined) q = q.eq("is_active", is_active === "true");

    const { data, error } = await q;
    if (error) throw error;

    let rows = data || [];

    // Low-stock / out-of-stock derivation. A product needs attention if:
    //   * stock <= 0  (out of stock; always flagged regardless of threshold)
    //   * OR stock <= reorder_level (when a threshold is set > 0)
    //
    // The previous version required reorder_level > 0 in both branches, so
    // out-of-stock items with no threshold set were silently invisible.
    const flag = (p) => {
      const stock = Number(p.stock) || 0;
      const reorder = Number(p.reorder_level) || 0;
      const outOfStock = stock <= 0;
      const lowStock = reorder > 0 && stock <= reorder;
      return { outOfStock, lowStock, needsAttention: outOfStock || lowStock };
    };

    if (low_stock === "true") {
      rows = rows.filter((p) => flag(p).needsAttention);
    }

    res.json({
      success: true,
      data: rows.map((p) => {
        const f = flag(p);
        return {
          ...p,
          // Kept for backward compat; old UI calls render this name.
          low_stock: f.needsAttention,
          out_of_stock: f.outOfStock,
          stock_status: f.outOfStock
            ? "out_of_stock"
            : f.lowStock
              ? "low"
              : "ok",
        };
      }),
    });
  } catch (err) {
    next(err);
  }
});

// GET /inventory/categories  -- distinct category list (must come before /:id)
router.get("/categories", async (req, res, next) => {
  try {
    const { data, error } = await supabase.from("products").select("category");
    if (error) throw error;
    const set = new Set();
    (data || []).forEach((r) => r.category && set.add(r.category));
    res.json({ success: true, data: Array.from(set).sort() });
  } catch (err) {
    next(err);
  }
});

// GET /inventory/:id
router.get("/:id", async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("id", req.params.id)
      .maybeSingle();
    if (error || !data)
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// POST /inventory  -- create
router.post(
  "/",
  requirePermission("inventory.create"),
  async (req, res, next) => {
    try {
      if (!req.body.name)
        return res
          .status(400)
          .json({ success: false, message: "name is required" });

      const insert = {};
      EDITABLE_FIELDS.forEach((f) => {
        if (req.body[f] !== undefined) insert[f] = req.body[f];
      });

      const { data, error } = await supabase
        .from("products")
        .insert([insert])
        .select()
        .single();
      if (error) throw error;

      await createAuditLog({
        req,
        action: "product_created",
        module: "Inventory",
        entityType: "product",
        entityId: String(data.id),
        newData: data,
      });

      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },
);

// PUT /inventory/:id  -- update
router.put(
  "/:id",
  requirePermission("inventory.update"),
  async (req, res, next) => {
    try {
      const patch = { updated_at: new Date().toISOString() };
      EDITABLE_FIELDS.forEach((f) => {
        if (req.body[f] !== undefined) patch[f] = req.body[f];
      });
      if (Object.keys(patch).length === 1) {
        return res
          .status(400)
          .json({ success: false, message: "No editable fields provided" });
      }

      const { data: existing } = await supabase
        .from("products")
        .select("*")
        .eq("id", req.params.id)
        .maybeSingle();
      if (!existing)
        return res
          .status(404)
          .json({ success: false, message: "Product not found" });

      const { data, error } = await supabase
        .from("products")
        .update(patch)
        .eq("id", req.params.id)
        .select()
        .single();
      if (error) throw error;

      await createAuditLog({
        req,
        action: "product_updated",
        module: "Inventory",
        entityType: "product",
        entityId: String(data.id),
        oldData: existing,
        newData: data,
      });

      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /inventory/:id  -- soft-delete (sets is_active=false). Use ?hard=true
// to truly delete; that fails if any invoice/quotation/proposal references it.
router.delete(
  "/:id",
  requirePermission("inventory.delete"),
  async (req, res, next) => {
    try {
      const { data: existing } = await supabase
        .from("products")
        .select("*")
        .eq("id", req.params.id)
        .maybeSingle();
      if (!existing)
        return res
          .status(404)
          .json({ success: false, message: "Product not found" });

      if (req.query.hard === "true") {
        const { error } = await supabase
          .from("products")
          .delete()
          .eq("id", req.params.id);
        if (error) {
          // FK violation when the product is still referenced — fall back to soft delete.
          return res.status(409).json({
            success: false,
            message:
              "Product is referenced by existing documents. Use the default soft delete (is_active=false).",
            detail: error.message,
          });
        }
        await createAuditLog({
          req,
          action: "product_deleted",
          module: "Inventory",
          entityType: "product",
          entityId: String(existing.id),
          oldData: existing,
        });
        return res.json({
          success: true,
          message: "Product permanently deleted",
          deleted: true,
        });
      }

      const { data, error } = await supabase
        .from("products")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("id", req.params.id)
        .select()
        .single();
      if (error) throw error;

      await createAuditLog({
        req,
        action: "product_deactivated",
        module: "Inventory",
        entityType: "product",
        entityId: String(data.id),
        oldData: existing,
        newData: data,
      });

      res.json({ success: true, message: "Product deactivated", data });
    } catch (err) {
      next(err);
    }
  },
);

// POST /inventory/:id/stock-adjust  -- body: { type: 'in'|'out'|'set', quantity, notes }
router.post(
  "/:id/stock-adjust",
  requirePermission("inventory.update"),
  async (req, res, next) => {
    try {
      const userId = req.user ? req.user.id : null;
      const { type, quantity, notes } = req.body;
      const qty = Number(quantity);

      if (!type || !["in", "out", "set"].includes(type)) {
        return res
          .status(400)
          .json({
            success: false,
            message: "type must be 'in', 'out', or 'set'",
          });
      }
      if (!Number.isFinite(qty) || qty < 0) {
        return res
          .status(400)
          .json({
            success: false,
            message: "quantity must be a non-negative number",
          });
      }

      const { data: product } = await supabase
        .from("products")
        .select("*")
        .eq("id", req.params.id)
        .maybeSingle();
      if (!product)
        return res
          .status(404)
          .json({ success: false, message: "Product not found" });

      const oldStock = Number(product.stock) || 0;
      const newStock =
        type === "in"
          ? oldStock + qty
          : type === "out"
            ? Math.max(0, oldStock - qty)
            : qty;
      const delta = newStock - oldStock;

      const { error: updErr } = await supabase
        .from("products")
        .update({ stock: newStock, updated_at: new Date().toISOString() })
        .eq("id", req.params.id);
      if (updErr) throw updErr;

      // Best-effort movement log (stock_movements table from phase 3).
      try {
        await supabase.from("stock_movements").insert([
          {
            product_id: product.id,
            movement_type:
              type === "in"
                ? "manual_in"
                : type === "out"
                  ? "manual_out"
                  : "manual_set",
            quantity: delta,
            old_stock: oldStock,
            new_stock: newStock,
            reason: notes || `Manual stock ${type}`,
            reference_type: "manual",
            created_by: userId,
          },
        ]);
      } catch (e) {
        console.error("stock_movements insert failed (non-fatal):", e.message);
      }

      await createAuditLog({
        req,
        action: "stock_adjusted",
        module: "Inventory",
        entityType: "product",
        entityId: String(product.id),
        details: {
          type,
          quantity: qty,
          old_stock: oldStock,
          new_stock: newStock,
          notes: notes || null,
        },
      });

      res.json({
        success: true,
        data: {
          product_id: product.id,
          old_stock: oldStock,
          new_stock: newStock,
          delta,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

module.exports = router;
