import hashlib
import json
import os
import secrets

DATA_DIR = os.getenv("DATA_DIR", "/app/data")
STATE_FILE = os.path.join(DATA_DIR, "auth_state.json")

DEFAULT_PIN = "000000"
MAX_ATTEMPTS = 4
PBKDF2_ITERATIONS = 100_000


def _hash_pin(pin: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", pin.encode(), bytes.fromhex(salt), PBKDF2_ITERATIONS).hex()


def _default_state() -> dict:
    salt = secrets.token_hex(16)
    return {
        "pin_hash": _hash_pin(DEFAULT_PIN, salt),
        "pin_salt": salt,
        "must_change": True,
        "failed_attempts": 0,
        "locked": False,
    }


def _save_state(state: dict) -> None:
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(STATE_FILE, "w") as f:
        json.dump(state, f)


def _load_state() -> dict:
    if not os.path.exists(STATE_FILE):
        state = _default_state()
        _save_state(state)
        return state
    with open(STATE_FILE) as f:
        return json.load(f)


def is_locked() -> bool:
    return _load_state()["locked"]


def remaining_attempts() -> int:
    state = _load_state()
    return max(0, MAX_ATTEMPTS - state["failed_attempts"])


def verify_pin(pin: str) -> tuple[bool, bool]:
    """Vérifie le PIN. Retourne (succès, must_change). Le verrou doit être vérifié en amont."""
    state = _load_state()
    if _hash_pin(pin, state["pin_salt"]) == state["pin_hash"]:
        state["failed_attempts"] = 0
        _save_state(state)
        return True, state["must_change"]

    state["failed_attempts"] += 1
    if state["failed_attempts"] >= MAX_ATTEMPTS:
        state["locked"] = True
    _save_state(state)
    return False, False


def change_pin(new_pin: str) -> None:
    state = _load_state()
    salt = secrets.token_hex(16)
    state["pin_hash"] = _hash_pin(new_pin, salt)
    state["pin_salt"] = salt
    state["must_change"] = False
    state["failed_attempts"] = 0
    _save_state(state)
