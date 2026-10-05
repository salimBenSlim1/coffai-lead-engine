const axios = require("axios");
const { requestWithRetry } = require("./http");

const PHOTON_URL = "https://photon.komoot.io/api/";
const PHOTON_REVERSE_URL = "https://photon.komoot.io/reverse";
const PHOTON_TIMEOUT = 10000;
const USER_AGENT = process.env.COFFAI_USER_AGENT || "CoffAI-Lead-Engine/2.0";

function isValidBbox(bbox) {
  if (!bbox) return false;
  const values = [bbox.south, bbox.west, bbox.north, bbox.east];
  if (!values.every(Number.isFinite)) return false;
  return (
    bbox.south <= bbox.north &&
    bbox.west <= bbox.east &&
    bbox.south >= -90 &&
    bbox.north <= 90 &&
    bbox.west >= -180 &&
    bbox.east <= 180
  );
}

// Turns a city name into a bounding box: uses Photon's own extent for the place
// when it has one, otherwise falls back to a small box around its center point.
async function geocodeCity(city, countryCode) {
  if (!city) throw new Error("City is required");

  try {
    const response = await requestWithRetry(
      () =>
        axios.get(PHOTON_URL, {
          params: { q: `${city}, ${countryCode || ""}`, limit: 1 },
          headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
          timeout: PHOTON_TIMEOUT,
        }),
      1
    );

    const feature = response.data?.features?.[0];
    if (!feature) throw new Error(`Could not find "${city}, ${countryCode}"`);

    const coordinates = feature.geometry?.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length < 2) {
      throw new Error("Geocoder returned invalid coordinates");
    }
    const [longitude, latitude] = coordinates.map(Number);

    const extent = feature.properties?.extent;
    if (Array.isArray(extent) && extent.length === 4) {
      const [west, north, east, south] = extent.map(Number);
      const bbox = { south, north, west, east };
      if (isValidBbox(bbox)) return bbox;
    }

    const delta = Number(process.env.COFFAI_CITY_BBOX_DELTA) || 0.08;
    const bbox = { south: latitude - delta, north: latitude + delta, west: longitude - delta, east: longitude + delta };
    if (!isValidBbox(bbox)) throw new Error("Could not construct valid city bounding box");
    return bbox;
  } catch (error) {
    throw new Error(`Geocoding failed: ${error.message}`);
  }
}

// Best-effort only — used to label a map-drawn area and give Groq a country
// code. Never throws; a drawn box with no resolvable place name is still valid.
async function reverseGeocode(latitude, longitude) {
  if (!Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude))) {
    return { city: null, countryCode: null, label: null };
  }

  try {
    const response = await axios.get(PHOTON_REVERSE_URL, {
      params: { lon: longitude, lat: latitude },
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      timeout: PHOTON_TIMEOUT,
    });

    const props = response.data?.features?.[0]?.properties;
    if (!props) return { city: null, countryCode: null, label: null };

    const city = props.city || props.town || props.village || props.county || null;
    const countryCode = props.countrycode ? props.countrycode.toUpperCase() : null;
    const label = [city, props.country].filter(Boolean).join(", ") || props.name || null;
    return { city, countryCode, label };
  } catch {
    return { city: null, countryCode: null, label: null };
  }
}

module.exports = { geocodeCity, reverseGeocode, isValidBbox };
