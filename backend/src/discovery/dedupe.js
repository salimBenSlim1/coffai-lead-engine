const { normalizePhone, normalizeWebsite } = require("./normalize");
const { distanceMeters, nameSimilarity } = require("./similarity");
const { calculateDataQuality } = require("./quality");

// Two records are "the same cafe" if they share an exact phone or website, OR
// they're within 80m of each other AND their names are at least 72% similar.
// The distance+name combo guards against two unrelated cafes on the same block
// (or two branches of the same chain) getting merged into one.
function sameCafe(a, b) {
  const phoneA = normalizePhone(a.tel);
  const phoneB = normalizePhone(b.tel);
  if (phoneA && phoneB && phoneA === phoneB) return true;

  const websiteA = normalizeWebsite(a.website);
  const websiteB = normalizeWebsite(b.website);
  if (websiteA && websiteB && websiteA === websiteB) return true;

  const latA = Number(a.latitude);
  const lonA = Number(a.longitude);
  const latB = Number(b.latitude);
  const lonB = Number(b.longitude);
  if (![latA, lonA, latB, lonB].every(Number.isFinite)) return false;

  if (distanceMeters(latA, lonA, latB, lonB) > 80) return false;
  return nameSimilarity(a.name, b.name) >= 0.72;
}

function firstValue(...values) {
  return values.find((v) => v !== null && v !== undefined && String(v).trim() !== "") ?? null;
}

// Keeps whichever record currently scores higher on data quality as the base,
// then fills any gaps from the other one field-by-field.
function mergeCafe(existing, incoming) {
  const existingScore = calculateDataQuality(existing);
  const incomingScore = calculateDataQuality(incoming);
  const preferred = existingScore >= incomingScore ? existing : incoming;
  const other = preferred === existing ? incoming : existing;

  const sources = [...new Set([...(existing.sources || []), ...(incoming.sources || [])])];

  return {
    ...preferred,
    name: firstValue(preferred.name, other.name),
    address: firstValue(preferred.address, other.address),
    latitude: firstValue(preferred.latitude, other.latitude),
    longitude: firstValue(preferred.longitude, other.longitude),
    tel: firstValue(preferred.tel, other.tel),
    website: firstValue(preferred.website, other.website),
    email: firstValue(preferred.email, other.email),
    instagram: firstValue(preferred.instagram, other.instagram),
    facebook_id: firstValue(preferred.facebook_id, other.facebook_id),
    categories: firstValue(preferred.categories, other.categories),
    sources,
    source: sources.length > 1 ? "multiple" : sources[0],
  };
}

// O(n^2) fuzzy scan — fine at the scale we run at (a few hundred cafes per
// city/box scan). If a scan ever grows into the thousands, bucket by rounded
// lat/lon first before comparing.
function dedupeCafes(cafes) {
  const result = [];
  const indexById = new Map(); // fsq_place_id -> index in result

  for (const cafe of cafes) {
    if (!cafe) continue;

    // Exact id match (e.g. both providers resolved to the same OSM node) —
    // merge into the existing record rather than dropping the newcomer, so we
    // don't silently lose contact fields the other provider found.
    if (cafe.fsq_place_id && indexById.has(cafe.fsq_place_id)) {
      const idx = indexById.get(cafe.fsq_place_id);
      result[idx] = { ...mergeCafe(result[idx], cafe), dataQualityScore: 0 };
      result[idx].dataQualityScore = calculateDataQuality(result[idx]);
      continue;
    }

    const duplicateIndex = result.findIndex((existing) => sameCafe(existing, cafe));
    if (duplicateIndex >= 0) {
      const merged = mergeCafe(result[duplicateIndex], cafe);
      result[duplicateIndex] = { ...merged, dataQualityScore: calculateDataQuality(merged) };
      if (cafe.fsq_place_id) indexById.set(cafe.fsq_place_id, duplicateIndex);
      continue;
    }

    if (cafe.fsq_place_id) indexById.set(cafe.fsq_place_id, result.length);
    result.push({ ...cafe, dataQualityScore: calculateDataQuality(cafe) });
  }

  return result;
}

module.exports = { sameCafe, mergeCafe, dedupeCafes };
