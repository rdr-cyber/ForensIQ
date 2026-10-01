#!/usr/bin/env python3
"""
forensiq.main -- CLI entry point.

Usage:
    python -m forensiq.main run script.fzq [--audit out.jsonl] [--verbose]
    python -m forensiq.main verify-report bundle.json
"""

from __future__ import annotations

import argparse
import json
import sys

from .audit import AuditLog, print_audit
from .interpreter import InterpreterError, run_program
from .lexer import LexError
from .parser import ParseError, parse
from .signing import ReportTamperedError, verify_bundle


def _cmd_run(args: argparse.Namespace) -> int:
    try:
        with open(args.script, "r", encoding="utf-8") as f:
            source = f.read()
    except OSError as e:
        print(f"forensiq: cannot read script: {e}", file=sys.stderr)
        return 2

    audit = AuditLog()
    try:
        program = parse(source)
        run_program(program, audit, script_path=args.script, script_source=source)
    except (LexError, ParseError, InterpreterError) as e:
        print(f"forensiq: {e}", file=sys.stderr)
        audit.record("error", message=str(e))
        return 1

    audit.write_to(args.audit)
    if args.verbose:
        print_audit(audit, stream=sys.stderr)
    else:
        print(audit.summary(), file=sys.stderr)
    return 0


def _cmd_verify_report(args: argparse.Namespace) -> int:
    try:
        with open(args.bundle, "r", encoding="utf-8") as f:
            bundle = json.load(f)
    except OSError as e:
        print(f"forensiq: cannot read bundle: {e}", file=sys.stderr)
        return 2
    except json.JSONDecodeError as e:
        print(f"forensiq: cannot parse bundle as JSON: {e}", file=sys.stderr)
        return 2

    try:
        verify_bundle(bundle)
    except ReportTamperedError as e:
        print(f"forensiq: {e}", file=sys.stderr)
        return 1

    print("SIGNATURE VALID")
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="forensiq")
    sub = ap.add_subparsers(dest="command", required=True)

    run_p = sub.add_parser("run", help="run a .fzq script")
    run_p.add_argument("script", help="path to the .fzq script")
    run_p.add_argument("--audit", default="audit.jsonl", help="audit log output path")
    run_p.add_argument("--verbose", action="store_true", help="print every audit entry")
    run_p.set_defaults(func=_cmd_run)

    vp = sub.add_parser("verify-report", help="verify a signed evidence bundle")
    vp.add_argument("bundle", help="path to the signed evidence bundle (.json)")
    vp.set_defaults(func=_cmd_verify_report)

    args = ap.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
