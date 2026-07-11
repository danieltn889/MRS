"
mapping.py
==========
Deterministic UUID generation for CSV ids that don't match the database's
uuid primary keys. Using uuid5 (namespace + name) rather than uuid4 (random)
means re-running the pipeline on the same CSV id always yields the same
database UUID   the mapping is reproducible without needing to persist any
state between runs, and the exported *_id_mapping.csv files are simply a
human-readable record of that deterministic function, not the source of
truth for it.
"

from __future__ import annotations

import uuid
from typing import Dict, List

from . import config

_NAMESPACE = uuid.UUID(config.UUID_NAMESPACE)


def candidate_uuid(original_id: str) -> str:
    return str(uuid.uuid5(_NAMESPACE, f"candidate:{original_id}"))


def job_uuid(original_id: str) -> str:
    return str(uuid.uuid5(_NAMESPACE, f"job:{original_id}"))


def company_uuid(institution_name: str, existing: Dict[str, str] = None) -> str:
    "`existing` (lowercased name -> real id) lets a name that already
    exists in the target database reuse its real id instead of minting a
    colliding duplicate   see existing_data.py."
    key = institution_name.strip().lower()
    if existing and key in existing:
        return existing[key]
    return str(uuid.uuid5(_NAMESPACE, f"company:{key}"))


def skill_uuid(skill_name: str, existing: Dict[str, str] = None) -> str:
    key = skill_name.strip().lower()
    if existing and key in existing:
        return existing[key]
    return str(uuid.uuid5(_NAMESPACE, f"skill:{key}"))


def deterministic_uuid(*parts: str) -> str:
    "General-purpose helper for one-off rows (education, work_experience,
    applications, ...) that need a stable id derived from their natural key."
    return str(uuid.uuid5(_NAMESPACE, ":".join(parts)))


def build_mapping_table(original_ids: List[str], uuid_fn) -> Dict[str, str]:
    return {oid: uuid_fn(oid) for oid in original_ids}
