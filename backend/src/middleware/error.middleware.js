const errorHandler = (err, req, res, next) => {
  if (err) {
    if (err.stack) {
      console.error(err.stack);
    } else if (err.message) {
      const extra = [];
      if (err.code) extra.push(`Code: ${err.code}`);
      if (err.details) extra.push(`Details: ${err.details}`);
      if (err.hint) extra.push(`Hint: ${err.hint}`);
      const extraStr = extra.length ? ` (${extra.join(" | ")})` : "";
      console.error(`Error: ${err.message}${extraStr}`);
    } else if (typeof err === "object") {
      try {
        console.error(`Error Object: ${JSON.stringify(err)}`);
      } catch {
        console.error(`Error: ${String(err)}`);
      }
    } else {
      console.error(`Error: ${String(err)}`);
    }
  }

  const message =
    (err && (err.message || err.details)) || "Internal Server Error";
  res.status(500).json({ detail: message });
};

module.exports = { errorHandler };
