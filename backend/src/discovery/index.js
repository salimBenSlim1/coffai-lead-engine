const fsqOpenPlaces = require("./providers/fsqOpenPlaces");
const geoapify = require("./providers/geoapify");
const overpass = require("./providers/overpass");
const { geocodeCity, reverseGeocode, isValidBbox } = require("./geocode");
const { dedupeCafes } = require("./dedupe");

const DEFAULT_LIMIT = 100;

/**
 * Searches every configured provider for a bbox, merges + dedupes the results,
 * and returns them ranked by data quality (richest contact info first).
 *
 * Providers, in the order they're tried:
 *   1. fsq_open_places — Foursquare's free, open, unmetered S3 dataset. Best
 *      contact-field coverage of the three since it's aggregated from many
 *      sources, not just OSM tags. No API key needed, but does need outbound
 *      access to S3 and the duckdb extension mirror.
 *   2. geoapify        — needs GEOAPIFY_API_KEY; same underlying OSM data as
 *      Overpass but far more reliable uptime/rate limits.
 *   3. overpass         — free public OSM mirrors, no key, but occasionally
 *      403s/times out under load. Kept as the always-available fallback.
 *
 * options.source can force a single provider ('fsq_open_places' | 'geoapify' |
 * 'overpass') for testing/debugging — defaults to 'combined', which tries all
 * three and only fails if EVERY provider fails or is unavailable.
 */
async function searchCafesInBbox(bbox, limit = DEFAULT_LIMIT, options = {}) {
  if (!isValidBbox(bbox)) throw new Error("Invalid bounding box");
  const safeLimit = Math.max(1, Math.floor(Number(limit) || DEFAULT_LIMIT));
  const source = options.source || process.env.COFFAI_DISCOVERY_SOURCE || "combined";

  if (!["combined", "fsq_open_places", "geoapify", "overpass"].includes(source)) {
    throw new Error(`Invalid discovery source: ${source}`);
  }

  const providerResults = [];
  const providerErrors = [];

  if (source === "combined" || source === "fsq_open_places") {
    try {
      const cafes = await fsqOpenPlaces.search(bbox, safeLimit);
      console.log(`[CoffAI] FSQ OS Places: ${cafes.length} cafés`);
      providerResults.push(...cafes);
    } catch (error) {
      console.warn(`[CoffAI] FSQ OS Places failed: ${error.message}`);
      providerErrors.push(error);
      if (source === "fsq_open_places") throw error;
    }
  }

  if (source === "combined" || source === "geoapify") {
    try {
      const cafes = await geoapify.search(bbox, safeLimit);
      console.log(`[CoffAI] Geoapify: ${cafes.length} cafés`);
      providerResults.push(...cafes);
    } catch (error) {
      const isMissingKey = /GEOAPIFY_API_KEY is not configured/.test(error.message);
      if (isMissingKey) {
        console.log("[CoffAI] Geoapify skipped (no GEOAPIFY_API_KEY configured)");
      } else {
        console.warn(`[CoffAI] Geoapify failed: ${error.message}`);
      }
      providerErrors.push(error);
      if (source === "geoapify") throw error;
    }
  }

  if (source === "combined" || source === "overpass") {
    try {
      const cafes = await overpass.search(bbox, safeLimit);
      console.log(`[CoffAI] Overpass: ${cafes.length} cafés`);
      providerResults.push(...cafes);
    } catch (error) {
      console.warn(`[CoffAI] Overpass failed: ${error.message}`);
      providerErrors.push(error);
      if (source === "overpass") throw error;
    }
  }

  if (!providerResults.length) {
    throw new Error(
      `All café discovery providers failed or returned nothing. Last errors: ${providerErrors
        .map((e) => e.message)
        .join("; ")}`
    );
  }

  const merged = dedupeCafes(providerResults);
  console.log(`[CoffAI] Combined discovery: ${merged.length} unique cafés`);

  return merged.sort((a, b) => b.dataQualityScore - a.dataQualityScore).slice(0, safeLimit);
}

async function searchCafes(city, countryCode, limit = DEFAULT_LIMIT, options = {}) {
  const bbox = await geocodeCity(city, countryCode);
  return searchCafesInBbox(bbox, limit, options);
}

module.exports = { searchCafes, searchCafesInBbox, reverseGeocode, geocodeCity };
