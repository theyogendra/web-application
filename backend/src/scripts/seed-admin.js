/**
 * seed-admin.js
 * Checks if the admin user exists in Supabase and creates/fixes it if not.
 * Run with: node src/scripts/seed-admin.js
 */
const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");
require("dotenv").config({
  path: require("path").join(__dirname, "../../.env"),
});

const { createClient } = require("@supabase/supabase-js");
const bcrypt = require("bcryptjs");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@enterprise.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const ADMIN_NAME = process.env.ADMIN_FULL_NAME || "System Administrator";

async function run() {
  console.log(`\nChecking Supabase for admin user: ${ADMIN_EMAIL}`);
  console.log(`Using URL: ${process.env.SUPABASE_URL}\n`);

  // 1. Look up admin user
  const { data: user, error } = await supabase
    .from("users")
    .select("id, email, password, password_hash, is_active, is_superuser")
    .eq("email", ADMIN_EMAIL)
    .maybeSingle();

  if (error) {
    console.error("❌ Supabase error fetching user:", error.message);
    process.exit(1);
  }

  if (!user) {
    console.log("⚠️  Admin user not found — creating now...");
    // Look up Admin role
    const { data: role } = await supabase
      .from("roles")
      .select("id")
      .eq("name", "Admin")
      .maybeSingle();

    const password_hash = await bcrypt.hash(ADMIN_PASSWORD, 10);

    const { data: newUser, error: insertError } = await supabase
      .from("users")
      .insert({
        name: ADMIN_NAME,
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        password_hash,
        is_active: true,
        is_superuser: true,
        role_id: role?.id || null,
      })
      .select()
      .single();

    if (insertError) {
      console.error("❌ Failed to create admin user:", insertError.message);
      process.exit(1);
    }

    console.log("✅ Admin user created successfully!");
    console.log(`   Email:    ${ADMIN_EMAIL}`);
    console.log(`   Password: ${ADMIN_PASSWORD}`);
    console.log(`   ID:       ${newUser.id}`);
    return;
  }

  // 2. User exists — check/fix password
  console.log(`✅ Admin user found (ID: ${user.id})`);
  console.log(`   is_active:    ${user.is_active}`);
  console.log(`   is_superuser: ${user.is_superuser}`);
  console.log(`   has password_hash: ${!!user.password_hash}`);
  console.log(`   has password:      ${!!user.password}`);

  // Re-hash if needed
  const password_hash = await bcrypt.hash(ADMIN_PASSWORD, 10);

  const { error: updateError } = await supabase
    .from("users")
    .update({
      password: ADMIN_PASSWORD,
      password_hash,
      is_active: true,
      is_superuser: true,
    })
    .eq("id", user.id);

  if (updateError) {
    console.error("❌ Failed to update admin password:", updateError.message);
    process.exit(1);
  }

  console.log("\n✅ Admin password reset and confirmed.");
  console.log(`   Email:    ${ADMIN_EMAIL}`);
  console.log(`   Password: ${ADMIN_PASSWORD}`);
}

run().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
