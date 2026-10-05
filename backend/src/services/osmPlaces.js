// Backward-compatible entry point. The actual café-discovery logic now lives in
// src/discovery/ as a small provider system (see discovery/index.js):
//
//   discovery/providers/geoapify.js   — primary source, needs GEOAPIFY_API_KEY
//   discovery/providers/overpass.js   — free fallback, no key required
//   discovery/dedupe.js               — merges the two when both find a cafe
//   discovery/quality.js              — hasContactInfo() gate + scoring
//   discovery/geocode.js              — Photon forward/reverse geocoding
//
// Kept as a thin re-export so nothing importing "../services/osmPlaces"
// elsewhere in the app needs to change.
module.exports = require("../discovery");
