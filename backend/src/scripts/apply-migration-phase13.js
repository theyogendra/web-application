/**
 * apply-migration-phase13.js
 * One-shot script: applies the Phase 13 SQL migration via Supabase REST API.
 * Run once with:  node src/scripts/apply-migration-phase13.js
 */
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://ebbnqublrfbrutckxagv.supabase.co/";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const SQL_FILE = path.join(
  __dirname,
  "../../../supabase/migrations/20260718100000_approval_tables_phase13.sql",
);

async function main() {
  console.log("Reading migration file…");
  const sql = fs.readFileSync(SQL_FILE, "utf8");

  console.log("Applying Phase 13 migration via Supabase RPC…");
  const { data, error } = await supabase
    .rpc("exec_sql", { query: sql })
    .maybeSingle();

  if (error) {
    // exec_sql may not exist — fall back to running each statement individually
    // by splitting on semicolons (safe for this migration's simple DDL).
    console.warn(
      "exec_sql RPC not available, falling back to per-statement execution…",
    );
    console.warn("Error was:", error.message);

    const statements = sql
      .split(/;\s*\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith("--"));

    let ok = 0;
    let fail = 0;
    for (const stmt of statements) {
      const { error: stmtErr } = await supabase.rpc("exec_sql", {
        query: stmt + ";",
      });
      if (stmtErr) {
        console.error("  ✗", stmt.slice(0, 80), "\n   Error:", stmtErr.message);
        fail++;
      } else {
        ok++;
      }
    }
    console.log(`\nDone. ${ok} statements succeeded, ${fail} failed.`);
    return;
  }

  console.log("✓ Migration applied successfully.");
  if (data) console.log("Result:", data);
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
