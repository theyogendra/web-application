const express = require("express");
const router = express.Router();
const supabase = require("../config/supabase");

router.get("/", async (req, res) => {
  try {
    // Need to actually test Supabase by reading from a lightweight table or safe query
    const { data, error } = await supabase.from("users").select("id").limit(1);

    if (error) {
      throw error;
    }

    res.json({
      status: "healthy",
      backend: "node",
      database: "connected",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Health check failed:", err.message);
    res.status(500).json({
      status: "unhealthy",
      backend: "node",
      database: "supabase_error",
      error: err.message,
      timestamp: new Date().toISOString(),
    });
  }
});

module.exports = router;
