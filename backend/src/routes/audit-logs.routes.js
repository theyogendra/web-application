const express = require("express");
const router = express.Router();
const supabase = require("../config/supabase");
const {
  authenticate,
  requirePermission,
} = require("../middleware/auth.middleware");
const { createAuditLog } = require("../services/audit.service");
const { generateTablePdf } = require("../services/pdf.service");
const { sanitizeSearch } = require("../utils/escape");

router.use(authenticate);
// Audit logs are Admin/Manager only (any role missing `audit_logs.read` is
// rejected). Employees never see this module.
router.use(requirePermission("audit_logs.read"));

function applyFilters(q, query) {
  const { module, action, user_id, from, to } = query;
  const search = sanitizeSearch(query.search);
  if (module) q = q.eq("module", module);
  if (action) q = q.eq("action", action);
  if (user_id) q = q.eq("user_id", user_id);
  if (from) q = q.gte("created_at", from);
  if (to) q = q.lte("created_at", to + "T23:59:59.999Z");
  if (search) q = q.or(`action.ilike.*${search}*,user_name.ilike.*${search}*`);
  return q;
}

// GET /audit-logs  -- list with filters
router.get("/", async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 200, 1000);
    let q = supabase
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    q = applyFilters(q, req.query);

    const { data, error } = await q;
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// GET /audit-logs/export  -- PDF
router.get("/export", async (req, res, next) => {
  try {
    let q = supabase
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(5000);
    q = applyFilters(q, req.query);

    const { data, error } = await q;
    if (error) throw error;

    const { data: company } = await supabase
      .from("company_settings")
      .select("*")
      .limit(1)
      .maybeSingle();

    const columns = [
      {
        label: "Time",
        value: (r) =>
          r.created_at
            ? new Date(r.created_at)
                .toISOString()
                .replace("T", " ")
                .slice(0, 19)
            : "",
      },
      { label: "User", value: "user_name" },
      { label: "Action", value: "action" },
      { label: "Module", value: "module" },
      {
        label: "Entity",
        value: (r) =>
          [r.entity_type, r.entity_id].filter(Boolean).join(": ") || "—",
      },
      { label: "IP Address", value: "ip_address" },
    ];

    const pdf = await generateTablePdf(
      "Audit Logs Report",
      columns,
      data || [],
      {
        dateFrom: req.query.from,
        dateTo: req.query.to,
      },
      company || {},
    );

    createAuditLog({
      req,
      action: "report_exported",
      module: "Audit Logs",
      details: {
        type: "audit_logs",
        format: "pdf",
        count: (data || []).length,
      },
    }).catch((err) => {});

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="Audit_Logs_Report.pdf"',
    );
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.send(pdf);
  } catch (err) {
    console.error("[audit-logs/export] Error:", err);
    if (!res.headersSent) {
      res
        .status(500)
        .json({
          success: false,
          message: "Unable to generate Audit Logs PDF.",
        });
    }
  }
});

module.exports = router;
