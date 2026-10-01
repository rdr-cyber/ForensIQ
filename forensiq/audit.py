"""
forensiq.audit -- tamper-evident action log.

Every operation the interpreter performs is appended to an audit log as:

    {"seq": N, "ts": ISO8601-UTC, "action": ..., "detail": {...}, "hash": ...}

where

    hash = SHA-256(seq || ts || action || canonical_json(detail) || prev_hash)

forming a hash chain: the first entry's prev_hash is SHA-256("GENESIS").
Editing any historical entry breaks every hash after it, which is what makes
the log tamper-evident -- a core claim of the SIH26148 pitch.
"""

from __future__ import annotations

import hashlib
import json
import sys
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

GENESIS = "GENESIS"


def _canonical_json(obj: Any) -> str:
    """Stable JSON: sorted keys, no whitespace variance across platforms.

    Public alias: signing.py reuses this as the single canonicalizer for
    evidence-bundle signatures -- one JSON form across the whole codebase.
    """
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


canonical_json = _canonical_json


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class AuditLog:
    def __init__(self) -> None:
        self.entries: List[Dict[str, Any]] = []
        self._prev_hash: str = hashlib.sha256(GENESIS.encode("utf-8")).hexdigest()

    def record(self, action: str, **detail: Any) -> Dict[str, Any]:
        entry = {
            "seq": len(self.entries) + 1,
            "ts": _now_iso(),
            "action": action,
            "detail": detail,
            "prev_hash": self._prev_hash,
        }
        payload = (
            str(entry["seq"])
            + entry["ts"]
            + entry["action"]
            + _canonical_json(entry["detail"])
            + entry["prev_hash"]
        )
        entry["hash"] = hashlib.sha256(payload.encode("utf-8")).hexdigest()
        self._prev_hash = entry["hash"]
        self.entries.append(entry)
        return entry

    # ------------------------------------------------------------------ #

    def verify(self) -> tuple[bool, Optional[str]]:
        """Re-walk the chain. Returns (ok, first_broken_entry_hash)."""
        prev = hashlib.sha256(GENESIS.encode("utf-8")).hexdigest()
        for entry in self.entries:
            payload = (
                str(entry["seq"])
                + entry["ts"]
                + entry["action"]
                + _canonical_json(entry["detail"])
                + prev
            )
            expected = hashlib.sha256(payload.encode("utf-8")).hexdigest()
            if entry["hash"] != expected:
                return False, entry["hash"]
            if entry["prev_hash"] != prev:
                return False, entry["hash"]
            prev = entry["hash"]
        return True, None

    def write_to(self, path: str) -> None:
        """Write the log as JSONL. Called once at end of a run."""
        with open(path, "w", encoding="utf-8") as f:
            for entry in self.entries:
                f.write(_canonical_json(entry) + "\n")

    def summary(self) -> str:
        ok, broken = self.verify()
        status = "INTACT" if ok else f"CHAIN BROKEN at {broken}"
        return f"audit: {len(self.entries)} entries, chain {status}"


def print_audit(audit: AuditLog, stream: Any = sys.stderr) -> None:
    """Human-friendly dump used by the CLI's --verbose flag."""
    for entry in audit.entries:
        detail = ", ".join(f"{k}={v!r}" for k, v in entry["detail"].items())
        print(
            f"[{entry['seq']:03d}] {entry['ts']}  {entry['action']:<8} {detail}"
            f"  hash={entry['hash'][:12]}",
            file=stream,
        )
    print(audit.summary(), file=stream)
