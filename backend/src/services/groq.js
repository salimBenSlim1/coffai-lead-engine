const axios = require("axios");
const regionalPainPatterns = require("../data/regionalPainPatterns");

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

/**
 * Groq's free tier for openai/gpt-oss-120b is 30 requests/minute AND 1,000
 * requests/day — both hard caps (https://console.groq.com/docs/rate-limits).
 * Every call in this file funnels through callGroq() below, which:
 *   1. Enforces a minimum gap between requests so we never exceed 30/min
 *      (2100ms gives ~28.5 RPM — a small safety margin under the wall).
 *   2. On a 429, reads the `retry-after` header Groq actually sends and
 *      waits that long before retrying, instead of failing immediately.
 *   3. If retry-after is suspiciously large (a few minutes+), that's the
 *      DAILY cap, not the per-minute one — no amount of waiting-and-retrying
 *      inside one process run fixes that, so it throws a distinct
 *      GroqDailyLimitError the caller can check for and stop the whole run
 *      cleanly instead of burning through remaining cafes on doomed retries.
 */
class GroqDailyLimitError extends Error {}

// Set once we've actually hit the daily cap, so callers (cafePipeline) can
// check this BEFORE making a call and skip it entirely, instead of every
// remaining cafe individually waiting through the throttle just to fail.
// Resets naturally when the process restarts (e.g. tomorrow's cron/run).
let dailyLimitReachedAt = null;
function isGroqDailyLimitReached() {
  return dailyLimitReachedAt !== null;
}

const MIN_DELAY_MS = parseInt(process.env.GROQ_MIN_DELAY_MS || "2100", 10);
const MAX_RETRIES = 3;
let queue = Promise.resolve();
let lastCallAt = 0;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function throttle() {
  const wait = Math.max(0, MIN_DELAY_MS - (Date.now() - lastCallAt));
  if (wait > 0) await sleep(wait);
  lastCallAt = Date.now();
}

