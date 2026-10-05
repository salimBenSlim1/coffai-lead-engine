const { DuckDBInstance } = require("@duckdb/node-api");

// Foursquare's own free, open (Apache 2.0), unmetered dataset of 100M+ real-world
// places — hosted as public Parquet files on S3, no API key needed. Its schema
// already has tel/website/email/facebook_id/instagram as native columns, sourced
// from Foursquare's aggregation across many providers, which in practice covers
// contact info far better than raw OSM tags. See:
// https://docs.foursquare.com/data-products/docs/places-os-data-schema
const BUCKET = "fsq-os-places-us-east-1";
const DEFAULT_LIMIT = 100;
const RELEASE_DATE_TTL_MS = 24 * 60 * 60 * 1000; // re-check for a newer monthly release once a day

let connectionPromise = null;
let cachedReleaseDate = null;
let cachedReleaseDateFetchedAt = 0;

async function getConnection() {
  if (!connectionPromise) {
    connectionPromise = (async () => {
      const instance = await DuckDBInstance.create(":memory:");
      const conn = await instance.connect();
      await conn.run("INSTALL httpfs;");
      await conn.run("LOAD httpfs;");
      // Public, anonymous-read bucket — no AWS credentials used or required.
      await conn.run("SET s3_region='us-east-1';");
      return conn;
    })();
  }
  return connectionPromise;
}

function unwrapList(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : value.items || [];
}

function cleanString(value) {
  if (value === null || value === undefined) return null;
  const result = String(value).trim();
  return result || null;
}

/**
 * FSQ OS Places ships a new dt=YYYY-MM-DD partition monthly. Rather than
 * hardcoding a date that will silently go stale, we ask S3 (via DuckDB's glob())
 * which partitions actually exist and use the newest one, caching the answer
 * for a day. If listing ever fails — some networks/regions restrict anonymous
 * ListBucket even when GetObject is public — we fall back to
 * FSQ_OS_PLACES_RELEASE_DATE from the environment if you've set one.
 */
async function resolveReleaseDate(conn) {
  const isFresh = cachedReleaseDate && Date.now() - cachedReleaseDateFetchedAt < RELEASE_DATE_TTL_MS;
  if (isFresh) return cachedReleaseDate;

  try {
    const reader = await conn.runAndReadAll(
      `SELECT DISTINCT regexp_extract(file, 'dt=([0-9-]+)', 1) AS dt
       FROM glob('s3://${BUCKET}/release/*/places/parquet/*.snappy.parquet')
       ORDER BY dt DESC LIMIT 1`
    );
    const dt = reader.getRowObjects()[0]?.dt;
    if (dt) {
      cachedReleaseDate = dt;
      cachedReleaseDateFetchedAt = Date.now();
      console.log(`[CoffAI] FSQ OS Places: using latest release dt=${dt}`);
      return dt;
    }
  } catch (err) {
    console.warn(`[CoffAI] FSQ OS Places: could not auto-detect latest release (${err.message})`);
  }

  if (process.env.FSQ_OS_PLACES_RELEASE_DATE) {
    console.warn(
      `[CoffAI] FSQ OS Places: falling back to FSQ_OS_PLACES_RELEASE_DATE=${process.env.FSQ_OS_PLACES_RELEASE_DATE}`
    );
    return process.env.FSQ_OS_PLACES_RELEASE_DATE;
  }

  throw new Error(
    "Could not auto-detect the latest FSQ OS Places release, and FSQ_OS_PLACES_RELEASE_DATE isn't set as a fallback. " +
      "Check https://docs.foursquare.com/data-products/docs/places-os-data-schema for the current release date."
  );
}

function normalizeRow(row) {
  const categories = unwrapList(row.fsq_category_labels);
  const addressParts = [row.address, row.locality, row.region, row.country].filter(Boolean);

  return {
    fsq_place_id: row.fsq_place_id, // already Foursquare's own stable id — matches our DB's unique key
    name: cleanString(row.name) || "(unnamed cafe)",
    address: addressParts.length ? addressParts.join(", ") : null,
    latitude: Number.isFinite(Number(row.latitude)) ? Number(row.latitude) : null,
    longitude: Number.isFinite(Number(row.longitude)) ? Number(row.longitude) : null,
    tel: cleanString(row.tel),
    website: cleanString(row.website),
    email: cleanString(row.email),
    instagram: cleanString(row.instagram),
    facebook_id: cleanString(row.facebook_id),
    categories: categories.length ? `Café > ${categories.join(", ")}` : "Café",
    source: "fsq_open_places",
    sources: ["fsq_open_places"],
  };
}

async function search(bbox, limit = DEFAULT_LIMIT) {
  const conn = await getConnection();
  const dt = await resolveReleaseDate(conn);
  const safeLimit = Math.max(1, Math.floor(Number(limit) || DEFAULT_LIMIT));
  const path = `s3://${BUCKET}/release/dt=${dt}/places/parquet/*.snappy.parquet`;

  // fsq_category_labels is an array of hierarchical strings like
  // "Dining and Drinking > Café, Coffee, and Tea House" — matched loosely on
  // wording rather than one exact label, since taxonomy text can shift
  // slightly between monthly releases.
  const prepared = await conn.prepare(`
    SELECT fsq_place_id, name, address, locality, region, country,
           latitude, longitude, tel, website, email, facebook_id, instagram,
           fsq_category_labels
    FROM read_parquet('${path}')
    WHERE latitude BETWEEN $south AND $north
      AND longitude BETWEEN $west AND $east
      AND date_closed IS NULL
      AND len(list_filter(
            fsq_category_labels,
            x -> x ILIKE '%café%' OR x ILIKE '%cafe%' OR x ILIKE '%coffee%' OR x ILIKE '%tea house%'
          )) > 0
    LIMIT $limit
  `);

  prepared.bindDouble(prepared.parameterIndex("south"), bbox.south);
  prepared.bindDouble(prepared.parameterIndex("north"), bbox.north);
  prepared.bindDouble(prepared.parameterIndex("west"), bbox.west);
  prepared.bindDouble(prepared.parameterIndex("east"), bbox.east);
  prepared.bindInteger(prepared.parameterIndex("limit"), safeLimit);

  const reader = await prepared.runAndReadAll();
  return reader
    .getRowObjects()
    .map(normalizeRow)
    .filter((cafe) => cafe.name !== "(unnamed cafe)" && cafe.latitude !== null && cafe.longitude !== null);
}

module.exports = { search, resolveReleaseDate, normalizeRow };
