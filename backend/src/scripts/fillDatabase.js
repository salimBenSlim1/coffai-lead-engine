/**
 * Standalone bulk-fill script — run this directly with `npm run fill-db`
 * instead of the "Scan the world" button when you actually want to fill the
 * database over a long stretch of time.
 *
 * Why a script and not the HTTP endpoint: the /api/scrape/world route runs
 * entirely inside one HTTP request/response cycle. That's fine for a quick
 * test, but for something meant to run for hours it's fragile — closing the
 * browser tab, your laptop sleeping, or a flaky wifi connection kills the
 * whole thing with nothing saved past whatever was already committed to the
 * DB. This script:
 *
 *   - runs independently of any browser tab or HTTP connection
 *   - writes a checkpoint file after every city, so Ctrl+C / a crash / a
 *     laptop reboot only costs you the city that was in progress, not the
 *     whole run — just re-run the same command and it picks up where it left off
 *   - logs running totals so you can see progress without querying the DB
 *
 * Usage:
 *   npm run fill-db                       # full city list, default limit
 *   npm run fill-db -- --limit=300         # override per-city limit
 *   npm run fill-db -- --cities=20         # only the first 20 cities
 *   npm run fill-db -- --reset             # ignore any existing checkpoint, start over
 *
 * To actually run this unattended for a full day, use nohup/screen/tmux/pm2 —
 * a plain foreground `node` process dies if your terminal closes:
 *   nohup npm run fill-db > fill.log 2>&1 &
 */
const fs = require("fs");
const path = require("path");
const { pool } = require("../db");
const { scanCityIntoDb } = require("../services/cafePipeline");
const { isGroqDailyLimitReached } = require("../services/groq");
const WORLD_CITIES = require("../data/worldCities");

const CHECKPOINT_PATH = path.join(__dirname, "..", "..", ".fill-progress.json");
const DEFAULT_LIMIT = 300;
const DELAY_BETWEEN_CITIES_MS = 800; // polite pause for the free geocoding/Overpass mirrors

function parseArgs() {
  const args = {};
  for (const arg of process.argv.slice(2)) {
    const [key, value] = arg.replace(/^--/, "").split("=");
    args[key] = value === undefined ? true : value;
  }
  return args;
}

function loadCheckpoint() {
  try {
    return JSON.parse(fs.readFileSync(CHECKPOINT_PATH, "utf8"));
  } catch {
    return {
      completedCities: [],
      totals: { found: 0, analyzed: 0, savedWithoutAi: 0, skipped: 0 },
      startedAt: new Date().toISOString(),
    };
  }
}

function saveCheckpoint(checkpoint) {
  fs.writeFileSync(CHECKPOINT_PATH, JSON.stringify(checkpoint, null, 2));
}

function cityKey(city, countryCode) {
  return `${city}::${countryCode}`;
}

async function main() {
  const args = parseArgs();
  const limit = Math.min(Math.max(parseInt(args.limit, 10) || DEFAULT_LIMIT, 1), 500);
  const cityCap = parseInt(args.cities, 10);
  const cities = Number.isInteger(cityCap) && cityCap > 0 ? WORLD_CITIES.slice(0, cityCap) : WORLD_CITIES;

  let checkpoint = args.reset ? null : loadCheckpoint();
  if (!checkpoint) {
    checkpoint = {
      completedCities: [],
      totals: { found: 0, analyzed: 0, savedWithoutAi: 0, skipped: 0 },
      startedAt: new Date().toISOString(),
    };
    saveCheckpoint(checkpoint);
  }
  // Backward-compat: older checkpoint files predate the savedWithoutAi field.
  if (checkpoint.totals.savedWithoutAi == null) checkpoint.totals.savedWithoutAi = 0;
  const done = new Set(checkpoint.completedCities);

  const remaining = cities.filter((c) => !done.has(cityKey(c.city, c.countryCode)));
  console.log(
    `[fill-db] ${cities.length} cities total, ${done.size} already done, ${remaining.length} remaining. Per-city limit: ${limit}.`
  );
  if (done.size > 0) {
    console.log(
      `[fill-db] Resuming from checkpoint started ${checkpoint.startedAt}. Running totals so far: ` +
        `found ${checkpoint.totals.found}, AI-analyzed ${checkpoint.totals.analyzed}, ` +
        `saved-without-AI ${checkpoint.totals.savedWithoutAi}, no-contact-skipped ${checkpoint.totals.skipped}.`
    );
  }

  // Save progress on Ctrl+C too, not just after each city, so an interrupt
  // mid-city doesn't lose the checkpoint file itself.
  let shuttingDown = false;
  let announcedDailyLimit = false;
  process.on("SIGINT", () => {
    if (shuttingDown) process.exit(1);
    shuttingDown = true;
    console.log("\n[fill-db] Interrupted — finishing the current city, then stopping. Press Ctrl+C again to force quit.");
  });

  for (const { city, countryCode } of remaining) {
    if (shuttingDown) break;

    // Once Groq's daily quota is used up, analysis silently stops inside the
    // pipeline (cafes still get discovered and saved, just without AI fields).
    // We don't stop the run for this anymore — just announce it once so the
    // logs make sense instead of looking like AI enrichment mysteriously quit.
    if (isGroqDailyLimitReached() && !announcedDailyLimit) {
      console.log(
        `\n[fill-db] Groq's daily analysis quota is used up. Continuing to discover and save cafes ` +
          `(contact info, no AI fields) for the rest of this run — re-run tomorrow to backfill AI ` +
          `analysis on rows where openness_score IS NULL.\n`
      );
      announcedDailyLimit = true;
    }

    const client = await pool.connect();
    const startedAt = Date.now();
    try {
      const { found, analyzed, savedWithoutAi, skipped } = await scanCityIntoDb(client, { city, countryCode, limit });
      checkpoint.totals.found += found;
      checkpoint.totals.analyzed += analyzed;
      checkpoint.totals.savedWithoutAi += savedWithoutAi;
      checkpoint.totals.skipped += skipped;
      checkpoint.completedCities.push(cityKey(city, countryCode));
      saveCheckpoint(checkpoint);

      const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
      console.log(
        `[fill-db] ${city}, ${countryCode} — found ${found}, AI-analyzed ${analyzed}, ` +
          `saved-without-AI ${savedWithoutAi}, no-contact-skipped ${skipped} (${seconds}s). ` +
          `Running totals: found ${checkpoint.totals.found}, AI-analyzed ${checkpoint.totals.analyzed}, ` +
          `saved-without-AI ${checkpoint.totals.savedWithoutAi}.`
      );
    } catch (err) {
      console.warn(`[fill-db] ${city}, ${countryCode} FAILED: ${err.message} — will retry on next run.`);
      // Deliberately NOT marked as completed, so a re-run retries this city.
    } finally {
      client.release();
    }

    if (!shuttingDown) await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_CITIES_MS));
  }

  const stillRemaining = cities.length - checkpoint.completedCities.length;
  if (stillRemaining > 0) {
    console.log(`[fill-db] Stopped with ${stillRemaining} cities left. Re-run the same command to continue.`);
  } else {
    console.log(`[fill-db] All ${cities.length} cities done. Final totals:`, checkpoint.totals);
    console.log("[fill-db] Delete .fill-progress.json (or run with --reset) before starting a fresh full run.");
  }

  await pool.end();
  process.exit(shuttingDown ? 130 : 0);
}

main().catch((err) => {
  console.error("[fill-db] Fatal error:", err.message);
  process.exit(1);
});
