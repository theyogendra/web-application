/**
 * apply-enterprise-fields.js
 * Applies the Enterprise Invoice Fields migration to Supabase.
 * Run once with:  node src/scripts/apply-enterprise-fields.js
 */
const fs = require("fs");
const path = require("path");
const https = require("https");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://ebbnqublrfbrutckxagv.supabase.co/";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PROJECT_REF = "ebbnqublrfbrutckxagv";

const SQL_FILE = path.join(
  __dirname,
  "../../../supabase/migrations/20260718120000_invoice_enterprise_fields.sql",
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
  console.log(
    "Applying Enterprise Invoices migration via Supabase REST API…\n",
  );

  // Try the Supabase REST SQL endpoint
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

  // Try the pg query endpoint
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

  console.log(
    "\n──────────────────────────────────────────────────────────────",
  );
  console.log("AUTO-APPLY FAILED (status", res2.status, ")");
  console.log("Please run SQL manually in your Supabase SQL Editor:");
  console.log(
    "──────────────────────────────────────────────────────────────\n",
  );
  console.log(sql);
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
