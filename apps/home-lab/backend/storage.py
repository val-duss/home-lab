import json
import os

DATA_DIR = os.getenv("DATA_DIR", "/app/data")
GOOGLE_TOKEN_FILE = os.path.join(DATA_DIR, "google_token.json")
GOCARDLESS_TOKEN_FILE = os.path.join(DATA_DIR, "gocardless_token.json")
GOCARDLESS_REQUISITIONS_FILE = os.path.join(DATA_DIR, "gocardless_requisitions.json")


def save_google_token(data: dict) -> None:
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(GOOGLE_TOKEN_FILE, "w") as f:
        json.dump(data, f)


def load_google_token() -> dict | None:
    if not os.path.exists(GOOGLE_TOKEN_FILE):
        return None
    with open(GOOGLE_TOKEN_FILE) as f:
        return json.load(f)


def clear_google_token() -> None:
    if os.path.exists(GOOGLE_TOKEN_FILE):
        os.remove(GOOGLE_TOKEN_FILE)


def save_gocardless_token(data: dict) -> None:
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(GOCARDLESS_TOKEN_FILE, "w") as f:
        json.dump(data, f)


def load_gocardless_token() -> dict | None:
    if not os.path.exists(GOCARDLESS_TOKEN_FILE):
        return None
    with open(GOCARDLESS_TOKEN_FILE) as f:
        return json.load(f)


def save_requisition_ref(reference: str, requisition_id: str) -> None:
    data = _load_requisitions()
    data[reference] = requisition_id
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(GOCARDLESS_REQUISITIONS_FILE, "w") as f:
        json.dump(data, f)


def get_requisition_id(reference: str) -> str | None:
    return _load_requisitions().get(reference)


def _load_requisitions() -> dict:
    if not os.path.exists(GOCARDLESS_REQUISITIONS_FILE):
        return {}
    with open(GOCARDLESS_REQUISITIONS_FILE) as f:
        return json.load(f)
