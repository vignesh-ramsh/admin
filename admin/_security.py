"""
admin._security
-----------------
Password hashing/strength and token/prefix generation — reimplemented here
against the same libraries and documented formats authn's own CLI uses
(argon2-cffi, zxcvbn, secrets.token_urlsafe, sha256), rather than importing
authn's internal module, per this plugin's explicit self-containment.

None of this is authn business "logic" that could drift in a way that
matters — it's direct library calls plus two documented protocol
constants (authn.KEY_PREFIX_LEN=12, the "ak_" access-key prefix). The
actual security-sensitive invariants (has_roles validation, cache
invalidation on role/status change, the audit trail) live in authn's own
TABLE-level hooks/triggers (authn/hooks/_users.py, _access_keys.py),
registered once at authn's own boot time — they fire on any
arc.relay.save()/delete() call against those tables regardless of which
plugin makes it. Admin inherits all of that for free by writing through
Relay, never through raw SQL.
"""

from __future__ import annotations

import hashlib
import secrets

# Must match authn/authn/__init__.py's KEY_PREFIX_LEN exactly — that's what
# _resolve_api_key's own parsing (`prefix = raw[:KEY_PREFIX_LEN]`) expects
# when a key minted here is later presented on a real request.
ACCESS_KEY_PREFIX_LEN = 12


def hash_password(password: str) -> str:
    from argon2 import PasswordHasher

    return PasswordHasher().hash(password)


def check_password_strength(password: str, *, min_score: int, user_inputs: list[str] | None = None) -> None:
    """Raises ValueError with a clear message if too weak — same zxcvbn
    scoring authn.validate_password_strength does."""
    from zxcvbn import zxcvbn

    result = zxcvbn(password, user_inputs=user_inputs or [])
    if result["score"] < min_score:
        feedback = result.get("feedback") or {}
        warning = feedback.get("warning") or "password is too weak"
        suggestions = "; ".join(feedback.get("suggestions") or [])
        detail = warning + (f" ({suggestions})" if suggestions else "")
        raise ValueError(f"password does not meet the minimum strength requirement: {detail}")


def hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def new_access_key() -> tuple[str, str, str]:
    """Returns (raw_key, key_prefix, key_hash). Format ("ak_" + 43 url-safe
    chars) and prefix length must match authn's _resolve_api_key parsing
    exactly, or a key minted here would never authenticate."""
    raw = "ak_" + secrets.token_urlsafe(32)
    prefix = raw[:ACCESS_KEY_PREFIX_LEN]
    return raw, prefix, hash_token(raw)


def has_roles_subset(candidate: list[str] | None, allowed: list[str] | None) -> bool:
    return set(candidate or []) <= set(allowed or [])
