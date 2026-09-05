/**
 * apply-migration-phase13-v2.js
 * Applies Phase 13 migration via Supabase Management API (pg query endpoint).
 * Run once with:  node src/scripts/apply-migration-phase13-v2.js
 */
const fs = require("fs");
const path = require("path");
const https = require("https");

// Extract project ref from URL: https://ebbnqublrfbrutckxagv.supabase.co/
const SUPABASE_URL = process.env.SUPABASE_URL || "https://ebbnqublrfbrutckxagv.supabase.co/";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PROJECT_REF = "ebbnqublrfbrutckxagv";

const SQL_FILE = path.join(
  __dirname,
  "../../../supabase/migrations/20260718100000_approval_tables_phase13.sql",
);

function httpsPost(hostname, path, headers, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = typeof body === "string" ? body : JSON.stringify(body);
    const req = https.request(
      {
        hostname,
        path,
        method: "POST",
        headers: { ...headers, "Content-Length": Buffer.byteLength(bodyStr) },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => resolve({ status: res.statusCode, body: data }));
      },
    );
    req.on("error", reject);
    req.write(bodyStr);
    req.end();
  });
}

async function main() {
  const sql = fs.readFileSync(SQL_FILE, "utf8");
  console.log("Applying Phase 13 migration via Supabase REST API…\n");

  // Try the Supabase REST SQL endpoint (available in Supabase cloud projects)
  const res = await httpsPost(
    `${PROJECT_REF}.supabase.co`,
    "/rest/v1/rpc/exec_sql",
    {
      "Content-Type": "application/json",
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    { query: sql },
  );

  if (res.status === 200 || res.status === 201) {
    console.log("✓ Migration applied successfully via REST.");
    return;
  }

  console.log(
    `REST returned ${res.status}. Trying the Postgres query endpoint…`,
  );

  // Try the pg query endpoint (works on self-hosted / some managed instances)
  const res2 = await httpsPost(
    `${PROJECT_REF}.supabase.co`,
    "/pg/query",
    {
      "Content-Type": "application/json",
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    { query: sql },
  );

  if (res2.status === 200 || res2.status === 201) {
    console.log("✓ Migration applied via /pg/query.");
    return;
  }

  // Manual fallback: print the SQL for the user to paste in the Supabase SQL Editor
  console.log(
    "\n──────────────────────────────────────────────────────────────",
  );
  console.log("AUTO-APPLY FAILED (status", res2.status, ")");
  console.log("Please open your Supabase project → SQL Editor and run:");
  console.log(
    "──────────────────────────────────────────────────────────────\n",
  );
  console.log(sql);
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
