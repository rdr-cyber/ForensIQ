"""
forensiq.interpreter -- executes the AST.

Only capability-bounded, allowlist-style operations live here. Nothing in
this file touches processes, memory, or the registry: it hashes files the
operator explicitly acquired and appends to the audit log. That surface is
deliberately boring -- boring is what keeps EDRs calm.
"""

from __future__ import annotations

import hashlib
import json
import os
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List

from .audit import AuditLog
from .parser import AcquireStmt, HashStmt, LogStmt, Program, ReportStmt
from .signing import ensure_keypair, sign_bundle


class InterpreterError(Exception):
    pass


class Interpreter:
    def __init__(
        self,
        audit: AuditLog,
        script_path: str = "<source>",
        script_source: str = "",
        key_dir: str = ".forensiq",
    ) -> None:
        self.audit = audit
        self.script_path = script_path
        # Where the operator keypair lives. Services running the interpreter
        # from a per-request CWD pass an absolute path so the operator
        # identity stays stable across runs.
        self.key_dir = key_dir
        # Hash the exact bytes the operator executed, not a re-serialization:
        # re-serialization would let the "what ran" record drift from reality.
        self.script_hash = hashlib.sha256(script_source.encode("utf-8")).hexdigest()
        self.state: Dict[str, Any] = {}  # e.g. acquired path for this run
        self.results: Dict[str, Any] = {}  # collected outputs for evidence bundles
        # v0 stdlib: local, read-only, audited operations only.
        self.functions: Dict[str, Callable] = {
            "file_sha256": self._builtin_file_hash,
        }

    # ------------------------------------------------------------------ #
    # statement dispatch
    # ------------------------------------------------------------------ #

    def run(self, program: Program) -> None:
        for stmt in program:
            if isinstance(stmt, AcquireStmt):
                self._exec_acquire(stmt)
            elif isinstance(stmt, HashStmt):
                self._exec_hash(stmt)
            elif isinstance(stmt, LogStmt):
                self._exec_log(stmt)
            elif isinstance(stmt, ReportStmt):
                self._exec_report(stmt)
            else:  # pragma: no cover - parser only produces the above
                raise InterpreterError(f"unknown statement type: {type(stmt).__name__}")

    # ------------------------------------------------------------------ #
    # executors -- each one records to the audit log before doing work
    # ------------------------------------------------------------------ #

    def _exec_acquire(self, stmt: AcquireStmt) -> None:
        self.audit.record(
            "acquire", target=stmt.target, path=stmt.path, line=stmt.line
        )
        if stmt.target == "file":
            if not os.path.isfile(stmt.path):
                raise InterpreterError(
                    f"acquire: no such file: {stmt.path} (line {stmt.line})"
                )
            self.state["acquired_path"] = stmt.path
        else:
            raise InterpreterError(
                f"acquire: unsupported target '{stmt.target}' (line {stmt.line})"
            )

    def _exec_hash(self, stmt: HashStmt) -> None:
        self.audit.record("hash", algorithm=stmt.algorithm, line=stmt.line)
        path = self.state.get("acquired_path")
        if not path:
            raise InterpreterError(
                f"hash: nothing has been acquired yet (line {stmt.line})"
            )
        if stmt.algorithm != "sha256":
            raise InterpreterError(
                f"hash: unsupported algorithm '{stmt.algorithm}' (line {stmt.line})"
            )
        digest = self.functions["file_sha256"](path)
        self.state["last_hash"] = digest
        self.results.setdefault("hashes", []).append({"path": path, "algorithm": stmt.algorithm, "digest": digest})
        print(f"sha256({path}) = {digest}")

    def _exec_log(self, stmt: LogStmt) -> None:
        self.audit.record("log", message=stmt.message, line=stmt.line)
        print(stmt.message)

    # ------------------------------------------------------------------ #
    # report: tamper-evident evidence bundle
    # ------------------------------------------------------------------ #

    def _exec_report(self, stmt: ReportStmt) -> None:
        """Verify the audit chain, then emit a JSON evidence bundle.

        Never produces a report on a tampered log: chain verification is a
        precondition, not a field we merely fill in afterwards.
        """
        self.audit.record("report", output_path=stmt.output_path, line=stmt.line)

        # 1+2. Full log + verify BEFORE writing anything.
        ok, broken_at = self.audit.verify()
        if not ok:
            raise InterpreterError(
                "report: audit chain BROKEN at entry "
                f"{broken_at} -- refusing to emit an evidence bundle from a "
                "tampered log (line " + str(stmt.line) + ")"
            )

        # 3. Hash of the exact .fzq source bytes that were executed.
        # 4. Evidence bundle.
        bundle = {
            "report_version": "1.0",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "script_file": self.script_path,
        }
        bundle["script_hash"] = self.script_hash
        bundle["chain_status"] = "INTACT"
        bundle["audit_chain"] = list(self.audit.entries)
        bundle["results"] = dict(self.results)

        # 5. Sign (Ed25519 over the canonical form), then write.
        priv_pem, pub_pem = ensure_keypair(self.key_dir)
        signed = sign_bundle(bundle, priv_pem, pub_pem)
        with open(stmt.output_path, "w", encoding="utf-8") as f:
            f.write(json.dumps(signed, indent=2, sort_keys=True, ensure_ascii=False) + "\n")

        # 6. One-line confirmation.
        n = len(self.audit.entries)
        print(
            f"Evidence bundle written to {stmt.output_path} "
            f"(chain: INTACT, {n} entries, script_hash: {self.script_hash[:12]}...)"
        )

    # ------------------------------------------------------------------ #
    # built-ins -- deliberately tiny and side-effect-light
    # ------------------------------------------------------------------ #

    @staticmethod
    def _builtin_file_hash(path: str) -> str:
        """Streamed SHA-256 of a file. Read-only, chunked, no mmap tricks."""
        h = hashlib.sha256()
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(65536), b""):
                h.update(chunk)
        return h.hexdigest()


def run_program(
    program: Program,
    audit: AuditLog,
    script_path: str = "<source>",
    script_source: str = "",
    key_dir: str = ".forensiq",
) -> None:
    Interpreter(
        audit,
        script_path=script_path,
        script_source=script_source,
        key_dir=key_dir,
    ).run(program)
