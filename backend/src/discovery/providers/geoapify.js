const axios = require("axios");
const { requestWithRetry } = require("../http");
const { isValidBbox } = require("../geocode");
const { cleanString, normalizeSocial } = require("../normalize");

const GEOAPIFY_PLACES_URL = "https://api.geoapify.com/v2/places";
const GEOAPIFY_TIMEOUT = 20000;
const DEFAULT_LIMIT = 100;
const MAX_PAGE_SIZE = 500; // Geoapify's own per-request cap
const DEFAULT_CATEGORIES = "catering.cafe";
const USER_AGENT = process.env.COFFAI_USER_AGENT || "CoffAI-Lead-Engine/2.0";

function getApiKey() {
  const key = process.env.GEOAPIFY_API_KEY?.trim();
  if (!key) throw new Error("GEOAPIFY_API_KEY is not configured");
  return key;
}

function buildParams(bbox, limit, apiKey, offset = 0, categories = DEFAULT_CATEGORIES) {
  if (!isValidBbox(bbox)) throw new Error("Invalid bounding box");
  // Geoapify's rect filter is two opposite corners as lon,lat pairs:
  // rect:west,north,east,south — confirmed against Geoapify's own docs/examples.
  return {
    apiKey,
    categories,
    filter: `rect:${bbox.west},${bbox.north},${bbox.east},${bbox.south}`,
    limit,
    offset,
    lang: process.env.GEOAPIFY_LANGUAGE || "en",
  };
}

/**
 * IMPORTANT: Geoapify does NOT return a properties.contact object. Phone,
 * website, email, and social fields live inside properties.datasource.raw,
 * which holds the original OpenStreetMap tags Geoapify's data is built from
 * (since Geoapify's places data is itself OSM-sourced). Reading a nonexistent
 * `.contact` field — as an earlier draft of this provider did — silently
 * returns null for every contact field, which defeats the entire point of
 * using it for lead generation. Confirmed against Geoapify's published API docs.
 */
function normalizeFeature(feature) {
  const p = feature?.properties || {};
  const raw = p.datasource?.raw || {};
  const coordinates = feature?.geometry?.coordinates || [];

  const latitude = Number(p.lat ?? coordinates[1]);
  const longitude = Number(p.lon ?? coordinates[0]);
  const categories = Array.isArray(p.categories) ? p.categories : [];

  // Reuse OSM's own id scheme when we have it (raw.osm_type/raw.osm_id) so a
  // cafe found via Geoapify and the same cafe found via Overpass collapse to
  // one row instead of two — this is what makes cross-provider ON CONFLICT
  // upserts in the DB work correctly.
  const fsqPlaceId =
    raw.osm_type && raw.osm_id != null
      ? `osm:${raw.osm_type}:${raw.osm_id}`
      : p.place_id
      ? `geoapify:${p.place_id}`
      : `geoapify:${latitude}:${longitude}`;

  return {
    fsq_place_id: fsqPlaceId,
    name: cleanString(p.name || p.address_line1) || "(unnamed cafe)",
    address:
      cleanString(p.formatted) ||
      [p.address_line1, p.address_line2, p.city, p.state, p.country].filter(Boolean).join(", ") ||
      null,
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
    tel: cleanString(raw.phone || raw["contact:phone"]),
    website: cleanString(raw.website || raw["contact:website"]),
    email: cleanString(raw.email || raw["contact:email"]),
    instagram: normalizeSocial(raw["contact:instagram"] || raw.instagram),
    facebook_id: normalizeSocial(raw["contact:facebook"] || raw.facebook),
    categories: categories.length ? `Café > ${categories.join(", ")}` : "Café",
    source: "geoapify",
    sources: ["geoapify"],
  };
}

async function search(bbox, limit = DEFAULT_LIMIT) {
  const apiKey = getApiKey();
  const target = Math.min(Math.max(Math.floor(Number(limit) || DEFAULT_LIMIT), 1), 2000);
  const results = [];
  let offset = 0;

  while (results.length < target) {
    const pageLimit = Math.min(target - results.length, MAX_PAGE_SIZE);
    const params = buildParams(bbox, pageLimit, apiKey, offset);

    const response = await requestWithRetry(() =>
      axios.get(GEOAPIFY_PLACES_URL, {
        params,
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        timeout: GEOAPIFY_TIMEOUT,
      })
    );

    const features = response.data?.features || [];
    if (!features.length) break;

    results.push(...features.map(normalizeFeature));
    if (features.length < pageLimit) break;
    offset += features.length;
  }

  return results.filter((cafe) => cafe.name !== "(unnamed cafe)" && cafe.latitude !== null && cafe.longitude !== null);
}

module.exports = { search, buildParams, normalizeFeature };
