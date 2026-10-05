const axios = require("axios");
const cheerio = require("cheerio");

/**
 * We do NOT scrape Instagram/Facebook/TikTok directly — those platforms
 * actively block automated access and it violates their Terms of Service.
 * Instead, we fetch the cafe's OWN public website (if Google Places gave us one)
 * and pull any social links the owner has already published there.
 * This is the safe, low-risk way to get a contact handle for manual outreach.
 */
async function extractSocialLinks(websiteUrl) {
  const result = { instagram_url: null, facebook_url: null, whatsapp_url: null };
  if (!websiteUrl) return result;

  try {
    const res = await axios.get(websiteUrl, {
      timeout: 8000,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; CoffAIResearchBot/1.0)" },
    });
    const $ = cheerio.load(res.data);

    $("a[href]").each((_, el) => {
      const href = $(el).attr("href") || "";
      if (!result.instagram_url && href.includes("instagram.com")) {
        result.instagram_url = href;
      }
      if (!result.facebook_url && href.includes("facebook.com")) {
        result.facebook_url = href;
      }
      if (!result.whatsapp_url && href.includes("wa.me")) {
        result.whatsapp_url = href;
      }
    });
  } catch (err) {
    // Site down, blocked, or slow — non-fatal, we just skip enrichment.
    console.warn(`Could not fetch website ${websiteUrl}: ${err.message}`);
  }

  return result;
}

module.exports = { extractSocialLinks };
