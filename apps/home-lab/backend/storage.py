import json
import os

DATA_DIR = os.getenv("DATA_DIR", "/app/data")
GOOGLE_TOKEN_FILE = os.path.join(DATA_DIR, "google_token.json")


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
