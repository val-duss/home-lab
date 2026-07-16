import os
import time

import httpx

import storage

BASE_URL = "https://bankaccountdata.gocardless.com/api/v2"
SECRET_ID = os.getenv("GOCARDLESS_SECRET_ID", "")
SECRET_KEY = os.getenv("GOCARDLESS_SECRET_KEY", "")
REDIRECT_URI = os.getenv("GOCARDLESS_REDIRECT_URI", "http://localhost:8000/finance/link-callback")


async def _get_access_token() -> str:
    token_data = storage.load_gocardless_token()
    now = time.time()

    if token_data and now < token_data.get("access_expires_at", 0):
        return token_data["access"]

    async with httpx.AsyncClient() as client:
        if token_data and now < token_data.get("refresh_expires_at", 0):
            resp = await client.post(f"{BASE_URL}/token/refresh/", json={"refresh": token_data["refresh"]})
            if resp.status_code == 200:
                data = resp.json()
                token_data["access"] = data["access"]
                token_data["access_expires_at"] = now + data["access_expires"] - 30
                storage.save_gocardless_token(token_data)
                return token_data["access"]

        resp = await client.post(
            f"{BASE_URL}/token/new/", json={"secret_id": SECRET_ID, "secret_key": SECRET_KEY}
        )
        resp.raise_for_status()
        data = resp.json()
        new_token = {
            "access": data["access"],
            "access_expires_at": now + data["access_expires"] - 30,
            "refresh": data["refresh"],
            "refresh_expires_at": now + data["refresh_expires"] - 30,
        }
        storage.save_gocardless_token(new_token)
        return new_token["access"]


async def list_institutions(country: str = "FR") -> list:
    token = await _get_access_token()
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{BASE_URL}/institutions/",
            params={"country": country},
            headers={"Authorization": f"Bearer {token}"},
        )
        resp.raise_for_status()
        return resp.json()


async def create_requisition(institution_id: str, reference: str) -> dict:
    token = await _get_access_token()
    headers = {"Authorization": f"Bearer {token}"}

    async with httpx.AsyncClient() as client:
        agreement_resp = await client.post(
            f"{BASE_URL}/agreements/enduser/",
            json={
                "institution_id": institution_id,
                "max_historical_days": 90,
                "access_valid_for_days": 90,
                "access_scope": ["balances", "details", "transactions"],
            },
            headers=headers,
        )
        agreement_resp.raise_for_status()
        agreement = agreement_resp.json()

        requisition_resp = await client.post(
            f"{BASE_URL}/requisitions/",
            json={
                "redirect": f"{REDIRECT_URI}?ref={reference}",
                "institution_id": institution_id,
                "reference": reference,
                "agreement": agreement["id"],
                "user_language": "FR",
            },
            headers=headers,
        )
        requisition_resp.raise_for_status()
        return requisition_resp.json()


async def get_requisition(requisition_id: str) -> dict:
    token = await _get_access_token()
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{BASE_URL}/requisitions/{requisition_id}/",
            headers={"Authorization": f"Bearer {token}"},
        )
        resp.raise_for_status()
        return resp.json()


async def get_account_balance(account_id: str) -> dict:
    token = await _get_access_token()
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{BASE_URL}/accounts/{account_id}/balances/",
            headers={"Authorization": f"Bearer {token}"},
        )
        resp.raise_for_status()
        return resp.json()


async def get_account_details(account_id: str) -> dict:
    token = await _get_access_token()
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{BASE_URL}/accounts/{account_id}/details/",
            headers={"Authorization": f"Bearer {token}"},
        )
        resp.raise_for_status()
        return resp.json()
