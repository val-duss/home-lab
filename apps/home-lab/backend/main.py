import os

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

import auth
import google_calendar as gcal
import storage

ACCESS_CODE = os.getenv("ACCESS_CODE", "change-me")

app = FastAPI(title="Home Lab API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AccessCodeRequest(BaseModel):
    code: str


def require_session(request: Request) -> None:
    token = request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
    if not token or not auth.verify_session_token(token):
        raise HTTPException(status_code=401, detail="Session invalide")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/")
def root():
    return {"message": "Home Lab API"}


@app.post("/auth/access")
def check_access_code(data: AccessCodeRequest):
    if data.code != ACCESS_CODE:
        raise HTTPException(status_code=401, detail="Code incorrect")
    return {"access_token": auth.create_session_token()}


@app.get("/calendar/status")
def calendar_status(_: None = Depends(require_session)):
    return {"connected": storage.load_google_token() is not None}


@app.get("/calendar/auth-url")
def calendar_auth_url(_: None = Depends(require_session)):
    return {"url": gcal.build_auth_url()}


@app.get("/calendar/oauth-callback", response_class=HTMLResponse)
async def calendar_oauth_callback(code: str):
    token_data = await gcal.exchange_code(code)
    storage.save_google_token(token_data)
    return "<p>Calendrier connecté avec succès. Tu peux fermer cette page.</p>"


@app.post("/calendar/disconnect")
def calendar_disconnect(_: None = Depends(require_session)):
    storage.clear_google_token()
    return {"connected": False}


@app.get("/calendar/events")
async def calendar_events(_: None = Depends(require_session)):
    token_data = storage.load_google_token()
    if not token_data:
        raise HTTPException(status_code=404, detail="Calendrier non connecté")

    refresh_token = token_data.get("refresh_token")
    if not refresh_token:
        raise HTTPException(status_code=500, detail="Aucun refresh token stocké")

    refreshed = await gcal.refresh_access_token(refresh_token)
    events = await gcal.list_events(refreshed["access_token"])
    return {"events": events}
