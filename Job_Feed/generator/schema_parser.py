"""
schema_parser.py
=================
Lightweight but real parser for the pg_dump schema (db_backup_20260705_182104.sql).
Not a general SQL parser — tailored to pg_dump's consistent, regular output:

    CREATE TABLE public.<name> (
        col1 type ... ,
        col2 type ... ,
        CONSTRAINT ... CHECK (...)
    );

    ALTER TABLE ONLY public.<name>
        ADD CONSTRAINT <name> PRIMARY KEY (...);
    ALTER TABLE ONLY public.<name>
        ADD CONSTRAINT <name> FOREIGN KEY (...) REFERENCES public.<other>(...);

Splitting a column list on commas has to respect nesting (numeric(10,2),
ARRAY['a','b'], CHECK((a OR b))), so columns are split by tracking paren/
bracket depth rather than a naive comma split.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional


@dataclass
class ColumnDef:
    name: str
    data_type: str
    not_null: bool
    default: Optional[str]
    enum_values: Optional[List[str]] = None  # from a CHECK (col = ANY (ARRAY[...])) constraint


@dataclass
class ForeignKey:
    columns: List[str]
    ref_table: str
    ref_columns: List[str]
    on_delete_cascade: bool


@dataclass
class TableSchema:
    name: str
    columns: Dict[str, ColumnDef] = field(default_factory=dict)
    primary_key: List[str] = field(default_factory=list)
    unique_constraints: List[List[str]] = field(default_factory=list)
    foreign_keys: List[ForeignKey] = field(default_factory=list)

    @property
    def required_columns(self) -> List[str]:
        """NOT NULL columns with no default — a generator MUST supply these."""
        return [c.name for c in self.columns.values() if c.not_null and c.default is None]


def _split_top_level(text: str) -> List[str]:
    """Split a CREATE TABLE column/constraint list on commas, ignoring commas
    nested inside (), [], or single-quoted strings."""
    parts, depth, buf, in_quote = [], 0, [], False
    i = 0
    while i < len(text):
        ch = text[i]
        if in_quote:
            buf.append(ch)
            if ch == "'" and text[i - 1:i] != "\\":
                # handle doubled '' as an escaped quote inside pg literals
                if text[i + 1:i + 2] == "'":
                    buf.append("'")
                    i += 2
                    continue
                in_quote = False
            i += 1
            continue
        if ch == "'":
            in_quote = True
            buf.append(ch)
        elif ch in "([":
            depth += 1
            buf.append(ch)
        elif ch in ")]":
            depth -= 1
            buf.append(ch)
        elif ch == "," and depth == 0:
            parts.append("".join(buf))
            buf = []
        else:
            buf.append(ch)
        i += 1
    if buf:
        parts.append("".join(buf))
    return [p.strip() for p in parts if p.strip()]


_ENUM_RE = re.compile(r"ANY\s*\(\(?ARRAY\[(.*?)\]::", re.DOTALL)
_QUOTED_RE = re.compile(r"'((?:[^'\\]|\\.)*)'")


def _extract_enum_values(check_text: str) -> Optional[List[str]]:
    m = _ENUM_RE.search(check_text)
    if not m:
        return None
    return [q for q in _QUOTED_RE.findall(m.group(1))]


def _parse_column_or_constraint(field_text: str, table: TableSchema) -> None:
    stripped = field_text.strip()
    upper = stripped.upper()

    if upper.startswith("CONSTRAINT"):
        # CONSTRAINT <name> CHECK (...)   — table-level named check
        check_m = re.search(r"CHECK\s*\((.*)\)\s*$", stripped, re.DOTALL)
        if check_m:
            enum_vals = _extract_enum_values(check_m.group(1))
            if enum_vals:
                # Figure out which column this check applies to: the check
                # text always starts with ((<column> ...
                col_m = re.match(r".*?\(\(?\(?(\w+)\)?::text", check_m.group(1))
                if col_m and col_m.group(1) in table.columns:
                    table.columns[col_m.group(1)].enum_values = enum_vals
        return
    if upper.startswith("PRIMARY KEY"):
        cols_m = re.search(r"\((.*)\)", stripped)
        if cols_m:
            table.primary_key = [c.strip() for c in cols_m.group(1).split(",")]
        return
    if upper.startswith("UNIQUE"):
        cols_m = re.search(r"\((.*)\)", stripped)
        if cols_m:
            table.unique_constraints.append([c.strip() for c in cols_m.group(1).split(",")])
        return

    # Column definition: "name TYPE [modifiers...]" — name may be double-quoted
    name_m = re.match(r'^("(?:[^"]+)"|\w+)\s+(.*)$', stripped, re.DOTALL)
    if not name_m:
        return
    name = name_m.group(1).strip('"')
    rest = name_m.group(2).strip()

    not_null = bool(re.search(r"\bNOT NULL\b", rest))
    rest_wo_notnull = re.sub(r"\bNOT NULL\b", "", rest)

    default = None
    default_m = re.search(r"\bDEFAULT\s+(.*)$", rest_wo_notnull, re.DOTALL)
    if default_m:
        default = default_m.group(1).strip().rstrip(",")
        data_type = rest_wo_notnull[:default_m.start()].strip()
    else:
        data_type = rest_wo_notnull.strip()

    # Inline CHECK inside a column def, e.g. "status varchar(50) CHECK (status = ANY (...))"
    inline_check_m = re.search(r"CHECK\s*\((.*)\)\s*$", data_type, re.DOTALL)
    enum_values = None
    if inline_check_m:
        enum_values = _extract_enum_values(inline_check_m.group(1))
        data_type = data_type[:inline_check_m.start()].strip()

    table.columns[name] = ColumnDef(
        name=name, data_type=data_type, not_null=not_null,
        default=default, enum_values=enum_values,
    )


_CREATE_TABLE_RE = re.compile(
    r"CREATE TABLE public\.(\w+) \(\n(.*?)\n\);", re.DOTALL,
)
_ALTER_CONSTRAINT_RE = re.compile(
    r"ALTER TABLE ONLY public\.(\w+)\s+"
    r"ADD CONSTRAINT \w+ (PRIMARY KEY|UNIQUE|FOREIGN KEY) \(([^)]+)\)"
    r"(?:\s+REFERENCES public\.(\w+)\(([^)]+)\)(\s+ON DELETE CASCADE)?)?",
)


def parse_schema(sql_path: Path) -> Dict[str, TableSchema]:
    text = sql_path.read_text(encoding="utf-8", errors="replace")
    tables: Dict[str, TableSchema] = {}

    for m in _CREATE_TABLE_RE.finditer(text):
        table_name, body = m.group(1), m.group(2)
        table = TableSchema(name=table_name)
        for field_text in _split_top_level(body):
            _parse_column_or_constraint(field_text, table)
        tables[table_name] = table

    for m in _ALTER_CONSTRAINT_RE.finditer(text):
        table_name, kind, cols, ref_table, ref_cols, cascade = m.groups()
        table = tables.get(table_name)
        if table is None:
            continue
        col_list = [c.strip() for c in cols.split(",")]
        if kind == "PRIMARY KEY":
            table.primary_key = col_list
        elif kind == "UNIQUE":
            table.unique_constraints.append(col_list)
        elif kind == "FOREIGN KEY" and ref_table:
            table.foreign_keys.append(ForeignKey(
                columns=col_list, ref_table=ref_table,
                ref_columns=[c.strip() for c in ref_cols.split(",")],
                on_delete_cascade=bool(cascade),
            ))

    return tables


def render_schema_report(tables: Dict[str, TableSchema], only: Optional[List[str]] = None) -> str:
    lines = ["# Database Schema Inspection Report", ""]
    names = only or sorted(tables.keys())
    for name in names:
        t = tables.get(name)
        if t is None:
            lines.append(f"## {name}  (NOT FOUND IN SCHEMA)\n")
            continue
        lines.append(f"## Table: `{t.name}`")
        lines.append("")
        lines.append("| Column | Type | Nullable | Default | Enum values |")
        lines.append("|---|---|---|---|---|")
        for c in t.columns.values():
            nullable = "NO" if c.not_null else "YES"
            default = f"`{c.default}`" if c.default else ""
            enums = ", ".join(c.enum_values) if c.enum_values else ""
            lines.append(f"| {c.name} | {c.data_type} | {nullable} | {default} | {enums} |")
        lines.append("")
        lines.append(f"- **Primary key**: {', '.join(t.primary_key) or '(none found)'}")
        for u in t.unique_constraints:
            lines.append(f"- **Unique**: ({', '.join(u)})")
        for fk in t.foreign_keys:
            cascade = " ON DELETE CASCADE" if fk.on_delete_cascade else ""
            lines.append(f"- **Foreign key**: ({', '.join(fk.columns)}) -> "
                          f"`{fk.ref_table}`({', '.join(fk.ref_columns)}){cascade}")
        required = t.required_columns
        if required:
            lines.append(f"- **Required (NOT NULL, no default)**: {', '.join(required)}")
        lines.append("")
    return "\n".join(lines)
