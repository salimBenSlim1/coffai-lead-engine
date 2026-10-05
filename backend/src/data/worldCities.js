/**
 * A curated spread of cities across every major world region, used by the
 * "scan the world" button and the standalone fill script (scripts/fillDatabase.js).
 *
 * ORDER MATTERS: fillDatabase.js processes this array top-to-bottom, and Groq's
 * free tier only allows 1,000 analyses/day. Whatever city is earliest in this
 * list gets today's budget first. TARGET_MARKETS below (your actual researched
 * expansion countries — Tunisia, Morocco, Algeria, Egypt, Libya, Jordan, Qatar,
 * Saudi Arabia) are placed FIRST for exactly this reason. Everything else is
 * genuine overflow — useful once target markets are saturated, not before.
 *
 * NOTE: Libya was previously missing from this list entirely, despite being
 * ranked the #1 opportunity in the original market research (forced/rapid
 * electronic-payment transition, low competition). Added 8 Libyan cities below.
 *
 * Target markets now cover ~74 cities across all 8 researched countries
 * (secondary/tertiary cities included, not just capitals), so a full pass
 * concentrates real volume where it matters instead of a token 1-3 cities
 * per country.
 *
 * ~100 cities x a few hundred candidate cafés each x roughly a 7% contact-info
 * survival rate (confirmed from a real run, not the earlier 20% guess) lands
 * in the low thousands of saved leads for a full pass — the ceiling is set by
 * how much of the world's café data has a phone/website/social attached, not
 * by how many cities you add.
 *
 * countryCode is ISO 3166-1 alpha-2. Feel free to trim or extend this list —
 * it's just plain data, no code changes needed elsewhere.
 */
