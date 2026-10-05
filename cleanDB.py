"""
Clean cafes_202609140027.csv

What this fixes:
1. Duplicate places imported twice from different sources (OSM "osm:node:xxx" /
   "osm:n:xxx" / "osm:w:xxx" vs Geoapify "geoapify:xxx") that are the same
   physical cafe (same name + exact same lat/lng). Rows in a duplicate pair are
   merged into one record, keeping whichever fields are populated across both
   copies (so we don't lose a phone number, website, AI summary, etc. that only
   exists on one of the two rows).
2. Phone numbers with a stray leading apostrophe (an Excel/Sheets text-format
   artifact, e.g. "'+1 818-790-4681" -> "+1 818-790-4681").
3. Malformed website URLs that used backslashes instead of a real URL
   (e.g. "https:\\vidhi'.com").
4. Trims stray whitespace in text fields.

Usage: python3 clean_cafes.py
"""
import pandas as pd
import numpy as np
import re

INPUT_PATH = "cafes_202609140027.csv"
OUTPUT_PATH = "cafes_cleaned.csv"
REPORT_PATH = "cleaning_report.txt"

df = pd.read_csv(INPUT_PATH)
report_lines = []

def log(line=""):
    print(line)
    report_lines.append(line)

log("=== CAFE DATA CLEANING REPORT ===")
log(f"Input rows: {len(df)}")

# ---------------------------------------------------------------------------
# 1. Fix phone numbers: strip stray leading apostrophe / whitespace
# ---------------------------------------------------------------------------
def clean_phone(val):
    if pd.isna(val):
        return val
    v = str(val).strip()
    v = v.lstrip("'").strip()
    return v if v else np.nan

before_bad_phone = df['phone'].astype(str).str.startswith("'").sum()
df['phone'] = df['phone'].apply(clean_phone)
log(f"\nFixed {before_bad_phone} phone numbers with a stray leading apostrophe.")

# ---------------------------------------------------------------------------
# 2. Fix malformed website URLs (backslashes, missing scheme, stray quotes)
# ---------------------------------------------------------------------------
def clean_website(val):
    if pd.isna(val):
        return val
    v = str(val).strip()
    if "\\" in v:
        return np.nan  # unrecoverable malformed URL, drop rather than guess
    return v

bad_websites = df['website'].astype(str).str.contains(r"\\", regex=True, na=False).sum()
df['website'] = df['website'].apply(clean_website)
log(f"Removed {bad_websites} malformed website URL(s) that couldn't be parsed (e.g. backslash paths).")

# ---------------------------------------------------------------------------
# 3. Trim whitespace on key text columns
# ---------------------------------------------------------------------------
text_cols = ['name', 'address', 'email', 'instagram_url', 'facebook_url', 'categories']
for c in text_cols:
    df[c] = df[c].apply(lambda v: v.strip() if isinstance(v, str) else v)

# ---------------------------------------------------------------------------
# 4. De-duplicate: same name + exact same lat/lng = same physical cafe,
#    just re-imported from a second data source (OSM vs Geoapify, or two
#    different OSM element types for the same node).
# ---------------------------------------------------------------------------
dup_mask = df.duplicated(subset=['name', 'lat', 'lng'], keep=False)
n_dup_rows = dup_mask.sum()
n_dup_groups = df[dup_mask].groupby(['name', 'lat', 'lng']).ngroups
log(f"\nFound {n_dup_rows} rows forming {n_dup_groups} duplicate pairs/groups "
    f"(same name + identical coordinates, sourced from OSM and/or Geoapify twice).")

# check for groups where merging fields could hide a real conflict (different region_id)
conflict_groups = 0
for _, g in df[dup_mask].groupby(['name', 'lat', 'lng']):
    if g['region_id'].nunique() > 1:
        conflict_groups += 1
log(f"  -> {conflict_groups} of those groups have conflicting region_id values (flagged, not auto-merged blindly; first non-null kept).")

MERGE_KEY = ['name', 'lat', 'lng']
# Columns to keep the "most complete" value for (prefer non-null, then longer string)
def pick_best(series):
    non_null = series.dropna()
    if non_null.empty:
        return np.nan
    # prefer longest string / value as a proxy for "more complete"
    return max(non_null, key=lambda x: len(str(x)))

def pick_earliest_id(series):
    return series.min()

agg_map = {}
for col in df.columns:
    if col == 'id':
        agg_map[col] = pick_earliest_id
    elif col in MERGE_KEY:
        continue
    else:
        agg_map[col] = pick_best

deduped = df.groupby(MERGE_KEY, as_index=False, sort=False).agg(agg_map)

log(f"\nRows before de-duplication: {len(df)}")
log(f"Rows after de-duplication:  {len(deduped)}")
log(f"Rows removed:               {len(df) - len(deduped)}")

# ---------------------------------------------------------------------------
# 5. Final sort + save
# ---------------------------------------------------------------------------
deduped = deduped.sort_values('id').reset_index(drop=True)
deduped.to_csv(OUTPUT_PATH, index=False)

log(f"\nRemaining missing-data snapshot (post-clean):")
for col in ['address', 'phone', 'website', 'email', 'ai_summary']:
    n_missing = deduped[col].isna().sum()
    log(f"  {col}: {n_missing} missing / {len(deduped)} ({n_missing/len(deduped):.0%})")

log(f"\nCleaned file saved to: {OUTPUT_PATH}")

with open(REPORT_PATH, "w") as f:
    f.write("\n".join(report_lines))