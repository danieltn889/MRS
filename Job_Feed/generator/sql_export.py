"
sql_export.py
=============
Renders PostgreSQL-compatible INSERT statements from the generated
DataFrames, using the parsed real schema (schema_parser.TableSchema) to
decide per-column formatting: jsonb columns get a `::jsonb` cast, array
columns (text[]) get an `ARRAY[...]` literal, dates/timestamps/booleans/
numbers/uuids/strings are each quoted appropriately.

Note: the live database is PostgreSQL (confirmed from db_backup_*.sql and
the backend's `pg` driver config)   these scripts are Postgres syntax.
MySQL uses different array/jsonb handling entirely; ask if a MySQL variant
is actually needed for a different target system.
"

from __future__ import annotations

import json
import math
import re
from datetime import date, datetime
from typing import Dict

import pandas as pd

from .schema_parser import TableSchema

BATCH_SIZE = 500
_VARCHAR_LEN_RE = re.compile(r"character varying\((\d+)\)")


def _is_null(v) -> bool:
    if v is None:
        return True
    if isinstance(v, float) and math.isnan(v):
        return True
    try:
        return bool(pd.isna(v))
    except (TypeError, ValueError):
        return False


def _escape(s: str) -> str:
    return s.replace("'", "''")


def format_sql_value(value, data_type: str):
    if _is_null(value):
        return "NULL"

    dt = data_type.lower()

    if "jsonb" in dt or dt == "json":
        payload = value if isinstance(value, str) else json.dumps(value)
        return f"'{_escape(payload)}'::jsonb"

    if dt.endswith("[]"):
        items = value if isinstance(value, (list, tuple)) else []
        if not items:
            return "NULL"
        inner = ", ".join(f"'{_escape(str(i))}'" for i in items)
        return f"ARRAY[{inner}]::{dt}"

    if "boolean" in dt:
        return "TRUE" if bool(value) else "FALSE"

    if dt in ("integer", "bigint", "smallint"):
        return str(int(value))

    if dt.startswith("numeric") or dt in ("real", "double precision"):
        return str(float(value))

    if dt == "date":
        d = value.date() if isinstance(value, datetime) else value
        return f"'{d.isoformat()}'"

    if "timestamp" in dt:
        ts = value.isoformat() if isinstance(value, (datetime, date, pd.Timestamp)) else str(value)
        return f"'{ts}'"

    # uuid, character varying, text, citext, etc. A varchar(N) column truncates
    # to N   real source text (e.g. one candidate's Degree_Title ran to 548
    # chars against a varchar(255) column) would otherwise abort the whole
    # transaction with "value too long for type character varying(255)".
    text = str(value)
    len_m = _VARCHAR_LEN_RE.search(dt)
    if len_m:
        limit = int(len_m.group(1))
        if len(text) > limit:
            text = text[:limit]
    return f"'{_escape(text)}'"


# skill_id in these tables is resolved by NAME at import time via a subquery,
# not baked in as a literal id. Reason: the `skills` table's id defaults to
# uuid_generate_v4() (random) in schema.sql/seed.ts, so a pre-existing skill
# name (e.g. "leadership", seeded independently by every environment's own
# `npm run seed`) gets a DIFFERENT id per environment   a literal id baked in
# at generation time is only ever correct for the one environment it was
# generated against. Resolving by name at import time works everywhere.
NAME_RESOLVED_FK = {
    ("user_skills", "skill_id"): ("_skill_name", "skills", "name"),
    ("job_skills", "skill_id"): ("_skill_name", "skills", "name"),
}


def render_insert_statements(table_name: str, df: pd.DataFrame, schema: TableSchema) -> str:
    if df.empty:
        return f"-- {table_name}: no rows generated\n"

    cols = [c for c in df.columns if c in schema.columns and not c.startswith("_")]
    if not cols:
        return f"-- {table_name}: no matching schema columns\n"

    lines = [f"-- {table_name}: {len(df)} rows"]
    name_col_needed = [v[0] for k, v in NAME_RESOLVED_FK.items() if k[0] == table_name]
    records = df[cols + [c for c in name_col_needed if c in df.columns]].to_dict("records")
    col_list = ", ".join(f'"{c}"'for c in cols)

    for start in range(0, len(records), BATCH_SIZE):
        batch = records[start:start + BATCH_SIZE]
        value_rows = []
        for rec in batch:
            formatted = []
            for c in cols:
                fk = NAME_RESOLVED_FK.get((table_name, c))
                if fk:
                    name_col, ref_table, ref_col = fk
                    formatted.append(f"(SELECT id FROM {ref_table} WHERE {ref_col} = '{_escape(str(rec[name_col]))}')")
                else:
                    formatted.append(format_sql_value(rec[c], schema.columns[c].data_type))
            value_rows.append(f"({', '.join(formatted)})")
        lines.append(f'INSERT INTO "{table_name}" ({col_list}) VALUES\n'+ ",\n".join(value_rows) +
                     "\nON CONFLICT DO NOTHING;")

    return "\n".join(lines) + "\n"


# Insertion order respects foreign key dependencies (parents before children).
TABLE_ORDER = [
    "users", "candidate_profiles", "education", "work_experience",
    "certifications", "skills", "user_skills", "companies", "jobs",
    "job_skills", "job_status_history", "applications", "job_views",
    "saved_jobs", "ignored_jobs", "job_searches", "feed_scores",
]


def render_full_sql(tables: Dict[str, pd.DataFrame], schemas: Dict[str, TableSchema]) -> str:
    parts = [
        "-- Auto-generated by Job_Feed/generator   demo dataset built from real",
        "-- CSV data + the production schema (db_backup_20260705_182104.sql).",
        "-- Safe to re-run: every INSERT uses ON CONFLICT DO NOTHING.",
        "BEGIN;",
        ,
    ]
    for name in TABLE_ORDER:
        df = tables.get(name)
        schema = schemas.get(name)
        if df is None or schema is None:
            continue
        parts.append(render_insert_statements(name, df, schema))
    parts.append("COMMIT;")
    return "\n".join(parts)
