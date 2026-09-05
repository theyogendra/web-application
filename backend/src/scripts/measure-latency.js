// Measurement script for reports API endpoint performance.
// Measures response time of the reports summary, revenue, invoices, payments, customers, tax, inventory endpoints.
const http = require("http");

const TOKEN =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI4MDdjMmVhMC1lY2UzLTRiMzktYThmYi1lMzVkZTk4MmViNzUiLCJlbWFpbCI6ImFkbWluQGVudGVycHJpc2UuY29tIiwicm9sZSI6IkFkbWluIiwicGVybWlzc2lvbnMiOlsidXNlcnMucmVhZCIsInVzZXJzLmNyZWF0ZSIsInVzZXJzLnVwZGF0ZSIsInVzZXJzLmRlbGV0ZSIsInJvbGVzLnJlYWQiLCJyb2xlcy5jcmVhdGUiLCJyb2xlcy51cGRhdGUiLCJyb2xlcy5kZWxldGUiLCJpbnZvaWNlcy5yZWFkIiwiaW52b2ljZXMuY3JlYXRlIiwiaW52b2ljZXMudXBkYXRlIiwiaW52b2ljZXMuZGVsZXRlIiwiaW52b2ljZXMuc2VuZCIsImludm9pY2VzLmFwcHJvdmUiLCJxdW90YXRpb25zLnJlYWQiLCJxdW90YXRpb25zLmNyZWF0ZSIsInF1b3RhdGlvbnMudXBkYXRlIiwicXVvdGF0aW9ucy5kZWxldGUiLCJxdW90YXRpb25zLnNlbmQiLCJxdW90YXRpb25zLmNvbnZlcnQiLCJxdW90YXRpb25zLmFwcHJvdmUiLCJwcm9wb3NhbHMucmVhZCIsInByb3Bvc2Fscy5jcmVhdGUiLCJwcm9wb3NhbHMudXBkYXRlIiwicHJvcG9zYWxzLmRlbGV0ZSIsInByb3Bvc2Fscy5zZW5kIiwicHJvcG9zYWxzLmNvbnZlcnQiLCJwcm9wb3NhbHMuYXBwcm92ZSIsInBheW1lbnRzLnJlYWQiLCJwYXltZW50cy5jcmVhdGUiLCJwYXltZW50cy51cGRhdGUiLCJwYXltZW50cy5kZWxldGUiLCJwYXltZW50cy5hcHByb3ZlIiwiY3VzdG9tZXJzLnJlYWQiLCJjdXN0b21lcnMuY3JlYXRlIiwiY3VzdG9tZXJzLnVwZGF0ZSIsImN1c3RvbWVycy5kZWxldGUiLCJpbnZlbnRvcnkucmVhZCIsImludmVudG9yeS5jcmVhdGUiLCJpbnZlbnRvcnkudXBkYXRlIiwiaW52ZW50b3J5LmRlbGV0ZSIsInJlcG9ydHMucmVhZCIsInJlcG9ydHMuZXhwb3J0IiwiYXVkaXRfbG9ncy5yZWFkIiwiYXVkaXRfbG9ncy5leHBvcnQiLCJzZXR0aW5ncy5yZWFkIiwic2V0dGluZ3MudXBkYXRlIl0sIm1vZHVsZV9hY2Nlc3MiOnt9LCJpc19zdXBlcnVzZXIiOnRydWUsImlhdCI6MTc4NDMzMzgxNywiZXhwIjoxNzg1MDI1MDE3fQ._zwGeEnpCirYUa4jcFDH0ElrmbjvfdcZ1G44CyeYy3E";

const endpoints = [
  "/api/reports/summary",
  "/api/reports/revenue",
  "/api/reports/invoices",
  "/api/reports/payments",
  "/api/reports/customers",
  "/api/reports/tax",
  "/api/reports/inventory",
];

function request(path) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const req = http.request(
      {
        hostname: "localhost",
        port: 8000,
        path: path,
        method: "GET",
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          Accept: "application/json",
        },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          resolve({
            path,
            status: res.statusCode,
            duration: Date.now() - start,
            size: body.length,
          });
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

async function run() {
  console.log("=== MEASURING LATENCY (SEQUENTIAL) ===");
  for (const ep of endpoints) {
    try {
      const res = await request(ep);
      console.log(
        `Endpoint: ${res.path} | Status: ${res.status} | Size: ${res.size} bytes | Duration: ${res.duration}ms`,
      );
    } catch (err) {
      console.error(`Endpoint: ${ep} failed:`, err.message);
    }
  }

  console.log("\n=== MEASURING LATENCY (CONCURRENT / PARALLEL) ===");
  const startAll = Date.now();
  try {
    const results = await Promise.all(endpoints.map(request));
    for (const res of results) {
      console.log(
        `Endpoint: ${res.path} | Status: ${res.status} | Size: ${res.size} bytes | Duration: ${res.duration}ms`,
      );
    }
    console.log(`Total Parallel Request Time: ${Date.now() - startAll}ms`);
  } catch (err) {
    console.error("Parallel requests failed:", err.message);
  }
}

run();
