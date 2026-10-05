const axios = require("axios");
const { requestWithRetry } = require("../http");
const { cleanString, normalizePhone, normalizeSocial } = require("../normalize");

// Multiple public mirrors — tried in order, first success wins. These are
// community-run and do occasionally 403/503 under load, which is exactly why
// Geoapify is the primary provider and this is the fallback, not the reverse.
const OVERPASS_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.openstreetmap.ru/api/interpreter",
];

const OVERPASS_TIMEOUT = 30000;
const DEFAULT_LIMIT = 100;
const USER_AGENT = process.env.COFFAI_USER_AGENT || "CoffAI-Lead-Engine/2.0";

function buildQuery(bbox, limit) {
  const safeLimit = Math.max(1, Math.floor(Number(limit) || DEFAULT_LIMIT));
  // Three tag patterns: the standard amenity=cafe, anything tagged as serving
  // coffee via cuisine=*, and dedicated coffee shops/roasteries tagged shop=coffee.
  return `
    [out:json][timeout:25];
    (
      nwr["amenity"="cafe"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
      nwr["cuisine"~"coffee|coffee_shop|cafe",i](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
      nwr["shop"="coffee"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
    );
    out center tags ${safeLimit};
  `;
}

function normalizeElement(element) {
  const tags = element?.tags || {};
  const latitude = element.lat ?? element.center?.lat ?? null;
  const longitude = element.lon ?? element.center?.lon ?? null;

  const addressParts = [tags["addr:housenumber"], tags["addr:street"], tags["addr:city"]].filter(Boolean);

  return {
    fsq_place_id: `osm:${element.type}:${element.id}`,
    name: cleanString(tags.name) || "(unnamed cafe)",
    address: addressParts.length ? addressParts.join(" ") : cleanString(tags["addr:full"]),
    latitude: Number.isFinite(Number(latitude)) ? Number(latitude) : null,
    longitude: Number.isFinite(Number(longitude)) ? Number(longitude) : null,
    tel: normalizePhone(tags.phone || tags["contact:phone"]),
    website: cleanString(tags.website || tags["contact:website"]),
    email: cleanString(tags.email || tags["contact:email"]),
    instagram: normalizeSocial(tags["contact:instagram"] || tags.instagram),
    facebook_id: normalizeSocial(tags["contact:facebook"] || tags.facebook),
    categories: tags.cuisine ? `Café > ${tags.cuisine}` : "Café",
    source: "osm",
    sources: ["osm"],
  };
}

async function search(bbox, limit = DEFAULT_LIMIT) {
  const query = buildQuery(bbox, limit);
  let lastError;

  for (const url of OVERPASS_URLS) {
    try {
      const response = await requestWithRetry(
        () =>
          axios.post(url, `data=${encodeURIComponent(query)}`, {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              "User-Agent": USER_AGENT,
              Accept: "application/json",
            },
            timeout: OVERPASS_TIMEOUT,
          }),
        1
      );

      const elements = response.data?.elements || [];
      return elements
        .map(normalizeElement)
        .filter((cafe) => cafe.name !== "(unnamed cafe)" && cafe.latitude !== null && cafe.longitude !== null);
    } catch (error) {
      lastError = error;
      console.warn(`[CoffAI] Overpass mirror failed: ${url} — ${error.message}`);
    }
  }

  throw new Error(`All Overpass mirrors failed: ${lastError?.message || "unknown error"}`);
}

module.exports = { search, buildQuery, normalizeElement };
