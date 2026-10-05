"""
Push cafes_cleaned.csv into the Postgres `cafes` table.

Assumes:
- A table named `cafes` with `id` as the primary key, and column names
  matching the CSV header exactly (id, region_id, fsq_place_id, name, address,
  lat, lng, phone, website, email, instagram_url, facebook_url, categories,
  ai_summary, openness_score, pain_score, last_analyzed_at, created_at,
  updated_at, contacted_at, whatsapp_url).
  --> Check this against your schema.sql and adjust TABLE_NAME / COLUMNS below
      if it differs.
- DATABASE_URL env var set to your Postgres connection string.
- The original (pre-clean) CSV is still available so we can figure out which
  ids were merged away during dedup.

Usage:
    pip install psycopg2-binary
    export DATABASE_URL="postgresql://user:pass@host:5432/dbname"
    python3 update_db.py --dry-run      # see what would happen, no writes
    python3 update_db.py                # actually apply it
"""
import argparse
import os
import sys
import pandas as pd
import psycopg2
from psycopg2.extras import execute_values

TABLE_NAME = "cafes"
ORIGINAL_CSV = "cafes_202609140027.csv"
CLEANED_CSV = "cafes_cleaned.csv"

COLUMNS = [
    "id", "region_id", "fsq_place_id", "name", "address", "lat", "lng",
    "phone", "website", "email", "instagram_url", "facebook_url",
    "categories", "ai_summary", "openness_score", "pain_score",
    "last_analyzed_at", "created_at", "updated_at", "contacted_at",
    "whatsapp_url",
]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true",
                         help="Print what would happen without touching the DB")
    args = parser.parse_args()

    cleaned = pd.read_csv(CLEANED_CSV)
    cleaned_ids = set(cleaned["id"])

    db_url = "postgresql://postgres:@:5432/coffai_leads"
    if not db_url:
        sys.exit("DATABASE_URL env var is not set.")

    conn = psycopg2.connect(db_url)
    try:
        with conn.cursor() as cur:
            # Diff against what's ACTUALLY in the live table right now, not
            # a local "original" CSV (which may be stale/overwritten). This
            # is what actually determines which duplicate rows to remove.
            cur.execute(f"SELECT id FROM {TABLE_NAME}")
            db_ids = {row[0] for row in cur.fetchall()}

        removed_ids = sorted(db_ids - cleaned_ids)

        print(f"Rows currently in DB: {len(db_ids)}")
        print(f"Cleaned rows:         {len(cleaned)}")
        print(f"Ids to delete (in DB but not in cleaned CSV): {len(removed_ids)}")
        if removed_ids:
            print(f"  sample: {removed_ids[:10]}")
        print(f"Ids to upsert: {len(cleaned_ids)}")

        if args.dry_run:
            print("\n--dry-run set: no database changes made.")
            return

        with conn:  # commits on success, rolls back on exception
            with conn.cursor() as cur:
                # 1. Delete the duplicate rows that got merged away.
                #    NOTE: if another table has a foreign key to cafes(id),
                #    this will fail unless you've repointed those references
                #    first (or the FK is ON DELETE CASCADE, which you should
                #    confirm you actually want).
                if removed_ids:
                    cur.execute(
                        f"DELETE FROM {TABLE_NAME} WHERE id = ANY(%s)",
                        (removed_ids,),
                    )
                    print(f"Deleted {cur.rowcount} rows.")

                # 2. Upsert every row from the cleaned CSV.
                # .astype(object) first is required: on an all-empty column
                # (e.g. contacted_at, which is 100% missing) pandas silently
                # turns None back into NaN to keep the column numeric unless
                # it's already object dtype. Without this, psycopg2 sends a
                # literal float NaN into a timestamp column and Postgres
                # rejects it.
                cleaned_for_db = cleaned[COLUMNS].astype(object).where(pd.notnull(cleaned[COLUMNS]), None)
                rows = [tuple(r) for r in cleaned_for_db.itertuples(index=False, name=None)]

                update_cols = [c for c in COLUMNS if c != "id"]
                set_clause = ", ".join(f"{c} = EXCLUDED.{c}" for c in update_cols)
                col_list = ", ".join(COLUMNS)

                query = f"""
                    INSERT INTO {TABLE_NAME} ({col_list})
                    VALUES %s
                    ON CONFLICT (id) DO UPDATE SET {set_clause}
                """
                execute_values(cur, query, rows)
                print(f"Upserted {len(rows)} rows.")
    finally:
        conn.close()

    print("\nDone.")


if __name__ == "__main__":
    main()