async function callGroq(payload) {
  // Chain every call through one shared queue so analyzeCafe and
  // draftOutreachMessage — called from routes, cafePipeline, and the
  // standalone fill script — all share the same 30/min budget instead of
  // each racing the limit independently.
  const result = queue.then(async () => {
    await throttle();

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await axios.post(GROQ_URL, payload, {
          headers: {
            Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
            "Content-Type": "application/json",
          },
        });
        return res;
      } catch (err) {
        const status = err.response?.status;
        if (status !== 429 || attempt === MAX_RETRIES) throw err;

        const retryAfterSec = parseFloat(err.response.headers?.["retry-after"]);
        const waitMs = Number.isFinite(retryAfterSec) ? retryAfterSec * 1000 : 5000 * (attempt + 1);

        if (waitMs > 3 * 60 * 1000) {
          // A multi-minute retry-after on a 30-RPM model means the DAILY
          // cap is what's blocking us, not the per-minute one — stop here.
          dailyLimitReachedAt = Date.now();
          throw new GroqDailyLimitError(
            `Groq daily request limit reached (retry-after ${Math.round(waitMs / 1000)}s). ` +
              `Free tier is capped at 1,000 requests/day regardless of pacing — resume tomorrow, ` +
              `or upgrade at console.groq.com if you need to process faster.`
          );
        }

        console.warn(`Groq 429 — retrying in ${Math.round(waitMs / 1000)}s (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await sleep(waitMs);
        lastCallAt = Date.now();
      }
    }
  });

  // Keep the queue alive even if this call ultimately throws, so the next
  // queued call still runs instead of the whole chain jamming on one error.
  queue = result.catch(() => {});
  return result;
}

const PROBLEM_CATEGORIES = [
  "owner_visibility",       // "I don't know what's happening when I'm not there"
  "staff_comm",             // orders lost/delayed between waiter and kitchen
  "payment_fragmentation",  // cash/card/wallet/delivery mismatch
  "profit_visibility",      // knows revenue but not real margins
  "delivery_dependence",    // platform owns the customer, takes a cut
  "inventory_waste",        // stock/money disappearing
  "expensive_pos",          // wants software but not a big POS install
];

/**
 * We deliberately do NOT have this cafe's reviews or menu (no free, legal source for
 * that exists). So instead of pretending to analyze evidence we don't have, Groq is
 * asked to generate a labeled HYPOTHESIS: given documented regional pain patterns for
 * this country, and the handful of real signals we do have from the business listing
 * itself (does it have a website, social handles, how specific its category is), which
 * problems plausibly apply here, and how confident should that guess be.
 */
function buildPrompt(cafe, countryCode) {
  const region = regionalPainPatterns[countryCode?.toUpperCase()];
  const regionName = region?.name || countryCode || "unknown region";
  const regionPatterns = (region?.patterns || [])
    .map((p) => `- ${p}`)
    .join("\n") || "(no documented patterns for this country yet — rely only on listing signals)";

  const listingSignals = [
    `Has its own website: ${cafe.website ? "yes" : "no"}`,
    `Has Instagram listed: ${cafe.instagram ? "yes" : "no"}`,
    `Has Facebook listed: ${cafe.facebook_id ? "yes" : "no"}`,
    `Category label(s): ${cafe.categories || "unknown"}`,
  ].join("\n");

  return `You are helping prioritize B2B outreach for a cafe management SaaS (owner dashboard,
waiter/barman order flow, live customer order tracking).

You do NOT have this specific cafe's reviews, menu, or any customer feedback. You only have:
1. Documented regional pain patterns for ${regionName} (from independent market research):
${regionPatterns}

2. A few real signals from this cafe's public business listing:
Name: ${cafe.name}
${listingSignals}

Task:
Generate a HYPOTHESIS, not a claim of fact. Pick 2-4 of the following category keys that plausibly
apply, using ONLY the regional patterns above as your evidence (do not invent cafe-specific facts):
${PROBLEM_CATEGORIES.join(", ")}

For each, write one short sentence phrased as a regional pattern applied to this type of business
(e.g. "Cafes like this in the area often ..."), NOT as if you know it's true of this specific cafe.
Set "confidence" low (0.2-0.4) since this is pattern-matching, not direct evidence.

Also estimate:
- "openness_score" (1-5): based only on listing signals (a cafe with no website/socials at all may be
  either very traditional/low-openness, OR just under-digitized and ripe for a first tool — use judgment
  and note which case you think it is in ai_summary).
- "pain_score" (1-5): based on how severe the regional patterns you selected tend to be.
- "ai_summary": 1-2 plain-language sentences.

Respond with ONLY valid JSON, no markdown fences, no commentary:
{
  "problems": [
    {"category": "payment_fragmentation", "description": "...", "confidence": 0.3}
  ],
  "openness_score": 3,
  "pain_score": 3,
  "ai_summary": "..."
}`;
}

async function analyzeCafe(cafe, countryCode) {
  const prompt = buildPrompt(cafe, countryCode);

  const res = await callGroq({
    model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3,
    response_format: { type: "json_object" },
  });

  const raw = res.data.choices[0].message.content;
  return JSON.parse(raw);
}

/**
 * Turns stored (hypothesized) problems into a short outreach message draft.
 * The user copies this and sends it manually via Instagram/WhatsApp/etc —
 * this tool never sends messages itself, and the draft is written to sound
 * like a general observation, not "I read your reviews."
 */
async function draftOutreachMessage(cafeName, problems, language = "English") {
  const problemsText = problems.map((p) => `- ${p.description}`).join("\n");

  const prompt = `Write a short, warm, non-salesy outreach message (max 60 words, in ${language}) to the owner
of a cafe called "${cafeName}", to be sent manually via Instagram DM or WhatsApp.
The sender runs CoffAI, a cafe management system (owner dashboard, waiter/barman workflow, live order tracking for customers).
Reference ONE of these general regional observations naturally, phrased as something the sender has
noticed across cafes in the area — NOT as a specific claim about this cafe's own reviews or performance:
${problemsText}
Do not use generic SaaS pitch language like "revolutionize" or "streamline your business".
End with a soft, open question, not a hard sell. Return plain text only, no quotes.`;

  const res = await callGroq({
    model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.6,
  });

  return res.data.choices[0].message.content.trim();
}

module.exports = { analyzeCafe, draftOutreachMessage, PROBLEM_CATEGORIES, GroqDailyLimitError, isGroqDailyLimitReached };
