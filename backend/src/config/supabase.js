const { createClient } = require("@supabase/supabase-js");
const env = require("./env");

const supabaseUrl = env.SUPABASE_URL;
const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn("WARNING: Missing Supabase URL or Service Role Key.");
}

// Create a Supabase client with the service role key for backend admin access
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

module.exports = supabase;
