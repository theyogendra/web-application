const express = require("express");
const router = express.Router();
const supabase = require("../config/supabase");
const { authenticate } = require("../middleware/auth.middleware");
const { createAuditLog } = require("../services/audit.service");

router.use(authenticate);

const FIELDS = [
  "company_name",
  "email",
  "phone",
  "address",
  "logo_url",
  "tax_number",
  "invoice_prefix",
  "currency",
  "default_terms",
  "default_notes",
];

// GET /company-settings  -- the single settings row (created if missing)
router.get("/", async (req, res, next) => {
  try {
    let { data, error } = await supabase
      .from("company_settings")
      .select("*")
      .limit(1)
      .single();

    if (error || !data) {
      const seed = await supabase
        .from("company_settings")
        .insert([{ company_name: "Your Company", currency: "INR" }])
        .select()
        .single();
      data = seed.data;
    }

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// PUT /company-settings  -- update (upserts the single row)
router.put("/", async (req, res, next) => {
  try {
    const patch = { updated_at: new Date().toISOString() };
    FIELDS.forEach((f) => {
      if (req.body[f] !== undefined) patch[f] = req.body[f];
    });

    const { data: existing } = await supabase
      .from("company_settings")
      .select("id")
      .limit(1)
      .single();

    let data;
    if (existing) {
      const upd = await supabase
        .from("company_settings")
        .update(patch)
        .eq("id", existing.id)
        .select()
        .single();
      if (upd.error) throw upd.error;
      data = upd.data;
    } else {
      const ins = await supabase
        .from("company_settings")
        .insert([patch])
        .select()
        .single();
      if (ins.error) throw ins.error;
      data = ins.data;
    }

    await createAuditLog({
      req,
      action: "settings_updated",
      module: "Settings",
      entityType: "company_settings",
      entityId: data.id,
      newData: data,
    });

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
