const sqlite3 = require("sqlite3").verbose();
const supabase = require("../config/supabase");
const env = require("../config/env");

const dbPath = env.OLD_DATABASE_URL.replace("sqlite:///", "");

const migrateTable = async (db, tableName) => {
  return new Promise((resolve) => {
    db.all(`SELECT * FROM ${tableName}`, async (err, rows) => {
      if (err) {
        if (err.message.includes("no such table")) {
          return resolve({
            table: tableName,
            oldRows: 0,
            inserted: 0,
            skipped: 0,
            error: "Table missing",
          });
        }
        return resolve({
          table: tableName,
          oldRows: 0,
          inserted: 0,
          skipped: 0,
          error: err.message,
        });
      }

      if (!rows || rows.length === 0) {
        return resolve({
          table: tableName,
          oldRows: 0,
          inserted: 0,
          skipped: 0,
          error: null,
        });
      }

      try {
        const { error } = await supabase.from(tableName).upsert(rows);
        if (error) {
          return resolve({
            table: tableName,
            oldRows: rows.length,
            inserted: 0,
            skipped: rows.length,
            error: error.message,
          });
        }
        return resolve({
          table: tableName,
          oldRows: rows.length,
          inserted: rows.length,
          skipped: 0,
          error: null,
        });
      } catch (err2) {
        return resolve({
          table: tableName,
          oldRows: rows.length,
          inserted: 0,
          skipped: rows.length,
          error: err2.message,
        });
      }
    });
  });
};

const runMigration = () => {
  const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
    if (err) {
      console.error("Could not connect to old database:", err.message);
      return;
    }
    console.log("Connected to old database:", dbPath);
  });

  const tables = [
    "users",
    "products",
    "inventory",
    "proposals",
    "quotations",
    "invoices",
    "payments",
    "audit_logs",
  ];

  const results = [];
  let completed = 0;

  tables.forEach(async (table) => {
    const result = await migrateTable(db, table);
    results.push(result);
    completed++;

    if (completed === tables.length) {
      db.close();
      console.log("\n--- Migration Summary ---");
      console.table(results);
      console.log("-------------------------");
      process.exit(0);
    }
  });
};

runMigration();
