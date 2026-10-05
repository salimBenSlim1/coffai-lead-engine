const express = require("express");
const { pool } = require("../db");
const { draftOutreachMessage } = require("../services/groq");

const router = express.Router();

// GET /api/cafes?city=&countryCode=&category=&minOpenness=&status=
// status: 'new' (default — hides anything you've already marked contacted),
// 'contacted' (only the ones you've reached out to), or 'all'.
router.get("/", async (req, res) => {
  const { city, countryCode, category, minOpenness, status = "new" } = req.query;

  const conditions = [];
  const params = [];

  if (city) {
    params.push(city);
    conditions.push(`r.city ILIKE $${params.length}`);
  }
  if (countryCode) {
    params.push(countryCode.toUpperCase());
    conditions.push(`r.country_code = $${params.length}`);
  }
  if (minOpenness) {
    params.push(minOpenness);
    conditions.push(`c.openness_score >= $${params.length}`);
  }
  if (category) {
    params.push(category);
    conditions.push(
      `EXISTS (SELECT 1 FROM cafe_problems cp WHERE cp.cafe_id = c.id AND cp.category = $${params.length})`
    );
  }
  if (status === "new") {
    conditions.push(`c.contacted_at IS NULL`);
  } else if (status === "contacted") {
    conditions.push(`c.contacted_at IS NOT NULL`);
  } // status === 'all' -> no filter

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await pool.query(
    `SELECT c.*, r.city, r.country_code,
       COALESCE(json_agg(json_build_object(
         'category', cp.category, 'description', cp.description, 'confidence', cp.confidence
       )) FILTER (WHERE cp.id IS NOT NULL), '[]') AS problems
     FROM cafes c
     JOIN regions r ON r.id = c.region_id
     LEFT JOIN cafe_problems cp ON cp.cafe_id = c.id
     ${where}
     GROUP BY c.id, r.city, r.country_code
     ORDER BY c.openness_score DESC NULLS LAST, c.pain_score DESC NULLS LAST`,
    params
  );

  res.json(rows);
});

// POST /api/cafes/:id/message  { language }
// Generates a draft message for the user to copy and send manually.
router.post("/:id/message", async (req, res) => {
  const { id } = req.params;
  const { language = "English" } = req.body;

  const { rows } = await pool.query(
    `SELECT c.name,
       COALESCE(json_agg(json_build_object('description', cp.description)) FILTER (WHERE cp.id IS NOT NULL), '[]') AS problems
     FROM cafes c LEFT JOIN cafe_problems cp ON cp.cafe_id = c.id
     WHERE c.id = $1 GROUP BY c.id`,
    [id]
  );

  if (!rows.length) return res.status(404).json({ error: "Cafe not found" });
  if (!rows[0].problems.length) {
    return res.status(400).json({ error: "No inferred problems stored for this cafe yet" });
  }

  const message = await draftOutreachMessage(rows[0].name, rows[0].problems, language);
  res.json({ message });
});

// POST /api/cafes/:id/contacted — mark a cafe as reached out to. The app never
// sends messages itself (that stays a manual step), so this is you confirming
// "I actually sent this one" after copying the drafted message elsewhere.
// Contacted cafes drop out of the default GET /api/cafes list.
router.post("/:id/contacted", async (req, res) => {
  const { rows } = await pool.query(
    `UPDATE cafes SET contacted_at = now() WHERE id = $1 RETURNING id, name, contacted_at`,
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: "Cafe not found" });
  res.json(rows[0]);
});

// POST /api/cafes/:id/uncontacted — undo, in case of a mis-click.
router.post("/:id/uncontacted", async (req, res) => {
  const { rows } = await pool.query(
    `UPDATE cafes SET contacted_at = NULL WHERE id = $1 RETURNING id, name, contacted_at`,
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: "Cafe not found" });
  res.json(rows[0]);
});

module.exports = router;
