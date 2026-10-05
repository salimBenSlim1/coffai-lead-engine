// A cafe with zero contact methods is useless for outreach — nothing to click,
// call, or DM. This is the hard gate applied before a cafe is ever saved.
function hasContactInfo(cafe) {
  return Boolean(cafe.tel || cafe.website || cafe.email || cafe.instagram || cafe.facebook_id);
}

// 0-100, used to rank candidates when trimming to a limit and to decide which
// version of a duplicate to keep as the "preferred" record during merge.
function calculateDataQuality(cafe) {
  let score = 0;
  if (cafe.name) score += 15;
  if (cafe.address) score += 15;
  if (Number.isFinite(Number(cafe.latitude)) && Number.isFinite(Number(cafe.longitude))) score += 15;
  if (cafe.tel) score += 15;
  if (cafe.website) score += 15;
  if (cafe.email) score += 10;
  if (cafe.instagram) score += 5;
  if (cafe.facebook_id) score += 5;
  return Math.min(score, 100);
}

module.exports = { hasContactInfo, calculateDataQuality };
