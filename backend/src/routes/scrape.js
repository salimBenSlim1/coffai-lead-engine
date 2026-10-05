const express = require("express");
const { pool } = require("../db");
const { searchCafesInBbox, reverseGeocode } = require("../services/osmPlaces");
const { saveCafes, scanCityIntoDb } = require("../services/cafePipeline");
const WORLD_CITIES = require("../data/worldCities");

const router = express.Router();

// A drawn box bigger than this (in degrees, roughly ~330km on a side near the equator)
// is rejected — Overpass's public mirrors will time out or rate-limit on anything
// approaching a whole country. Ask the user to zoom in / draw a smaller box instead.
const MAX_BBOX_DEGREES = 3;

// POST /api/scrape  { city, countryCode }   e.g. { "city": "Casablanca", "countryCode": "MA" }
// Legacy flow: type a city + country, geocode it, scan the resulting box.
router.post("/", async (req, res) => {
  const { city, countryCode } = req.body;
  if (!city || !countryCode) {
    return res.status(400).json({ error: "city and countryCode (ISO2, e.g. 'MA') are required" });
  }

  const client = await pool.connect();
  let jobId;
  try {
    const jobRes = await client.query(`INSERT INTO scrape_jobs (status) VALUES ('running') RETURNING id`);
    jobId = jobRes.rows[0].id;

    const maxResults = parseInt(process.env.MAX_RESULTS_PER_REGION || "30", 10);
    const { regionId, found, analyzed, skipped, savedCafes } = await scanCityIntoDb(client, {
      city,
      countryCode,
      limit: maxResults,
    });

    await client.query(
      `UPDATE scrape_jobs SET status='done', region_id=$1, cafes_found=$2, cafes_analyzed=$3, finished_at=now() WHERE id=$4`,
      [regionId, found, analyzed, jobId]
    );

    res.json({ jobId, regionId, cafesFound: found, cafesAnalyzed: analyzed, cafesSkipped: skipped, cafes: savedCafes });
  } catch (err) {
    console.error(err);
    if (jobId) {
      await pool.query(`UPDATE scrape_jobs SET status='failed', error=$1, finished_at=now() WHERE id=$2`, [
        err.message,
        jobId,
      ]);
    }
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// POST /api/scrape/area  { south, west, north, east, label?, maxResults? }
// New flow: draw a rectangle on the map, scan exactly that box directly via Overpass
// (no city/country typing, no geocoding step). We still best-effort reverse-geocode
// the box's center so the region gets a readable label and Groq gets a country code
// to look up regional pain patterns for — but neither is required to run the scan.
router.post("/area", async (req, res) => {
  const { south, west, north, east, label, maxResults } = req.body;

  const bbox = { south: Number(south), west: Number(west), north: Number(north), east: Number(east) };
  if (Object.values(bbox).some((n) => Number.isNaN(n))) {
    return res.status(400).json({ error: "south, west, north, east (numbers) are required" });
  }
  if (bbox.south >= bbox.north || bbox.west >= bbox.east) {
    return res.status(400).json({ error: "Invalid box: south must be < north and west must be < east" });
  }
  if (bbox.north - bbox.south > MAX_BBOX_DEGREES || bbox.east - bbox.west > MAX_BBOX_DEGREES) {
    return res.status(400).json({
      error: `That area is too large to scan in one go (max ${MAX_BBOX_DEGREES}° per side, roughly a big metro area). Draw a smaller box and scan in a few passes.`,
    });
  }

  const client = await pool.connect();
  let jobId;
  try {
    const centerLat = (bbox.south + bbox.north) / 2;
    const centerLon = (bbox.west + bbox.east) / 2;
    const geo = await reverseGeocode(centerLat, centerLon);

    const regionLabel = label?.trim() || geo.label || "Custom map area";
    const regionRes = await client.query(
      `INSERT INTO regions (country_code, city, label, source, bbox_south, bbox_north, bbox_west, bbox_east)
       VALUES ($1, $2, $3, 'map', $4, $5, $6, $7)
       RETURNING id`,
      [geo.countryCode, geo.city, regionLabel, bbox.south, bbox.north, bbox.west, bbox.east]
    );
    const regionId = regionRes.rows[0].id;

    const jobRes = await client.query(
      `INSERT INTO scrape_jobs (region_id, status) VALUES ($1, 'running') RETURNING id`,
      [regionId]
    );
    jobId = jobRes.rows[0].id;

    const limit = Math.min(Math.max(parseInt(maxResults, 10) || 100, 1), 300);
    const places = await searchCafesInBbox(bbox, limit);
    const { analyzed, skipped, savedCafes } = await saveCafes(client, {
      regionId,
      countryCodeForAI: geo.countryCode,
      places,
    });

    await client.query(
      `UPDATE scrape_jobs SET status='done', cafes_found=$1, cafes_analyzed=$2, finished_at=now() WHERE id=$3`,
      [places.length, analyzed, jobId]
    );

    res.json({
      jobId,
      regionId,
      label: regionLabel,
      countryCode: geo.countryCode,
      cafesFound: places.length,
      cafesAnalyzed: analyzed,
      cafesSkipped: skipped,
      cafes: savedCafes,
    });
  } catch (err) {
    console.error(err);
    if (jobId) {
      await pool.query(`UPDATE scrape_jobs SET status='failed', error=$1, finished_at=now() WHERE id=$2`, [
        err.message,
        jobId,
      ]);
    }
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// POST /api/scrape/world  { maxResultsPerCity?, cityLimit? }
// The "scan the world" button: walks a curated list of cities spanning every
// major region (see data/worldCities.js), running the normal city-based pipeline
// for each one. This is a long-running, sequential request on purpose — a small
// delay between cities keeps us polite to the free geocoding/Overpass mirrors.
// Only cafés with real contact info AND a completed AI analysis get saved
// (see saveCafes' quality gate above); everything else is silently skipped.
router.post("/world", async (req, res) => {
  const { maxResultsPerCity, cityLimit } = req.body || {};
  const perCityLimit = Math.min(Math.max(parseInt(maxResultsPerCity, 10) || 150, 1), 500);
  const limitCount = parseInt(cityLimit, 10);
  const cities = Number.isInteger(limitCount) && limitCount > 0
    ? WORLD_CITIES.slice(0, Math.min(limitCount, WORLD_CITIES.length))
    : WORLD_CITIES;

  const jobRes = await pool.query(
    `INSERT INTO scrape_jobs (region_id, status) VALUES (NULL, 'running') RETURNING id`
  );
  const jobId = jobRes.rows[0].id;

  const results = [];
  let totalFound = 0;
  let totalAnalyzed = 0;
  let totalSkipped = 0;

  for (const { city, countryCode } of cities) {
    const client = await pool.connect();
    try {
      const { found, analyzed, skipped } = await scanCityIntoDb(client, { city, countryCode, limit: perCityLimit });

      totalFound += found;
      totalAnalyzed += analyzed;
      totalSkipped += skipped;
      results.push({ city, countryCode, found, saved: analyzed, skipped });
    } catch (err) {
      console.warn(`World scan: ${city}, ${countryCode} failed: ${err.message}`);
      results.push({ city, countryCode, error: err.message });
    } finally {
      client.release();
    }
    // Small pause between cities — these are free, shared, community-run services.
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  await pool.query(
    `UPDATE scrape_jobs SET status='done', cafes_found=$1, cafes_analyzed=$2, finished_at=now() WHERE id=$3`,
    [totalFound, totalAnalyzed, jobId]
  );

  res.json({
    jobId,
    citiesScanned: cities.length,
    totalFound,
    totalAnalyzed,
    totalSkipped,
    results,
  });
});

module.exports = router;
