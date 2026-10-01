"""Builds jocky-sih26148-submission.zip — the SIH26148 deliverable.

Guards learned the hard way on this OneDrive checkout:
  * os.walk can raise FileNotFoundError on phantom directory entries that
    OneDrive leaves behind after deletes — every entry is stat-guarded with
    os.path.isfile() before inclusion, and directories are guarded with
    os.path.isdir().
  * Secrets must never ship: the anon key lives in web/.env.local (excluded),
    the Ed25519 signing key in service/.forensiq/ (excluded), and the demo
    password must not appear in any included text file — the builder scans
    every candidate file and refuses to write the zip if a secret is found.

Usage:  python tools/build_submission.py
"""

from __future__ import annotations

import hashlib
import os
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "jocky-sih26148-submission.zip")
ARCROOT = "forensiq"

# Included top-level items (directories end with /). Everything listed is
# judged shippable; anything not listed stays out (env files, logs, keys,
# node_modules, .next, dev databases, screenshots/notes).
INCLUDE = [
    ".gitignore",
    "README.md",
    "requirements.txt",
    "examples/",
    "forensiq/",
    "service/",
    "supabase/",
    "web/",
    "tools/",
]

# Hard exclusions applied inside included directories, at any depth.
EXCLUDE_DIRS = {
    "node_modules",
    ".next",
    ".forensiq",  # Ed25519 private key material
    ".turbo",
    ".vercel",
    "__pycache__",
    ".pytest_cache",
    ".venv",
    "venv",
}
EXCLUDE_FILES = {
    ".env.local",
    ".env.local.example.bak",
    ".env",
    ".env.development.local",
    ".env.production.local",
    "next-dev.log",
    "uvicorn.log",
    "tsconfig.tsbuildinfo",
    ".DS_Store",
}

# Any of these substrings found in an included text file aborts the build.
# Assembled from fragments so THIS file never contains a literal marker —
# otherwise the scanner would ship the very strings it exists to catch.
SECRET_MARKERS = [
    "ForensiQ" + "#2026",  # demo account password
    "BEGIN " + "PRIVATE KEY",
    "BEGIN OPENSSH " + "PRIVATE KEY",
    "BEGIN EC " + "PRIVATE KEY",
    "BEGIN RSA " + "PRIVATE KEY",
]

# The judge demo credential is deliberately public and lives in exactly one
# file (web/src/lib/demoCredentials.ts, shown in the login page's Demo
# Access box); the scanner exempts that file for that marker ONLY. Key is
# assembled identically to the SECRET_MARKERS entry above.
DEMO_CRED_ALLOWLIST = {
    "ForensiQ" + "#2026": {"web/src/lib/demoCredentials.ts"},
}

# prefix of a Supabase-style HS256 JWT api key (anon/service_role)
JWT_APIKEY_PFX = "eyJhbGciOiJIUzI1NiIsIn" + "JlZiI6"

TEXT_SUFFIXES = {
    ".py", ".ts", ".tsx", ".js", ".mjs", ".json", ".md", ".sql", ".css",
    ".txt", ".yml", ".yaml", ".toml", ".gitignore", ".example", ".fzq",
    ".mjs.bak", "",
}


def is_excluded(name: str) -> bool:
    return name in EXCLUDE_FILES or name in EXCLUDE_DIRS


def iter_candidates():
    """Yield (abs_path, rel_posix_path) for every shippable file.

    Every stat is guarded: OneDrive phantom entries (ghosts of deleted
    files/dirs) raise FileNotFoundError under os.walk; we skip them.
    """
    for item in INCLUDE:
        top = os.path.join(ROOT, item.rstrip("/"))
        if item.endswith("/"):
            if not os.path.isdir(top):
                print(f"  [skip-missing-dir] {item}")
                continue
            for dirpath, dirnames, filenames in os.walk(top):
                # prune excluded dirs in-place so os.walk skips them
                dirnames[:] = [
                    d
                    for d in dirnames
                    if d not in EXCLUDE_DIRS and os.path.isdir(os.path.join(dirpath, d))
                ]
                for fn in sorted(filenames):
                    if fn in EXCLUDE_FILES or fn.endswith(".log"):
                        continue
                    abs_path = os.path.join(dirpath, fn)
                    if not os.path.isfile(abs_path):
                        print(f"  [skip-ghost] {abs_path}")
                        continue
                    rel = os.path.relpath(abs_path, ROOT).replace("\\", "/")
                    yield abs_path, rel
        else:
            if not os.path.isfile(top):
                print(f"  [skip-missing-file] {item}")
                continue
            yield top, item


def scan_for_secrets(abs_path: str, rel: str) -> list[str]:
    _, ext = os.path.splitext(rel)
    if ext.lower() not in TEXT_SUFFIXES:
        return []
    try:
        with open(abs_path, "r", encoding="utf-8", errors="ignore") as f:
            text = f.read()
    except OSError as exc:
        return [f"{rel}: unreadable ({exc})"]
    hits = []
    for marker in SECRET_MARKERS:
        if marker in text and rel not in DEMO_CRED_ALLOWLIST.get(marker, set()):
            hits.append(f"{rel}: contains secret marker {marker!r}")
    # the anon key JWT: flag any HS256 supabase-style key outside .example files
    if rel != "web/.env.local.example" and rel.endswith((".ts", ".tsx", ".js", ".mjs", ".py", ".md")):
        if JWT_APIKEY_PFX in text:
            hits.append(f"{rel}: contains a Supabase JWT api key")
    return hits


def main() -> int:
    files: list[tuple[str, str]] = []
    problems: list[str] = []
    for abs_path, rel in iter_candidates():
        files.append((abs_path, rel))
        problems.extend(scan_for_secrets(abs_path, rel))

    if problems:
        print("SECRET SCAN FAILED — zip NOT written:")
        for p in problems:
            print(f"  !! {p}")
        return 1

    if os.path.exists(OUT):
        os.remove(OUT)
    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
        for abs_path, rel in sorted(files, key=lambda t: t[1]):
            z.write(abs_path, f"{ARCROOT}/{rel}")

    size = os.path.getsize(OUT)
    with open(OUT, "rb") as f:
        digest = hashlib.sha256(f.read()).hexdigest()
    print(f"wrote {os.path.basename(OUT)}: {len(files)} files, {size:,} bytes")
    print(f"sha256 {digest}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
