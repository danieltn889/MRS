"
validators.py
==============
Step 12: validates the fully-assembled dataset against the REAL parsed
schema (schema_parser.TableSchema)   foreign keys, primary/unique key
uniqueness, NOT NULL columns, CHECK-constraint enum values, and date
sanity (applications/views inside their job's active window, education/
job date ordering). Returns a list of human-readable issues; an empty
list means the dataset is clean.
"

from __future__ import annotations

import re
from typing import Dict, List

import pandas as pd

from .schema_parser import TableSchema

_VARCHAR_LEN_RE = re.compile(r"character varying\((\d+)\)")


def _check_varchar_lengths(name: str, df: pd.DataFrame, schema: TableSchema, issues: List[str]) -> None:
    if df.empty:
        return
    for col in schema.columns.values():
        if col.name not in df.columns:
            continue
        len_m = _VARCHAR_LEN_RE.search(col.data_type)
        if not len_m:
            continue
        limit = int(len_m.group(1))
        lengths = df[col.name].dropna().astype(str).str.len()
        over = (lengths > limit).sum()
        if over:
            issues.append(f"[{name}] column '{col.name}'(varchar({limit})) has {over} value(s) "
                           f"exceeding the limit (max length {lengths.max()})   will be truncated on export")


def _check_required_columns(name: str, df: pd.DataFrame, schema: TableSchema, issues: List[str]) -> None:
    if df.empty:
        return
    for col in schema.required_columns:
        if col not in df.columns:
            issues.append(f"[{name}] required column '{col}'missing from generated table")
            continue
        n_null = df[col].isna().sum()
        if n_null:
            issues.append(f"[{name}] required column '{col}'has {n_null} null value(s)")


def _check_enum(name: str, df: pd.DataFrame, schema: TableSchema, issues: List[str]) -> None:
    if df.empty:
        return
    for col in schema.columns.values():
        if not col.enum_values or col.name not in df.columns:
            continue
        bad = set(df[col.name].dropna().unique()) - set(col.enum_values)
        if bad:
            issues.append(f"[{name}] column '{col.name}'has values outside CHECK enum {col.enum_values}: {bad}")


def _check_pk_unique(name: str, df: pd.DataFrame, schema: TableSchema, issues: List[str]) -> None:
    if df.empty or not schema.primary_key:
        return
    cols = [c for c in schema.primary_key if c in df.columns]
    if len(cols) != len(schema.primary_key):
        return
    dupes = df.duplicated(subset=cols).sum()
    if dupes:
        issues.append(f"[{name}] {dupes} duplicate primary key row(s) on {cols}")


def _check_unique_constraints(name: str, df: pd.DataFrame, schema: TableSchema, issues: List[str]) -> None:
    if df.empty:
        return
    for cols in schema.unique_constraints:
        present = [c for c in cols if c in df.columns]
        if len(present) != len(cols):
            continue
        dupes = df.duplicated(subset=present).sum()
        if dupes:
            issues.append(f"[{name}] {dupes} duplicate UNIQUE row(s) on {present}")


def _check_foreign_keys(name: str, df: pd.DataFrame, schema: TableSchema,
                         tables: Dict[str, pd.DataFrame], issues: List[str]) -> None:
    if df.empty:
        return
    for fk in schema.foreign_keys:
        if len(fk.columns) != 1:
            continue  # only single-column FKs occur in this project's tables
        col = fk.columns[0]
        if col not in df.columns:
            continue
        values = df[col].dropna()
        if values.empty:
            continue
        ref_df = tables.get(fk.ref_table)
        if ref_df is None or ref_df.empty:
            issues.append(f"[{name}] FK '{col}'-> {fk.ref_table} but referenced table is empty/missing")
            continue
        ref_col = fk.ref_columns[0]
        ref_values = set(ref_df[ref_col].dropna())
        orphans = set(values) - ref_values
        if orphans:
            issues.append(f"[{name}] {len(orphans)} orphan FK value(s) in '{col}'not found in "
                           f"{fk.ref_table}.{ref_col} (e.g. {list(orphans)[:3]})")


