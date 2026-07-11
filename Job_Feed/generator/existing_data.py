"
existing_data.py
================
Some tables the generator writes to (skills, companies) already have real
seed rows in the target database   visible as `COPY ... FROM stdin` data
blocks in the same db_backup_*.sql dump used for schema parsing. Minting a
fresh deterministic UUID for a name that already exists there (e.g. "SQL",
"Python") creates a second row with a different id, collides with the
table's UNIQUE(name) constraint on import, gets silently dropped by
`ON CONFLICT DO NOTHING`   and orphans every user_skills/job_skills row
that pointed at the new (never-inserted) id. Per the project's own rule
("never recreate what already exists"), the fix is to look up and reuse
the REAL id for any matching name instead of generating a new one.
"

from __future__ import annotations

import re
from pathlib import Path
from typing import Dict

_COPY_HEADER_RE = re.compile(r"^COPY public\.(\w+) \(([^)]+)\) FROM stdin;$")


def _parse_copy_block(text: str, table: str, columns_needed: list) -> list:
    "Returns a list of dicts (one per row) for the given table's COPY block,
    with only the requested columns extracted."
    lines = text.splitlines()
    rows = []
    in_block = False
    col_index: Dict[str, int] = {}

    for line in lines:
        if not in_block:
            m = _COPY_HEADER_RE.match(line)
            if m and m.group(1) == table:
                cols = [c.strip() for c in m.group(2).split(",")]
                col_index = {c: i for i, c in enumerate(cols)}
                in_block = True
            continue
        if line == "\\.":
            break
        fields = line.split("\t")
        row = {}
        for col in columns_needed:
            idx = col_index.get(col)
            if idx is None or idx >= len(fields):
                row[col] = None
            else:
                val = fields[idx]
                row[col] = None if val == "\\N" else val
        rows.append(row)

    return rows


def load_existing_names(sql_path: Path, table: str, name_column: str = "name") -> Dict[str, str]:
    "Returns {lowercased name: real id} for every existing row of `table`."
    text = sql_path.read_text(encoding="utf-8", errors="replace")
    rows = _parse_copy_block(text, table, ["id", name_column])
    return {r[name_column].strip().lower(): r["id"] for r in rows if r.get(name_column) and r.get("id")}
