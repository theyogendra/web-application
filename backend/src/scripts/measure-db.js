// Measures database query vs audit log writing timings.
const supabase = require("../config/supabase");

async function run() {
  console.log("=== MEASURING DATABASE QUERY PERF ===");

  // Measure RPC report_summary
  const startRpc = Date.now();
  try {
    const { data, error } = await supabase.rpc("report_summary", {
      from_input: null,
      to_input: null,
      customer_input: null,
      status_input: null,
    });
    if (error) throw error;
    console.log(
      `RPC report_summary: SUCCESS | Time: ${Date.now() - startRpc}ms`,
    );
  } catch (err) {
    console.error("RPC report_summary failed:", err.message);
  }

  // Measure audit log insert
  const startAudit = Date.now();
  const row = {
    user_id: "807c2ea0-ece3-4b39-a8fb-e35de982eb75",
    user_name: "admin@enterprise.com",
    action: "report_viewed",
    module: "Reports",
    details: { report: "summary" },
  };
  try {
    const { error } = await supabase.from("audit_logs").insert([row]);
    if (error) throw error;
    console.log(
      `Audit Log Insert: SUCCESS | Time: ${Date.now() - startAudit}ms`,
    );
  } catch (err) {
    console.error("Audit Log Insert failed:", err.message);
  }
}

run();
