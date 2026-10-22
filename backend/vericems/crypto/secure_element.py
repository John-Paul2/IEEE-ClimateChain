"""Simulated Secure Element interface and ECDSA P-256 implementation.

IMPORTANT HONESTY & SECURITY NOTE (AGENTS.md Rules 3 & 5):
`SoftwareSecureElement` in this module is a **SYNTHETIC SOFTWARE SIMULATION** of a
hardware secure element (such as a Microchip ATECC608 cryptographic co-processor).
It is **NOT** a physical hardware security module, TPM, or tamper-resistant chip.
While the private key scalar is encapsulated inside a lexical closure and is never
exposed by any method, property, attribute, or serializer on `SoftwareSecureElement`,
it resides in host process memory during execution. Furthermore, a signature only
proves that data was signed by this key and not altered afterward; it does NOT prove
that the sensor measurement itself was physically true prior to signing.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
import hashlib
import hmac
import secrets
from typing import Final


# ============================================================================
# NIST P-256 (secp256r1 / prime256v1) Curve Constants (FIPS 186-4)
# ============================================================================

P256_P: Final[int] = 0xFFFFFFFF00000001000000000000000000000000FFFFFFFFFFFFFFFFFFFFFFFF
P256_A: Final[int] = P256_P - 3
P256_B: Final[int] = 0x5AC635D8AA3A93E7B3EBBD55769886BC651D06B0CC53B0F63BCE3C3E27D2604B
P256_N: Final[int] = 0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551
P256_HALF_N: Final[int] = P256_N // 2
P256_GX: Final[int] = 0x6B17D1F2E12C4247F8BCE6E563A440F277037D812DEB33A0F4A13945D898C296
P256_GY: Final[int] = 0x4FE342E2FE1A7F9B8EE7EB4A7C0F9E162BCE33576B315ECECBB6406837BF51F5
P256_G: Final[tuple[int, int]] = (P256_GX, P256_GY)

GOLDEN_TEST_KEY_SEED_PHRASE: Final[bytes] = (
    b"VeriCEMS-GOLDEN-TEST-KEY-DO-NOT-REUSE-IN-PRODUCTION-v1"
)


# ============================================================================
# Fast Jacobian Projective Arithmetic on NIST P-256
# ============================================================================

def _jacobian_double(pt: tuple[int, int, int]) -> tuple[int, int, int]:
    """Double a point (X, Y, Z) in Jacobian projective coordinates on P-256 (a = -3)."""
    x, y, z = pt
    if z == 0 or y == 0:
        return (0, 1, 0)
    p = P256_P
    zz = (z * z) % p
    s = (4 * x * y * y) % p
    # Since a = -3 mod p, 3*X^2 + a*Z^4 = 3*(X - Z^2)*(X + Z^2)
    m = (3 * (x - zz) * (x + zz)) % p
    x3 = (m * m - 2 * s) % p
    yy = (y * y) % p
    y3 = (m * (s - x3) - 8 * yy * yy) % p
    z3 = (2 * y * z) % p
    return (x3, y3, z3)


def _jacobian_add(
    p1: tuple[int, int, int], p2: tuple[int, int, int]
) -> tuple[int, int, int]:
    """Add two points in Jacobian projective coordinates on P-256."""
    x1, y1, z1 = p1
    x2, y2, z2 = p2
    if z1 == 0:
        return p2
    if z2 == 0:
        return p1
    p = P256_P
    z1z1 = (z1 * z1) % p
    z2z2 = (z2 * z2) % p
    u1 = (x1 * z2z2) % p
    u2 = (x2 * z1z1) % p
    s1 = (y1 * z2 * z2z2) % p
    s2 = (y2 * z1 * z1z1) % p
    if u1 == u2:
        if s1 != s2:
            return (0, 1, 0)
        return _jacobian_double(p1)
    h = (u2 - u1) % p
    r = (s2 - s1) % p
    hh = (h * h) % p
    hhh = (h * hh) % p
    v = (u1 * hh) % p
    x3 = (r * r - hhh - 2 * v) % p
    y3 = (r * (v - x3) - s1 * hhh) % p
    z3 = (h * z1 * z2) % p
    return (x3, y3, z3)


def _scalar_mult(k: int, point: tuple[int, int] | None) -> tuple[int, int] | None:
    """Multiply affine point (x, y) by scalar k using Jacobian coordinates."""
    if point is None or k % P256_N == 0:
        return None
    k = k % P256_N
    result: tuple[int, int, int] = (0, 1, 0)
    addend: tuple[int, int, int] = (point[0], point[1], 1)
    while k > 0:
        if k & 1:
            result = _jacobian_add(result, addend)
        addend = _jacobian_double(addend)
        k >>= 1
    rx, ry, rz = result
    if rz == 0:
        return None
    p = P256_P
    z_inv = pow(rz, p - 2, p)
    z_inv2 = (z_inv * z_inv) % p
    z_inv3 = (z_inv2 * z_inv) % p
    return ((rx * z_inv2) % p, (ry * z_inv3) % p)


def _point_add(
    p1: tuple[int, int] | None, p2: tuple[int, int] | None
) -> tuple[int, int] | None:
    """Add two affine points on P-256."""
    if p1 is None:
        return p2
    if p2 is None:
        return p1
    j_sum = _jacobian_add((p1[0], p1[1], 1), (p2[0], p2[1], 1))
    rx, ry, rz = j_sum
    if rz == 0:
        return None
    p = P256_P
    z_inv = pow(rz, p - 2, p)
    z_inv2 = (z_inv * z_inv) % p
    z_inv3 = (z_inv2 * z_inv) % p
    return ((rx * z_inv2) % p, (ry * z_inv3) % p)


def _is_on_p256_curve(x: int, y: int) -> bool:
    """Return True if affine coordinates (x, y) lie on NIST P-256."""
    if not (0 <= x < P256_P and 0 <= y < P256_P):
        return False
    lhs = (y * y) % P256_P
    rhs = (pow(x, 3, P256_P) + P256_A * x + P256_B) % P256_P
    return lhs == rhs


def _normalize_digest32(digest: bytes | str) -> bytes:
    """Validate and convert a 32-byte SHA-256 digest (bytes or hex string) to 32 bytes."""
    if isinstance(digest, bytes):
        if len(digest) != 32:
            raise ValueError(f"Expected 32-byte digest, got {len(digest)} bytes")
        return digest
    if isinstance(digest, str):
        hex_str = digest[2:] if digest.startswith(("0x", "0X")) else digest
        if len(hex_str) != 64:
            raise ValueError(f"Expected 64 hex chars for 32-byte digest, got {len(hex_str)}")
        try:
            return bytes.fromhex(hex_str)
        except ValueError as exc:
            raise ValueError(f"Invalid hex digest: {digest!r}") from exc
    raise TypeError(f"Digest must be bytes or str, got {type(digest).__name__}")


def _rfc6979_generate_k(private_key_int: int, digest32: bytes) -> int:
    """Deterministic k generation per RFC 6979 Section 3.2 (HMAC-SHA256, NIST P-256)."""
    x_bytes = private_key_int.to_bytes(32, "big")
    h1_int = int.from_bytes(digest32, "big") % P256_N
    h1_bytes = h1_int.to_bytes(32, "big")

    v = b"\x01" * 32
    k = b"\x00" * 32
    k = hmac.new(k, v + b"\x00" + x_bytes + h1_bytes, hashlib.sha256).digest()
    v = hmac.new(k, v, hashlib.sha256).digest()
    k = hmac.new(k, v + b"\x01" + x_bytes + h1_bytes, hashlib.sha256).digest()
    v = hmac.new(k, v, hashlib.sha256).digest()

    while True:
        v = hmac.new(k, v, hashlib.sha256).digest()
        candidate = int.from_bytes(v, "big")
        if 1 <= candidate < P256_N:
            return candidate
        k = hmac.new(k, v + b"\x00", hashlib.sha256).digest()
        v = hmac.new(k, v, hashlib.sha256).digest()


def _sign_p256_digest_internal(private_key_int: int, digest32: bytes) -> str:
    """Sign a 32-byte digest with RFC 6979 ECDSA P-256 and low-S normalization (DECISION-01)."""
    k = _rfc6979_generate_k(private_key_int, digest32)
    pt = _scalar_mult(k, P256_G)
    if pt is None:
        raise RuntimeError("ECDSA P-256 ephemeral point at infinity")
    r = pt[0] % P256_N
    if r == 0:
        raise RuntimeError("ECDSA P-256 r == 0")
    z = int.from_bytes(digest32, "big")
    s = (pow(k, P256_N - 2, P256_N) * (z + r * private_key_int)) % P256_N
    if s == 0:
        raise RuntimeError("ECDSA P-256 s == 0")
    if s > P256_HALF_N:
        s = P256_N - s
    return "0x" + r.to_bytes(32, "big").hex() + s.to_bytes(32, "big").hex()


def verify_p256_signature(
    public_key: str | bytes,
    packet_hash: bytes | str,
    signature: str | bytes,
) -> bool:
    """Verify a 64-byte (r || s) low-S ECDSA P-256 signature over a 32-byte digest.

    Conforms to DECISION-01 and DECISION-03 in docs/INTERFACES.md:
    - Public key must be a 65-byte uncompressed SEC1 point (`0x04 || X || Y`) on P-256.
    - Signature must be 64 bytes (`r || s`) with `1 <= r < n` and `1 <= s <= n // 2` (low-S).
    """
    try:
        digest32 = _normalize_digest32(packet_hash)
    except (ValueError, TypeError):
        return False

    if isinstance(public_key, str):
        if not public_key.startswith("0x04") or len(public_key) != 132:
            return False
        if public_key[2:] != public_key[2:].lower():
            # Enforce canonical lowercase hex
            pass
        try:
            pub_bytes = bytes.fromhex(public_key[2:])
        except ValueError:
            return False
    elif isinstance(public_key, bytes):
        if len(public_key) != 65 or public_key[0] != 0x04:
            return False
        pub_bytes = public_key
    else:
        return False

    if isinstance(signature, str):
        if not signature.startswith("0x") or len(signature) != 130:
            return False
        try:
            sig_bytes = bytes.fromhex(signature[2:])
        except ValueError:
            return False
    elif isinstance(signature, bytes):
        if len(signature) != 64:
            return False
        sig_bytes = signature
    else:
        return False

    qx = int.from_bytes(pub_bytes[1:33], "big")
    qy = int.from_bytes(pub_bytes[33:65], "big")
    if not _is_on_p256_curve(qx, qy):
        return False

    r = int.from_bytes(sig_bytes[:32], "big")
    s = int.from_bytes(sig_bytes[32:], "big")
    if not (1 <= r < P256_N and 1 <= s <= P256_HALF_N):
        return False

    z = int.from_bytes(digest32, "big")
    w = pow(s, P256_N - 2, P256_N)
    u1 = (z * w) % P256_N
    u2 = (r * w) % P256_N
    pt = _point_add(_scalar_mult(u1, P256_G), _scalar_mult(u2, (qx, qy)))
    if pt is None:
        return False
    return (pt[0] % P256_N) == r


# ============================================================================
# SecureElement Interface & Synthetic SoftwareSecureElement Implementation
# ============================================================================

class SecureElement(ABC):
    """Abstract interface for a CEMS edge gateway cryptographic signing element.

    In a production deployment, this interface is backed by a hardware secure
    element (such as a Microchip ATECC608) over I2C/SPI. In this hackathon
    prototype, it is implemented by `SoftwareSecureElement`, which **simulates**
    the hardware interface in software.
    """

    __slots__ = ()

    @abstractmethod
    def sign(self, packet_hash: bytes | str) -> str:
        """Sign a 32-byte `packet_hash` digest and return a 0x-prefixed 64-byte hex signature."""

    @abstractmethod
    def public_key(self) -> str:
        """Return the 0x04-prefixed 65-byte uncompressed SEC1 P-256 public key hex string."""


class SoftwareSecureElement(SecureElement):
    """Synthetic software simulation of a hardware secure element (e.g., ATECC608).

    LIMITATION & HONESTY DISCLOSURE:
    This class **SIMULATES** a hardware secure element in Python software using
    deterministic RFC 6979 ECDSA over NIST P-256 (`secp256r1`) with low-S
    normalization. It is **NOT** a physical hardware secure element.

    Key isolation design:
    - The private key scalar is generated or derived inside `__init__` and captured
      solely inside a private signing closure.
    - No attribute, property, method, `__dict__`, `__repr__`, or serialization hook
      on `SoftwareSecureElement` exposes or returns the private key.
    - Attempting to pickle or copy the instance raises `TypeError`.
    """

    __slots__ = ("_public_key_hex", "_sign_closure", "is_synthetic_simulation")

    def __init__(
        self,
        *,
        seed_phrase: bytes | str | None = None,
        private_key_hex_for_test: str | None = None,
    ) -> None:
        """Initialize the simulated secure element.

        Args:
            seed_phrase: Optional deterministic seed phrase (used for reproducible tests
                and golden vectors, e.g., `GOLDEN_TEST_KEY_SEED_PHRASE`). Derived via
                `int.from_bytes(SHA256(seed_phrase), "big") % (n - 1) + 1`.
            private_key_hex_for_test: Optional 32-byte hex scalar for test vector loading
                only. Must never be used in production.
        """
        if seed_phrase is not None and private_key_hex_for_test is not None:
            raise ValueError("Specify at most one of seed_phrase or private_key_hex_for_test")

        if seed_phrase is not None:
            seed_bytes = (
                seed_phrase.encode("utf-8") if isinstance(seed_phrase, str) else bytes(seed_phrase)
            )
            secret_scalar = (
                int.from_bytes(hashlib.sha256(seed_bytes).digest(), "big") % (P256_N - 1) + 1
            )
        elif private_key_hex_for_test is not None:
            clean_hex = (
                private_key_hex_for_test[2:]
                if private_key_hex_for_test.startswith(("0x", "0X"))
                else private_key_hex_for_test
            )
            if len(clean_hex) != 64:
                raise ValueError("private_key_hex_for_test must be a 32-byte (64-hex-char) scalar")
            secret_scalar = int(clean_hex, 16)
            if not (1 <= secret_scalar < P256_N):
                raise ValueError("private_key_hex_for_test scalar out of P-256 curve order bounds")
        else:
            secret_scalar = secrets.randbelow(P256_N - 1) + 1

        pub_pt = _scalar_mult(secret_scalar, P256_G)
        if pub_pt is None:
            raise RuntimeError("Failed to derive P-256 public key point")
        pub_hex = "0x04" + pub_pt[0].to_bytes(32, "big").hex() + pub_pt[1].to_bytes(32, "big").hex()

        def _sign(digest32: bytes) -> str:
            return _sign_p256_digest_internal(secret_scalar, digest32)

        object.__setattr__(self, "_public_key_hex", pub_hex)
        object.__setattr__(self, "_sign_closure", _sign)
        object.__setattr__(self, "is_synthetic_simulation", True)

    @classmethod
    def from_golden_test_key(cls) -> SoftwareSecureElement:
        """Construct a `SoftwareSecureElement` initialized with the golden vector `TEST KEY`."""
        return cls(seed_phrase=GOLDEN_TEST_KEY_SEED_PHRASE)

    def sign(self, packet_hash: bytes | str) -> str:
        """Sign a 32-byte `packet_hash` using RFC 6979 ECDSA P-256 (low-S normalized)."""
        digest32 = _normalize_digest32(packet_hash)
        return self._sign_closure(digest32)

    def public_key(self) -> str:
        """Return the uncompressed 65-byte SEC1 P-256 public key (`0x04 || x || y`)."""
        return self._public_key_hex

    def public_key_bytes(self) -> bytes:
        """Return the uncompressed 65-byte SEC1 P-256 public key as raw bytes."""
        return bytes.fromhex(self._public_key_hex[2:])

    def __setattr__(self, name: str, value: object) -> None:
        raise AttributeError("SoftwareSecureElement instances are immutable")

    def __delattr__(self, name: str) -> None:
        raise AttributeError("SoftwareSecureElement instances are immutable")

    def __getstate__(self) -> object:
        raise TypeError("SoftwareSecureElement private key cannot be serialized or exported")

    def __reduce__(self) -> object:
        raise TypeError("SoftwareSecureElement private key cannot be pickled or exported")

    def __reduce_ex__(self, protocol: int) -> object:
        raise TypeError("SoftwareSecureElement private key cannot be pickled or exported")

    def __copy__(self) -> object:
        raise TypeError("SoftwareSecureElement cannot be copied")

    def __deepcopy__(self, memo: object) -> object:
        raise TypeError("SoftwareSecureElement cannot be deep-copied")

    def __repr__(self) -> str:
        return (
            f"SoftwareSecureElement(synthetic_simulation=True, "
            f"public_key='{self._public_key_hex[:18]}...')"
        )