def _check_date_sanity(tables: Dict[str, pd.DataFrame], issues: List[str]) -> None:
    jobs = tables.get("jobs")
    if jobs is not None and not jobs.empty:
        bad = jobs[pd.to_datetime(jobs["expires_at"]) <= pd.to_datetime(jobs["published_at"])]
        if not bad.empty:
            issues.append(f"[jobs] {len(bad)} job(s) have expires_at <= published_at")
        out_of_window = jobs[(pd.to_datetime(jobs["published_at"]).dt.date < pd.Timestamp("2026-06-01").date()) |
                              (pd.to_datetime(jobs["published_at"]).dt.date > pd.Timestamp("2026-12-31").date())]
        if not out_of_window.empty:
            issues.append(f"[jobs] {len(out_of_window)} job(s) posted outside the required "
                           f"2026-06-01..2026-12-31 window")
        non_active = jobs[jobs["status"] != "active"]
        if not non_active.empty:
            issues.append(f"[jobs] {len(non_active)} job(s) have status != 'active'")

    edu = tables.get("education")
    if edu is not None and not edu.empty:
        bad = edu[edu["end_date"].notna() & (pd.to_datetime(edu["end_date"]) < pd.to_datetime(edu["start_date"]))]
        if not bad.empty:
            issues.append(f"[education] {len(bad)} row(s) have end_date < start_date")

    apps = tables.get("applications")
    if apps is not None and not apps.empty and jobs is not None and not jobs.empty:
        job_windows = jobs.set_index("id")[["published_at", "expires_at"]]
        merged = apps.join(job_windows, on="job_id", rsuffix="_job")
        out = merged[(pd.to_datetime(merged["applied_at"]) < pd.to_datetime(merged["published_at"])) |
                     (pd.to_datetime(merged["applied_at"]) > pd.to_datetime(merged["expires_at"]))]
        if not out.empty:
            issues.append(f"[applications] {len(out)} application(s) fall outside their job's active window")

    jv = tables.get("job_views")
    if jv is not None and not jv.empty and jobs is not None and not jobs.empty:
        job_windows = jobs.set_index("id")[["published_at", "expires_at"]]
        merged = jv.join(job_windows, on="job_id", rsuffix="_job")
        out = merged[(pd.to_datetime(merged["viewed_at"]) < pd.to_datetime(merged["published_at"])) |
                     (pd.to_datetime(merged["viewed_at"]) > pd.to_datetime(merged["expires_at"]))]
        if not out.empty:
            issues.append(f"[job_views] {len(out)} view(s) fall outside their job's active window")


def validate_dataset(tables: Dict[str, pd.DataFrame], schemas: Dict[str, TableSchema]) -> List[str]:
    issues: List[str] = []
    for name, df in tables.items():
        schema = schemas.get(name)
        if schema is None:
            continue
        _check_required_columns(name, df, schema, issues)
        _check_enum(name, df, schema, issues)
        _check_pk_unique(name, df, schema, issues)
        _check_unique_constraints(name, df, schema, issues)
        _check_foreign_keys(name, df, schema, tables, issues)
        _check_varchar_lengths(name, df, schema, issues)
    _check_date_sanity(tables, issues)
    return issues


def render_validation_report(issues: List[str], tables: Dict[str, pd.DataFrame]) -> str:
    lines = ["# Validation Report", , "## Row counts", ]
    for name, df in tables.items():
        lines.append(f"- `{name}`: {len(df)} rows")
    lines.append()
    if not issues:
        lines.append("## Result: ALL CHECKS PASSED   no orphan FKs, no PK/unique violations, "
                      "no enum violations, no date-order violations.")
    else:
        lines.append(f"## Result: {len(issues)} ISSUE(S) FOUND")
        lines.append()
        for issue in issues:
            lines.append(f"- {issue}")
    return "\n".join(lines)
