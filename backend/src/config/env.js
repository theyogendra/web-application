const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");
require("dotenv").config();


module.exports = {
  PORT: process.env.PORT || 8000,
  NODE_ENV: process.env.NODE_ENV || "development",
  SUPABASE_URL:
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_ANON_KEY:
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_SERVICE_ROLE_KEY:
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  JWT_SECRET: process.env.JWT_SECRET || "supersecretkeychangeit",
  OLD_DATABASE_URL: process.env.OLD_DATABASE_URL || "sqlite:///./enterprise.db",
  RESEND_API_KEY: process.env.RESEND_API_KEY || "",
  FROM_EMAIL: process.env.FROM_EMAIL || "Enterprise <onboarding@resend.dev>",
  REPLY_TO_EMAIL: process.env.REPLY_TO_EMAIL || "",
  APP_URL: process.env.NEXT_PUBLIC_APP_URL || "https://localhost:3000",
};
