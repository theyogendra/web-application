const express = require("express");
const router = express.Router();
const supabase = require("../config/supabase");
const { authenticate } = require("../middleware/auth.middleware");
const { createAuditLog } = require("../services/audit.service");
const { sanitizeSearch } = require("../utils/escape");

router.use(authenticate);

// GET /customers  -- list (optionally searchable, used for invoice autofill)
router.get("/", async (req, res, next) => {
  try {
    const search = sanitizeSearch(req.query.search);
    let q = supabase
      .from("customers")
      .select("*")
      .order("name", { ascending: true });
    if (search) q = q.ilike("name", `%${search}%`);

    const { data, error } = await q;
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// GET /customers/:id
router.get("/:id", async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .eq("id", req.params.id)
      .single();
    if (error || !data)
      return res
        .status(404)
        .json({ success: false, message: "Customer not found" });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// POST /customers
router.post("/", async (req, res, next) => {
  try {
    const { name, email, phone, billing_address, gst_number } = req.body;
    if (!name)
      return res
        .status(400)
        .json({ success: false, message: "name is required" });

    const { data, error } = await supabase
      .from("customers")
      .insert([{ name, email, phone, billing_address, gst_number }])
      .select()
      .single();
    if (error) throw error;

    await createAuditLog({
      req,
      action: "customer_created",
      module: "Settings",
      entityType: "customer",
      entityId: data.id,
      newData: data,
    });

    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// PUT /customers/:id
router.put("/:id", async (req, res, next) => {
  try {
    const patch = {};
    ["name", "email", "phone", "billing_address", "gst_number"].forEach((f) => {
      if (req.body[f] !== undefined) patch[f] = req.body[f];
    });
    if (Object.keys(patch).length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "No fields to update" });
    }

    const { data, error } = await supabase
      .from("customers")
      .update(patch)
      .eq("id", req.params.id)
      .select()
      .single();
    if (error || !data)
      return res
        .status(404)
        .json({ success: false, message: "Customer not found" });

    await createAuditLog({
      req,
      action: "customer_updated",
      module: "Settings",
      entityType: "customer",
      entityId: data.id,
      newData: data,
    });

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
