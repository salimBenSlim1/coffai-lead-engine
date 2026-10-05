/**
 * Documented, regional-level operational pain patterns for cafes/coffee shops.
 * This is NOT specific to any single business — it's the market research layer.
 * Groq uses this as context to generate a *hypothesis* about a given cafe's likely
 * problems, since we no longer have per-cafe review text (that data isn't available
 * through any free, legal source).
 *
 * Keyed by ISO 3166-1 alpha-2 country code. Edit/expand freely as you do more research
 * per market — this file is the single place that encodes "what we know about this country".
 */
module.exports = {
  TN: {
    name: "Tunisia",
    patterns: [
      "Owners often don't know which menu items actually generate good margins.",
      "Rising input costs (coffee, dairy) squeeze margins without owners tracking it precisely.",
      "New fiscal transaction-recording requirements for cafes are being phased in, pushing owners toward digital record-keeping.",
      "Staffing and payroll/social-security costs are a recurring complaint.",
    ],
  },
  MA: {
    name: "Morocco",
    patterns: [
      "Many cafes, especially in tourist areas, still refuse card payments and operate cash-only.",
      "Younger customers increasingly expect digital payment options, creating friction with cash-only operations.",
      "Group bills, split payments, and reconciliation are commonly cited operational headaches.",
      "Unreliable internet in some areas complicates always-online POS systems.",
    ],
  },
  DZ: {
    name: "Algeria",
    patterns: [
      "Electronic payment adoption is accelerating quickly but is still new for many small businesses.",
      "Financial literacy and infrastructure gaps mean many cafes are only just starting to digitize.",
      "There's an opening for lightweight software that doesn't require replacing existing hardware.",
    ],
  },
  EG: {
    name: "Egypt",
    patterns: [
      "High inflation and import costs are pushing cafes to simplify menus and manage costs more tightly.",
      "Third-party delivery commissions (commonly 15-30%) eat into already-thin margins.",
      "New phone/tablet-based payment acceptance (SoftPOS) is rolling out, changing how small venues take payments.",
      "Owners increasingly want direct-ordering tools to reduce dependency on delivery marketplaces.",
    ],
  },
  LY: {
    name: "Libya",
    patterns: [
      "New government rules require many businesses to accept electronic payments, with penalties for non-compliance.",
      "POS terminal adoption is growing quickly, but payment/network infrastructure is still maturing and has had outages.",
      "Businesses forced into digital payments often lack software that ties payments to actual orders.",
    ],
  },
  JO: {
    name: "Jordan",
    patterns: [
      "The national instant-payment system is seeing rapid transaction growth, but restaurant software hasn't caught up.",
      "Common complaints: orders lost between kitchen and dining room, manual accounting, no real-time profit visibility.",
      "Delivery regulation is increasing, adding operational complexity for cafes using multiple delivery channels.",
    ],
  },
  QA: {
    name: "Qatar",
    patterns: [
      "The market is relatively mature — many venues already have POS, QR ordering, and delivery integrations.",
      "Common friction is in the delivery ecosystem itself: late deliveries, cold food, disputes with delivery partners.",
      "Differentiation for new software here needs a specific wedge, not a general 'we have a POS' pitch.",
    ],
  },
  SA: {
    name: "Saudi Arabia",
    patterns: [
      "Restaurant tech adoption is high and the market has several established POS/QSR software players.",
      "Openness to new software is high, but competition means a generic pitch won't stand out.",
    ],
  },
};
