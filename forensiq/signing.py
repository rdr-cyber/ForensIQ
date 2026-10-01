"""
forensiq.signing -- Ed25519 signing for evidence bundles.

Why sign at all? The audit hash chain proves the log wasn't edited after the
fact, but anyone with the source could regenerate a "valid" chain. A signature
from the operator's key binds the bundle to *this operator*: tampering with
the signed JSON file after signing is now detectable, not just tampering
before the report.

Key material lives in .forensiq/ next to where the run happens:
  .forensiq/operator_key      PEM PKCS8 private key (chmod 600)
  .forensiq/operator_key.pub  PEM SubjectPublicKeyInfo public key

Ed25519 via the `cryptography` package -- no openssl subprocess, no shelling
out, keeping the runtime's audited surface small.
"""

from __future__ import annotations

import base64
import os
import stat
from typing import Any, Dict, Tuple

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)

from .audit import canonical_json

SIGNATURE_ALGORITHM = "Ed25519"


class SigningError(Exception):
    pass


class ReportTamperedError(Exception):
    """Signature mismatch -- the bundle changed after signing."""

    pass


# ---------------------------------------------------------------------- #
# key management
# ---------------------------------------------------------------------- #

def ensure_keypair(dir_path: str = ".forensiq") -> Tuple[str, str]:
    """Return (private_pem, public_pem) from disk, generating on first run."""
    priv_path = os.path.join(dir_path, "operator_key")
    pub_path = os.path.join(dir_path, "operator_key.pub")
    if os.path.isfile(priv_path) and os.path.isfile(pub_path):
        with open(priv_path, "rb") as f:
            priv_pem = f.read()
        with open(pub_path, "rb") as f:
            pub_pem = f.read()
        _check_local_keypair(priv_pem, pub_pem)
        return priv_pem, pub_pem

    key = Ed25519PrivateKey.generate()
    priv_pem = key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    pub_pem = key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    os.makedirs(dir_path, exist_ok=True)
    with open(priv_path, "wb") as f:
        f.write(priv_pem)
    _restrict_permissions(priv_path)
    with open(pub_path, "wb") as f:
        f.write(pub_pem)
    return priv_pem, pub_pem


def _restrict_permissions(path: str) -> None:
    """chmod 600 on POSIX. On Windows, ACLs govern access; restrict via DACL best-effort."""
    if os.name == "posix":
        os.chmod(path, stat.S_IRUSR | stat.S_IWUSR)
    else:
        try:
            # Best-effort hardening on Windows: keep only the current user's ACE.
            import subprocess
            user = os.environ.get("USERNAME", "")
            if user:
                subprocess.run(
                    ["icacls", path, "/inheritance:r", "/grant:r", f"{user}:F"],
                    check=False,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
        except Exception:
            pass


def _check_local_keypair(priv_pem: bytes, pub_pem: bytes) -> None:
    """On load, confirm the on-disk private key matches the on-disk public key."""
    priv = serialization.load_pem_private_key(priv_pem, password=None)
    if not isinstance(priv, Ed25519PrivateKey):
        raise SigningError(
            ".forensiq/operator_key is not an Ed25519 private key -- refusing to use it"
        )
    derived = priv.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    if derived != pub_pem:
        raise SigningError(
            ".forensiq/operator_key.pub does not match operator_key -- refusing to sign"
        )


def load_public_key(pub_pem: bytes) -> Ed25519PublicKey:
    key = serialization.load_pem_public_key(pub_pem)
    if not isinstance(key, Ed25519PublicKey):
        raise SigningError("public key is not Ed25519")
    return key


def public_key_b64(pub_pem: bytes) -> str:
    """Base64 of the raw 32-byte Ed25519 public key (goes inside the bundle)."""
    key = load_public_key(pub_pem)
    raw = key.public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )
    return base64.b64encode(raw).decode("ascii")


# ---------------------------------------------------------------------- #
# sign / verify
# ---------------------------------------------------------------------- #

def sign_bundle(bundle: Dict[str, Any], priv_pem: bytes, pub_pem: bytes) -> Dict[str, Any]:
    """Return the bundle with a top-level "signature" field added."""
    unsigned = {k: v for k, v in bundle.items() if k != "signature"}
    payload = canonical_json(unsigned).encode("utf-8")
    key = serialization.load_pem_private_key(priv_pem, password=None)
    if not isinstance(key, Ed25519PrivateKey):
        raise SigningError("operator key is not Ed25519")
    sig = base64.b64encode(key.sign(payload)).decode("ascii")
    return {
        **unsigned,
        "signature": {
            "algorithm": SIGNATURE_ALGORITHM,
            "public_key": public_key_b64(pub_pem),
            "signature": sig,
        },
    }


def verify_bundle(bundle: Dict[str, Any]) -> bool:
    """Verify the "signature" field against the embedded public key.

    Raises ReportTamperedError with a precise reason on any failure.
    """
    if not isinstance(bundle, dict) or "signature" not in bundle:
        raise ReportTamperedError('bundle has no "signature" field')
    sig_info = bundle["signature"]
    for field in ("algorithm", "public_key", "signature"):
        if field not in sig_info:
            raise ReportTamperedError(f'signature block missing "{field}"')
    if sig_info["algorithm"] != SIGNATURE_ALGORITHM:
        raise ReportTamperedError(
            f'unsupported signature algorithm {sig_info["algorithm"]!r}'
        )
    try:
        pub_raw = base64.b64decode(sig_info["public_key"], validate=True)
    except Exception:
        raise ReportTamperedError("signature.public_key is not valid base64")
    if len(pub_raw) != 32:
        raise ReportTamperedError("signature.public_key is not a 32-byte Ed25519 key")
    try:
        sig = base64.b64decode(sig_info["signature"], validate=True)
    except Exception:
        raise ReportTamperedError("signature.signature is not valid base64")

    unsigned = {k: v for k, v in bundle.items() if k != "signature"}
    payload = canonical_json(unsigned).encode("utf-8")
    pub = Ed25519PublicKey.from_public_bytes(pub_raw)
    try:
        pub.verify(sig, payload)
    except InvalidSignature:
        raise ReportTamperedError(
            "SIGNATURE INVALID / bundle has been modified since signing"
        )
    return True
