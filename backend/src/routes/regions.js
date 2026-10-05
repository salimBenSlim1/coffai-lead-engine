const express = require("express");
const { pool } = require("../db");

const router = express.Router();

// GET /api/regions — every past scan (city-based or map-drawn), with a live café
// count, so the UI can draw previously-scanned boxes on the map and let the user
// avoid re-scanning the same spot.
router.get("/", async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT r.id, r.label, r.city, r.country_code, r.source,
       r.bbox_south, r.bbox_north, r.bbox_west, r.bbox_east, r.created_at,
       COUNT(c.id) AS cafe_count
     FROM regions r
     LEFT JOIN cafes c ON c.region_id = r.id
     GROUP BY r.id
     ORDER BY r.created_at DESC
     LIMIT 100`
  );
  res.json(rows);
});

module.exports = router;
