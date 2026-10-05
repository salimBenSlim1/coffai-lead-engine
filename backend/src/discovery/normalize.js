function cleanString(value) {
  if (value === null || value === undefined) return null;
  const result = String(value).trim();
  return result || null;
}

// Diacritics-insensitive, punctuation-stripped lowercase text — used only for
// fuzzy name comparison during dedup, never for display.
function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePhone(phone) {
  if (!phone) return null;
  const normalized = String(phone).replace(/[^\d+]/g, "");
  return normalized || null;
}

// Reduces any website value down to a bare hostname (no protocol, no "www.", no
// path) so "https://www.example.com/menu" and "example.com" compare as equal.
function normalizeWebsite(website) {
  if (!website) return null;
  let value = String(website).trim();
  if (!value) return null;
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;

  try {
    return new URL(value).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return value.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0].toLowerCase();
  }
}

function normalizeSocial(value) {
  if (!value) return null;
  return String(value).trim();
}

module.exports = { cleanString, normalizeText, normalizePhone, normalizeWebsite, normalizeSocial };
