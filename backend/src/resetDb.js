const { pool } = require("./db");

// Wipes every scan-generated row (cafes, their problems, past jobs, and regions)
// but leaves the schema itself untouched — run `npm run migrate` first if the
// tables don't exist yet. RESTART IDENTITY resets the auto-increment ids back to 1.
async function resetDb() {
  await pool.query(`TRUNCATE TABLE cafe_problems, cafes, scrape_jobs, regions RESTART IDENTITY CASCADE;`);
  console.log("Database wiped clean — all cafes, problems, jobs, and regions removed.");
  await pool.end();
}

resetDb().catch((err) => {
  console.error("Reset failed:", err.message);
  process.exit(1);
});