module.exports = [
  // ============================================================
  // TARGET MARKETS — your actual researched expansion countries.
  // Runs first, every time, on purpose.
  // ============================================================

  // Tunisia
  { city: "Tunis", countryCode: "TN" },
  { city: "Sfax", countryCode: "TN" },
  { city: "Sousse", countryCode: "TN" },
  { city: "Kairouan", countryCode: "TN" },
  { city: "Bizerte", countryCode: "TN" },
  { city: "Gabes", countryCode: "TN" },
  { city: "Monastir", countryCode: "TN" },
  { city: "Nabeul", countryCode: "TN" },
  { city: "Gafsa", countryCode: "TN" },
  { city: "Houmt Souk", countryCode: "TN" }, // Djerba
  { city: "Mahdia", countryCode: "TN" },
  { city: "Ariana", countryCode: "TN" },

  // Morocco
  { city: "Casablanca", countryCode: "MA" },
  { city: "Marrakech", countryCode: "MA" },
  { city: "Rabat", countryCode: "MA" },
  { city: "Fes", countryCode: "MA" },
  { city: "Tangier", countryCode: "MA" },
  { city: "Agadir", countryCode: "MA" },
  { city: "Meknes", countryCode: "MA" },
  { city: "Oujda", countryCode: "MA" },
  { city: "Kenitra", countryCode: "MA" },
  { city: "Tetouan", countryCode: "MA" },
  { city: "El Jadida", countryCode: "MA" },
  { city: "Essaouira", countryCode: "MA" },
  { city: "Nador", countryCode: "MA" },
  { city: "Beni Mellal", countryCode: "MA" },

  // Algeria
  { city: "Algiers", countryCode: "DZ" },
  { city: "Oran", countryCode: "DZ" },
  { city: "Constantine", countryCode: "DZ" },
  { city: "Annaba", countryCode: "DZ" },
  { city: "Blida", countryCode: "DZ" },
  { city: "Batna", countryCode: "DZ" },
  { city: "Setif", countryCode: "DZ" },
  { city: "Tlemcen", countryCode: "DZ" },
  { city: "Bejaia", countryCode: "DZ" },
  { city: "Sidi Bel Abbes", countryCode: "DZ" },
  { city: "Biskra", countryCode: "DZ" },

  // Libya — was completely missing before; #1-ranked market in the original research
  { city: "Tripoli", countryCode: "LY" },
  { city: "Benghazi", countryCode: "LY" },
  { city: "Misrata", countryCode: "LY" },
  { city: "Zawiya", countryCode: "LY" },
  { city: "Sabha", countryCode: "LY" },
  { city: "Zliten", countryCode: "LY" },
  { city: "Ajdabiya", countryCode: "LY" },
  { city: "Tobruk", countryCode: "LY" },

  // Jordan
  { city: "Amman", countryCode: "JO" },
  { city: "Zarqa", countryCode: "JO" },
  { city: "Irbid", countryCode: "JO" },
  { city: "Aqaba", countryCode: "JO" },
  { city: "Salt", countryCode: "JO" },
  { city: "Madaba", countryCode: "JO" },
  { city: "Karak", countryCode: "JO" },

  // Egypt
  { city: "Cairo", countryCode: "EG" },
  { city: "Alexandria", countryCode: "EG" },
  { city: "Giza", countryCode: "EG" },
  { city: "Luxor", countryCode: "EG" },
  { city: "Aswan", countryCode: "EG" },
  { city: "Mansoura", countryCode: "EG" },
  { city: "Port Said", countryCode: "EG" },
  { city: "Suez", countryCode: "EG" },
  { city: "Tanta", countryCode: "EG" },
  { city: "Ismailia", countryCode: "EG" },
  { city: "Faiyum", countryCode: "EG" },

  // Qatar (small country — fewer distinct urban centers, but these are real ones)
  { city: "Doha", countryCode: "QA" },
  { city: "Al Rayyan", countryCode: "QA" },
  { city: "Al Wakrah", countryCode: "QA" },
  { city: "Al Khor", countryCode: "QA" },

  // Saudi Arabia
  { city: "Riyadh", countryCode: "SA" },
  { city: "Jeddah", countryCode: "SA" },
  { city: "Dammam", countryCode: "SA" },
  { city: "Mecca", countryCode: "SA" },
  { city: "Medina", countryCode: "SA" },
  { city: "Khobar", countryCode: "SA" },
  { city: "Abha", countryCode: "SA" },
  { city: "Tabuk", countryCode: "SA" },
  { city: "Buraidah", countryCode: "SA" },

  // ============================================================
  // OVERFLOW — everything below is outside the original research.
  // Useful once target markets above are well covered, not before.
  // ============================================================

  // Wider Middle East (adjacent, not originally ranked, but plausibly relevant)
  { city: "Dubai", countryCode: "AE" },
  { city: "Abu Dhabi", countryCode: "AE" },
  { city: "Beirut", countryCode: "LB" },
  { city: "Kuwait City", countryCode: "KW" },
  { city: "Muscat", countryCode: "OM" },
  { city: "Manama", countryCode: "BH" },

  // North America
  { city: "New York", countryCode: "US" },
  { city: "Los Angeles", countryCode: "US" },
  { city: "Chicago", countryCode: "US" },
  { city: "San Francisco", countryCode: "US" },
  { city: "Miami", countryCode: "US" },
  { city: "Seattle", countryCode: "US" },
  { city: "Austin", countryCode: "US" },
  { city: "Toronto", countryCode: "CA" },
  { city: "Vancouver", countryCode: "CA" },
  { city: "Montreal", countryCode: "CA" },
  { city: "Mexico City", countryCode: "MX" },
  { city: "Guadalajara", countryCode: "MX" },

  // Central America & Caribbean
  { city: "San Jose", countryCode: "CR" },
  { city: "Panama City", countryCode: "PA" },
  { city: "Havana", countryCode: "CU" },
  { city: "Santo Domingo", countryCode: "DO" },

  // South America
  { city: "Sao Paulo", countryCode: "BR" },
  { city: "Rio de Janeiro", countryCode: "BR" },
  { city: "Buenos Aires", countryCode: "AR" },
  { city: "Bogota", countryCode: "CO" },
  { city: "Medellin", countryCode: "CO" },
  { city: "Lima", countryCode: "PE" },
  { city: "Santiago", countryCode: "CL" },
  { city: "Quito", countryCode: "EC" },
  { city: "Montevideo", countryCode: "UY" },

  // Western & Northern Europe
  { city: "London", countryCode: "GB" },
  { city: "Manchester", countryCode: "GB" },
  { city: "Dublin", countryCode: "IE" },
  { city: "Paris", countryCode: "FR" },
  { city: "Lyon", countryCode: "FR" },
  { city: "Berlin", countryCode: "DE" },
  { city: "Munich", countryCode: "DE" },
  { city: "Hamburg", countryCode: "DE" },
  { city: "Amsterdam", countryCode: "NL" },
  { city: "Rotterdam", countryCode: "NL" },
  { city: "Brussels", countryCode: "BE" },
  { city: "Copenhagen", countryCode: "DK" },
  { city: "Stockholm", countryCode: "SE" },
  { city: "Oslo", countryCode: "NO" },
  { city: "Helsinki", countryCode: "FI" },

  // Southern Europe
  { city: "Madrid", countryCode: "ES" },
  { city: "Barcelona", countryCode: "ES" },
  { city: "Valencia", countryCode: "ES" },
  { city: "Rome", countryCode: "IT" },
  { city: "Milan", countryCode: "IT" },
  { city: "Naples", countryCode: "IT" },
  { city: "Lisbon", countryCode: "PT" },
  { city: "Porto", countryCode: "PT" },
  { city: "Athens", countryCode: "GR" },

  // Central & Eastern Europe
  { city: "Vienna", countryCode: "AT" },
  { city: "Zurich", countryCode: "CH" },
  { city: "Warsaw", countryCode: "PL" },
  { city: "Krakow", countryCode: "PL" },
  { city: "Prague", countryCode: "CZ" },
  { city: "Budapest", countryCode: "HU" },
  { city: "Bucharest", countryCode: "RO" },
  { city: "Sofia", countryCode: "BG" },
  { city: "Istanbul", countryCode: "TR" },
  { city: "Izmir", countryCode: "TR" },

  // Sub-Saharan Africa
  { city: "Lagos", countryCode: "NG" },
  { city: "Abuja", countryCode: "NG" },
  { city: "Nairobi", countryCode: "KE" },
  { city: "Johannesburg", countryCode: "ZA" },
  { city: "Cape Town", countryCode: "ZA" },
  { city: "Accra", countryCode: "GH" },
  { city: "Addis Ababa", countryCode: "ET" },
  { city: "Dar es Salaam", countryCode: "TZ" },
  { city: "Kigali", countryCode: "RW" },

  // South & Central Asia
  { city: "Mumbai", countryCode: "IN" },
  { city: "Delhi", countryCode: "IN" },
  { city: "Bangalore", countryCode: "IN" },
  { city: "Karachi", countryCode: "PK" },
  { city: "Lahore", countryCode: "PK" },
  { city: "Dhaka", countryCode: "BD" },
  { city: "Tashkent", countryCode: "UZ" },

  // East & Southeast Asia
  { city: "Tokyo", countryCode: "JP" },
  { city: "Osaka", countryCode: "JP" },
  { city: "Seoul", countryCode: "KR" },
  { city: "Busan", countryCode: "KR" },
  { city: "Shanghai", countryCode: "CN" },
  { city: "Beijing", countryCode: "CN" },
  { city: "Hong Kong", countryCode: "HK" },
  { city: "Taipei", countryCode: "TW" },
  { city: "Bangkok", countryCode: "TH" },
  { city: "Chiang Mai", countryCode: "TH" },
  { city: "Singapore", countryCode: "SG" },
  { city: "Kuala Lumpur", countryCode: "MY" },
  { city: "Jakarta", countryCode: "ID" },
  { city: "Bali", countryCode: "ID" },
  { city: "Manila", countryCode: "PH" },
  { city: "Ho Chi Minh City", countryCode: "VN" },
  { city: "Hanoi", countryCode: "VN" },

  // Oceania
  { city: "Sydney", countryCode: "AU" },
  { city: "Melbourne", countryCode: "AU" },
  { city: "Brisbane", countryCode: "AU" },
  { city: "Auckland", countryCode: "NZ" },
];
