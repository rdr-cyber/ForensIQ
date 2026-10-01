"""
Jocky FastAPI service.

Wraps the Jocky interpreter (lexer -> parser -> interpreter -> audit)
behind a tiny HTTP API so the Next.js frontend never shells out to Python.

    uvicorn service.main:app --host 127.0.0.1 --port 8000

Endpoints:
    GET  /health          liveness probe
    POST /run             execute a script -> stdout + audit chain + status
    POST /report          execute + verify chain + sign -> signed bundle JSON

Design:
  * Stateless per request: each execution happens in a fresh temp directory.
  * The operator signing key lives in FORENSIQ_KEY_DIR (default ./service/.forensiq)
    so every bundle is signed with the same service identity.
  * No Supabase access here -- persistence is the Next.js API routes' job,
    under the caller's own RLS bearer token.
  * Reads/writes are confined to the temp dir. Scripts only see files they
    created themselves, which keeps `acquire` targets inside the sandbox.
"""

from __future__ import annotations

import os
import tempfile
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from forensiq.audit import AuditLog
from forensiq.interpreter import InterpreterError, run_program
from forensiq.lexer import LexError
from forensiq.parser import ParseError

app = FastAPI(title="Jocky Service", version="0.1.0")

KEY_DIR = os.path.abspath(
    os.environ.get("FORENSIQ_KEY_DIR", os.path.join(os.path.dirname(__file__), ".forensiq"))
)


class ScriptRequest(BaseModel):
    script: str
    files: Optional[Dict[str, str]] = None  # optional sandbox input files


class RunResponse(BaseModel):
    ok: bool
    stdout: str
    chain_status: str  # "INTACT" | "BROKEN"
    audit_entries: List[Dict[str, Any]]
    error: Optional[str] = None


class ReportResponse(BaseModel):
    ok: bool
    chain_status: str
    audit_entries: List[Dict[str, Any]]
    signed_bundle: Dict[str, Any]
    error: Optional[str] = None


def _execute(script: str, files: Optional[Dict[str, str]]) -> tuple[AuditLog, str, Optional[str]]:
    """Run the script in a temp sandbox. Returns (audit, stdout, error)."""
    if len(script) > 100_000:
        raise HTTPException(status_code=413, detail="script too large")

    with tempfile.TemporaryDirectory(prefix="forensiq-run-") as tmp:
        # Optional input files the script may `acquire` (e.g. a sample to hash).
        for name, content in (files or {}).items():
            safe = os.path.basename(name)  # no path traversal
            with open(os.path.join(tmp, safe), "w", encoding="utf-8") as f:
                f.write(content)

        audit = AuditLog()

        import contextlib
        import io

        script_path = os.path.join(tmp, "script.fzq")
        with open(script_path, "w", encoding="utf-8") as f:
            f.write(script)

        # `acquire file "x.txt"` resolves relative paths against the process
        # CWD, so pin CWD to the sandbox for the duration of the run.
        old_cwd = os.getcwd()
        os.chdir(tmp)
        try:
            with contextlib.redirect_stdout(io.StringIO()) as buf:
                run_program(
                    __import__("forensiq.parser").parse(script),
                    audit,
                    script_path=script_path,
                    script_source=script,
                    key_dir=KEY_DIR,
                )
            stdout = buf.getvalue()
            error = None
        except (LexError, ParseError, InterpreterError) as e:
            stdout = buf.getvalue()
            error = str(e)
        finally:
            os.chdir(old_cwd)

        return audit, stdout, error


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok", "key_dir": KEY_DIR}


@app.post("/run", response_model=RunResponse)
def run(req: ScriptRequest) -> RunResponse:
    audit, stdout, error = _execute(req.script, req.files)
    ok, broken_at = audit.verify()
    if error is not None:
        return RunResponse(
            ok=False,
            stdout=stdout,
            chain_status="INTACT" if ok else "BROKEN",
            audit_entries=audit.entries,
            error=error,
        )
    return RunResponse(
        ok=True,
        stdout=stdout,
        chain_status="INTACT" if ok else "BROKEN",
        audit_entries=audit.entries,
    )


@app.post("/report", response_model=ReportResponse)
def report(req: ScriptRequest) -> ReportResponse:
    audit, stdout, error = _execute(req.script, req.files)
    if error is not None:
        return ReportResponse(
            ok=False,
            chain_status="INTACT",
            audit_entries=audit.entries,
            signed_bundle={},
            error=error,
        )

    # The interpreter's `report` statement has already verified the chain and
    # signed the bundle. Recover it from the interpreter's output: rerun with
    # a hook to capture the bundle instead of scraping stdout.
    # For v0 we re-execute with a bundle-capturing interpreter subclass.
    from forensiq.interpreter import Interpreter
    from forensiq.parser import parse as _parse

    audit2 = AuditLog()
    chunks: List[str] = []
    import contextlib
    import io

    class BundleCapturingInterpreter(Interpreter):
        bundle: Optional[Dict[str, Any]] = None

        def _exec_report(self, stmt) -> None:  # type: ignore[override]
            import json as _json

            from forensiq.signing import ensure_keypair, sign_bundle

            self.audit.record("report", output_path=stmt.output_path, line=stmt.line)
            ok, broken_at = self.audit.verify()
            if not ok:
                raise InterpreterError(
                    f"report: audit chain BROKEN at entry {broken_at}"
                )
            bundle = {
                "report_version": "1.0",
                "generated_at": __import__("forensiq.audit", fromlist=["_now_iso"])._now_iso(),
                "script_file": self.script_path,
                "script_hash": self.script_hash,
                "chain_status": "INTACT",
                "audit_chain": list(self.audit.entries),
                "results": dict(self.results),
            }
            priv_pem, pub_pem = ensure_keypair(self.key_dir)
            self.bundle = sign_bundle(bundle, priv_pem, pub_pem)
            print(
                f"Evidence bundle written to {stmt.output_path} "
                f"(chain: INTACT, {len(self.audit.entries)} entries, "
                f"script_hash: {self.script_hash[:12]}...)"
            )

    with tempfile.TemporaryDirectory(prefix="forensiq-run-") as tmp:
        script_path = os.path.join(tmp, "script.fzq")
        for name, content in (req.files or {}).items():
            safe = os.path.basename(name)
            with open(os.path.join(tmp, safe), "w", encoding="utf-8") as f:
                f.write(content)
        with open(script_path, "w", encoding="utf-8") as f:
            f.write(req.script)

        interp = BundleCapturingInterpreter(
            audit2,
            script_path=script_path,
            script_source=req.script,
            key_dir=KEY_DIR,
        )
        old_cwd = os.getcwd()
        os.chdir(tmp)
        try:
            with contextlib.redirect_stdout(io.StringIO()) as buf:
                interp.run(_parse(req.script))
        except (LexError, ParseError, InterpreterError) as e:
            raise HTTPException(status_code=422, detail=str(e))
        finally:
            os.chdir(old_cwd)

    if interp.bundle is None:
        raise HTTPException(status_code=422, detail="script contains no report statement")

    ok, _ = audit2.verify()
    return ReportResponse(
        ok=True,
        chain_status="INTACT" if ok else "BROKEN",
        audit_entries=audit2.entries,
        signed_bundle=interp.bundle,
    )
