const { searchCafes } = require("./osmPlaces");
const { hasContactInfo } = require("../discovery/quality");
const { analyzeCafe, GroqDailyLimitError, isGroqDailyLimitReached } = require("./groq");
const { extractSocialLinks } = require("./websiteScraper");

// OSM tags sometimes already contain a full URL (e.g. "https://instagram.com/xyz"),
// sometimes just a handle ("xyz") — normalize both into a usable link.
function toSocialUrl(value, domain) {
  if (!value) return null;
  if (value.startsWith("http")) return value;
  return `https://${domain}/${value.replace(/^@/, "")}`;
}

/**
 * Shared pipeline: given cafés already pulled from discovery, run each through
 * Groq and upsert into Postgres. Used by the city-based route, the draw-on-a-map
 * route, the world-scan route, and the standalone fill script.
 *
 * ONE hard requirement before anything gets written to the DB:
 *   - The cafe must have at least one contact method (phone/website/email/social).
 *
 * AI analysis is best-effort, not a gate: a cafe with contact info gets SAVED
 * either way. If Groq succeeds, ai_summary/openness_score/pain_score/problems
 * get filled in. If it fails (or the daily quota is already used up), those
 * columns stay NULL and the cafe is saved anyway — you can re-run analysis on
 * just the NULL rows later once quota resets, rather than losing the discovery
 * work entirely because the enrichment step couldn't run yet.
 */
async function saveCafes(client, { regionId, countryCodeForAI, places }) {
  let analyzed = 0;
  let savedWithoutAi = 0;
  let skippedNoContact = 0;
  const savedCafes = [];

  for (let place of places) {
    if (!hasContactInfo(place)) {
      skippedNoContact += 1;
      continue;
    }

    // Enrichment: if we have the cafe's own website but are missing social
    // handles, pull them from links published on that site (never scraped
    // from Instagram/Facebook/WhatsApp directly — see websiteScraper.js).
    if (place.website && (!place.instagram || !place.facebook_id)) {
      const social = await extractSocialLinks(place.website);
      place = {
        ...place,
        instagram: place.instagram || social.instagram_url,
        facebook_id: place.facebook_id || social.facebook_url,
        whatsapp_url: social.whatsapp_url || null,
      };
    }

    let aiResult = { problems: [], openness_score: null, pain_score: null, ai_summary: null };

    // Once we've hit today's Groq quota, don't even attempt more calls — each
    // one would just wait out the throttle and then fail again for nothing.
    // Cafes still get saved below, just without AI enrichment this round.
    if (!isGroqDailyLimitReached()) {
      try {
        aiResult = await analyzeCafe(place, countryCodeForAI);
      } catch (err) {
        if (!(err instanceof GroqDailyLimitError)) {
          console.warn(`Groq analysis failed for ${place.name}: ${err.message}`);
        }
        // Either way (daily limit or a one-off failure): fall through and
        // save the cafe with the blank aiResult already set above.
      }
    }

    const hasScores = aiResult.openness_score != null && aiResult.pain_score != null;

    const instagramUrl = toSocialUrl(place.instagram, "instagram.com");
    const facebookUrl = toSocialUrl(place.facebook_id, "facebook.com");

    const cafeRes = await client.query(
      `INSERT INTO cafes (
         region_id, fsq_place_id, name, address, lat, lng, phone, website, email,
         instagram_url, facebook_url, whatsapp_url, categories,
         ai_summary, openness_score, pain_score, last_analyzed_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16, $17)
       ON CONFLICT (fsq_place_id) DO UPDATE SET
         region_id = EXCLUDED.region_id,
         name = EXCLUDED.name, address = EXCLUDED.address, phone = EXCLUDED.phone,
         website = EXCLUDED.website, email = EXCLUDED.email,
         instagram_url = EXCLUDED.instagram_url, facebook_url = EXCLUDED.facebook_url,
         whatsapp_url = EXCLUDED.whatsapp_url,
         categories = EXCLUDED.categories,
         -- Never overwrite a previous successful analysis with a blank one on re-scan:
         ai_summary = COALESCE(EXCLUDED.ai_summary, cafes.ai_summary),
         openness_score = COALESCE(EXCLUDED.openness_score, cafes.openness_score),
         pain_score = COALESCE(EXCLUDED.pain_score, cafes.pain_score),
         last_analyzed_at = COALESCE(EXCLUDED.last_analyzed_at, cafes.last_analyzed_at),
         updated_at = now()
       RETURNING id`,
      [
        regionId,
        place.fsq_place_id,
        place.name,
        place.address,
        place.latitude,
        place.longitude,
        place.tel,
        place.website,
        place.email,
        instagramUrl,
        facebookUrl,
        place.whatsapp_url || null,
        place.categories,
        aiResult.ai_summary,
        aiResult.openness_score,
        aiResult.pain_score,
        hasScores ? new Date() : null,
      ]
    );
    const cafeId = cafeRes.rows[0].id;

    if (hasScores) {
      await client.query(`DELETE FROM cafe_problems WHERE cafe_id = $1`, [cafeId]);
      for (const p of aiResult.problems || []) {
        await client.query(
          `INSERT INTO cafe_problems (cafe_id, category, description, confidence, source)
           VALUES ($1, $2, $3, $4, 'regional_pattern')`,
          [cafeId, p.category, p.description, p.confidence]
        );
      }
      analyzed += 1;
    } else {
      savedWithoutAi += 1;
    }

    savedCafes.push({
      id: cafeId,
      name: place.name,
      lat: place.latitude,
      lng: place.longitude,
      openness_score: aiResult.openness_score,
      pain_score: aiResult.pain_score,
    });
  }

  return {
    analyzed,
    savedWithoutAi,
    skipped: skippedNoContact,
    skippedNoContact,
    savedCafes,
  };
}

/**
 * Full one-city pipeline: upsert the region row, run discovery, save qualifying
 * cafés. Takes a pg client so callers control the transaction/connection
 * (a pooled route handler, or a script managing its own client lifecycle).
 */
async function scanCityIntoDb(client, { city, countryCode, limit }) {
  const cc = countryCode.toUpperCase();
  const regionRes = await client.query(
    `INSERT INTO regions (country_code, city, source)
     VALUES ($1, $2, 'city')
     ON CONFLICT (country_code, city) DO UPDATE SET city = EXCLUDED.city
     RETURNING id`,
    [cc, city]
  );
  const regionId = regionRes.rows[0].id;

  const places = await searchCafes(city, cc, limit);
  const { analyzed, savedWithoutAi, skipped, savedCafes } = await saveCafes(client, {
    regionId,
    countryCodeForAI: cc,
    places,
  });

  return { regionId, found: places.length, analyzed, savedWithoutAi, skipped, savedCafes };
}

module.exports = { saveCafes, scanCityIntoDb };
