import secrets
from datetime import datetime, timezone
from typing import List, Optional

import httpx
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

import auth
import gocardless
import google_calendar as gcal
import models
import news
import pin_auth
import storage
from database import engine, get_db

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Home Lab API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AccessRequest(BaseModel):
    pin: str


class ChangePinRequest(BaseModel):
    new_pin: str

    @field_validator("new_pin")
    @classmethod
    def validate_new_pin(cls, v: str) -> str:
        if not v.isdigit() or len(v) != 6:
            raise ValueError("Le code doit contenir exactement 6 chiffres")
        return v


class CategoryCreate(BaseModel):
    name: str


class TodoCreate(BaseModel):
    text: str
    category_id: Optional[int] = None
    labels: List[str] = []


class TodoUpdate(BaseModel):
    text: Optional[str] = None
    done: Optional[bool] = None
    category_id: Optional[int] = None
    labels: Optional[List[str]] = None


class WishlistItemCreate(BaseModel):
    name: str
    amount: float


class WishlistItemUpdate(BaseModel):
    name: Optional[str] = None
    amount: Optional[float] = None


class AccountCreate(BaseModel):
    name: str
    kind: str = "courant"
    balance: float = 0.0
    currency: str = "EUR"


class AccountUpdate(BaseModel):
    name: Optional[str] = None
    kind: Optional[str] = None
    balance: Optional[float] = None


class StockHoldingCreate(BaseModel):
    name: str
    ticker: Optional[str] = None
    quantity: float
    purchase_price: float
    current_price: float
    currency: str = "EUR"


class StockHoldingUpdate(BaseModel):
    name: Optional[str] = None
    ticker: Optional[str] = None
    quantity: Optional[float] = None
    purchase_price: Optional[float] = None
    current_price: Optional[float] = None


class LinkBankRequest(BaseModel):
    institution_id: str


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
def check_access_code(data: AccessRequest):
    if pin_auth.is_locked():
        raise HTTPException(
            status_code=423,
            detail="Application verrouillée. Déblocage uniquement via accès machine.",
        )

    ok, must_change = pin_auth.verify_pin(data.pin)
    if not ok:
        if pin_auth.is_locked():
            raise HTTPException(
                status_code=423,
                detail="Trop de tentatives. Application verrouillée, déblocage uniquement via accès machine.",
            )
        raise HTTPException(
            status_code=401,
            detail=f"Code incorrect. Tentatives restantes : {pin_auth.remaining_attempts()}",
        )

    return {"access_token": auth.create_session_token(), "must_change": must_change}


@app.post("/auth/change-pin")
def change_pin(data: ChangePinRequest, _: None = Depends(require_session)):
    pin_auth.change_pin(data.new_pin)
    return {"ok": True}


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


def get_or_create_label(db: Session, name: str) -> models.Label:
    name = name.strip()
    label = db.query(models.Label).filter(models.Label.name == name).first()
    if not label:
        label = models.Label(name=name)
        db.add(label)
        db.flush()
    return label


def serialize_todo(todo: models.Todo) -> dict:
    return {
        "id": todo.id,
        "text": todo.text,
        "done": todo.done,
        "created_at": todo.created_at.isoformat() if todo.created_at else None,
        "category": {"id": todo.category.id, "name": todo.category.name} if todo.category else None,
        "labels": [{"id": label.id, "name": label.name} for label in todo.labels],
    }


@app.get("/categories")
def list_categories(db: Session = Depends(get_db), _: None = Depends(require_session)):
    categories = db.query(models.Category).order_by(models.Category.name).all()
    return [{"id": c.id, "name": c.name} for c in categories]


@app.post("/categories", status_code=201)
def create_category(
    data: CategoryCreate, db: Session = Depends(get_db), _: None = Depends(require_session)
):
    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Nom requis")
    if db.query(models.Category).filter(models.Category.name == name).first():
        raise HTTPException(status_code=400, detail="Catégorie déjà existante")
    category = models.Category(name=name)
    db.add(category)
    db.commit()
    db.refresh(category)
    return {"id": category.id, "name": category.name}


@app.delete("/categories/{category_id}", status_code=204)
def delete_category(
    category_id: int, db: Session = Depends(get_db), _: None = Depends(require_session)
):
    category = db.query(models.Category).filter(models.Category.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Catégorie introuvable")
    db.delete(category)
    db.commit()


@app.get("/todos")
def list_todos(db: Session = Depends(get_db), _: None = Depends(require_session)):
    todos = db.query(models.Todo).order_by(models.Todo.created_at.desc()).all()
    return [serialize_todo(t) for t in todos]


@app.post("/todos", status_code=201)
def create_todo(
    data: TodoCreate, db: Session = Depends(get_db), _: None = Depends(require_session)
):
    text = data.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Texte requis")
    todo = models.Todo(text=text, category_id=data.category_id)
    todo.labels = [get_or_create_label(db, name) for name in data.labels if name.strip()]
    db.add(todo)
    db.commit()
    db.refresh(todo)
    return serialize_todo(todo)


@app.patch("/todos/{todo_id}")
def update_todo(
    todo_id: int,
    data: TodoUpdate,
    db: Session = Depends(get_db),
    _: None = Depends(require_session),
):
    todo = db.query(models.Todo).filter(models.Todo.id == todo_id).first()
    if not todo:
        raise HTTPException(status_code=404, detail="Tâche introuvable")
    if data.text is not None:
        todo.text = data.text.strip()
    if data.done is not None:
        todo.done = data.done
    if data.category_id is not None:
        todo.category_id = data.category_id
    if data.labels is not None:
        todo.labels = [get_or_create_label(db, name) for name in data.labels if name.strip()]
    db.commit()
    db.refresh(todo)
    return serialize_todo(todo)


@app.delete("/todos/{todo_id}", status_code=204)
def delete_todo(todo_id: int, db: Session = Depends(get_db), _: None = Depends(require_session)):
    todo = db.query(models.Todo).filter(models.Todo.id == todo_id).first()
    if not todo:
        raise HTTPException(status_code=404, detail="Tâche introuvable")
    db.delete(todo)
    db.commit()


def serialize_wishlist_item(item: models.WishlistItem) -> dict:
    return {
        "id": item.id,
        "name": item.name,
        "amount": item.amount,
        "created_at": item.created_at.isoformat() if item.created_at else None,
    }


@app.get("/wishlist")
def list_wishlist(db: Session = Depends(get_db), _: None = Depends(require_session)):
    items = db.query(models.WishlistItem).order_by(models.WishlistItem.created_at.desc()).all()
    return [serialize_wishlist_item(i) for i in items]


@app.post("/wishlist", status_code=201)
def create_wishlist_item(
    data: WishlistItemCreate, db: Session = Depends(get_db), _: None = Depends(require_session)
):
    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Nom requis")
    if data.amount < 0:
        raise HTTPException(status_code=400, detail="Le montant ne peut pas être négatif")
    item = models.WishlistItem(name=name, amount=data.amount)
    db.add(item)
    db.commit()
    db.refresh(item)
    return serialize_wishlist_item(item)


@app.patch("/wishlist/{item_id}")
def update_wishlist_item(
    item_id: int,
    data: WishlistItemUpdate,
    db: Session = Depends(get_db),
    _: None = Depends(require_session),
):
    item = db.query(models.WishlistItem).filter(models.WishlistItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Article introuvable")
    if data.name is not None:
        item.name = data.name.strip()
    if data.amount is not None:
        if data.amount < 0:
            raise HTTPException(status_code=400, detail="Le montant ne peut pas être négatif")
        item.amount = data.amount
    db.commit()
    db.refresh(item)
    return serialize_wishlist_item(item)


@app.delete("/wishlist/{item_id}", status_code=204)
def delete_wishlist_item(
    item_id: int, db: Session = Depends(get_db), _: None = Depends(require_session)
):
    item = db.query(models.WishlistItem).filter(models.WishlistItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Article introuvable")
    db.delete(item)
    db.commit()


@app.get("/news/categories")
def news_categories(_: None = Depends(require_session)):
    sources = news.load_sources()
    return [{"key": key, "label": val["label"]} for key, val in sources.items()]


@app.get("/news")
def news_articles(category: Optional[str] = None, _: None = Depends(require_session)):
    sources = news.load_sources()
    if category:
        if category not in sources:
            raise HTTPException(status_code=404, detail="Catégorie inconnue")
        return {category: news.get_category_articles(category, sources[category]["sources"])}
    return {key: news.get_category_articles(key, val["sources"]) for key, val in sources.items()}


def serialize_account(account: models.Account) -> dict:
    return {
        "id": account.id,
        "name": account.name,
        "kind": account.kind,
        "balance": account.balance,
        "currency": account.currency,
        "source": account.source,
        "institution_name": account.institution_name,
        "last_synced_at": account.last_synced_at.isoformat() if account.last_synced_at else None,
    }


def serialize_stock(stock: models.StockHolding) -> dict:
    return {
        "id": stock.id,
        "name": stock.name,
        "ticker": stock.ticker,
        "quantity": stock.quantity,
        "purchase_price": stock.purchase_price,
        "current_price": stock.current_price,
        "currency": stock.currency,
        "value": round(stock.quantity * stock.current_price, 2),
    }


@app.get("/finance/accounts")
def list_accounts(db: Session = Depends(get_db), _: None = Depends(require_session)):
    accounts = db.query(models.Account).order_by(models.Account.created_at.desc()).all()
    return [serialize_account(a) for a in accounts]


@app.post("/finance/accounts", status_code=201)
def create_account(
    data: AccountCreate, db: Session = Depends(get_db), _: None = Depends(require_session)
):
    if data.kind not in ("courant", "livret"):
        raise HTTPException(status_code=400, detail="Type de compte invalide")
    account = models.Account(
        name=data.name.strip(),
        kind=data.kind,
        balance=data.balance,
        currency=data.currency,
        source="manual",
    )
    db.add(account)
    db.commit()
    db.refresh(account)
    return serialize_account(account)


@app.patch("/finance/accounts/{account_id}")
def update_account(
    account_id: int,
    data: AccountUpdate,
    db: Session = Depends(get_db),
    _: None = Depends(require_session),
):
    account = db.query(models.Account).filter(models.Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Compte introuvable")
    if account.source == "gocardless" and data.balance is not None:
        raise HTTPException(
            status_code=400, detail="Solde géré automatiquement par la synchronisation bancaire"
        )
    if data.name is not None:
        account.name = data.name.strip()
    if data.kind is not None:
        if data.kind not in ("courant", "livret"):
            raise HTTPException(status_code=400, detail="Type de compte invalide")
        account.kind = data.kind
    if data.balance is not None:
        account.balance = data.balance
    db.commit()
    db.refresh(account)
    return serialize_account(account)


@app.delete("/finance/accounts/{account_id}", status_code=204)
def delete_account(
    account_id: int, db: Session = Depends(get_db), _: None = Depends(require_session)
):
    account = db.query(models.Account).filter(models.Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Compte introuvable")
    db.delete(account)
    db.commit()


@app.get("/finance/stocks")
def list_stocks(db: Session = Depends(get_db), _: None = Depends(require_session)):
    stocks = db.query(models.StockHolding).order_by(models.StockHolding.created_at.desc()).all()
    return [serialize_stock(s) for s in stocks]


@app.post("/finance/stocks", status_code=201)
def create_stock(
    data: StockHoldingCreate, db: Session = Depends(get_db), _: None = Depends(require_session)
):
    stock = models.StockHolding(**data.model_dump())
    db.add(stock)
    db.commit()
    db.refresh(stock)
    return serialize_stock(stock)


@app.patch("/finance/stocks/{stock_id}")
def update_stock(
    stock_id: int,
    data: StockHoldingUpdate,
    db: Session = Depends(get_db),
    _: None = Depends(require_session),
):
    stock = db.query(models.StockHolding).filter(models.StockHolding.id == stock_id).first()
    if not stock:
        raise HTTPException(status_code=404, detail="Position introuvable")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(stock, field, value)
    db.commit()
    db.refresh(stock)
    return serialize_stock(stock)


@app.delete("/finance/stocks/{stock_id}", status_code=204)
def delete_stock(stock_id: int, db: Session = Depends(get_db), _: None = Depends(require_session)):
    stock = db.query(models.StockHolding).filter(models.StockHolding.id == stock_id).first()
    if not stock:
        raise HTTPException(status_code=404, detail="Position introuvable")
    db.delete(stock)
    db.commit()


@app.get("/finance/institutions")
async def finance_institutions(country: str = "FR", _: None = Depends(require_session)):
    try:
        return await gocardless.list_institutions(country)
    except httpx.HTTPError as e:
        raise HTTPException(
            status_code=502, detail=f"Impossible de joindre GoCardless : {e}"
        )


@app.post("/finance/link")
async def finance_link(data: LinkBankRequest, _: None = Depends(require_session)):
    reference = secrets.token_hex(16)
    try:
        requisition = await gocardless.create_requisition(data.institution_id, reference)
    except httpx.HTTPError as e:
        raise HTTPException(
            status_code=502, detail=f"Impossible de joindre GoCardless : {e}"
        )
    storage.save_requisition_ref(reference, requisition["id"])
    return {"link": requisition["link"]}


@app.get("/finance/link-callback", response_class=HTMLResponse)
async def finance_link_callback(ref: str, db: Session = Depends(get_db)):
    requisition_id = storage.get_requisition_id(ref)
    if not requisition_id:
        return "<p>Lien invalide ou expiré.</p>"

    requisition = await gocardless.get_requisition(requisition_id)
    if requisition.get("status") != "LN":
        return f"<p>Statut de connexion : {requisition.get('status')}. Réessaie si besoin.</p>"

    for account_id in requisition.get("accounts", []):
        existing = (
            db.query(models.Account).filter(models.Account.external_account_id == account_id).first()
        )
        if existing:
            continue
        try:
            details = await gocardless.get_account_details(account_id)
            balance_data = await gocardless.get_account_balance(account_id)
        except Exception:
            continue

        account_name = (
            details.get("account", {}).get("name")
            or details.get("account", {}).get("iban")
            or "Compte lié"
        )
        balances = balance_data.get("balances", [])
        amount = float(balances[0]["balanceAmount"]["amount"]) if balances else 0.0
        currency = balances[0]["balanceAmount"]["currency"] if balances else "EUR"

        account = models.Account(
            name=account_name,
            kind="courant",
            balance=amount,
            currency=currency,
            source="gocardless",
            external_account_id=account_id,
            last_synced_at=datetime.now(timezone.utc),
        )
        db.add(account)
    db.commit()

    return "<p>Compte(s) bancaire(s) lié(s) avec succès. Tu peux fermer cette page.</p>"


@app.post("/finance/sync")
async def finance_sync(db: Session = Depends(get_db), _: None = Depends(require_session)):
    accounts = db.query(models.Account).filter(models.Account.source == "gocardless").all()
    updated = []
    for account in accounts:
        try:
            balance_data = await gocardless.get_account_balance(account.external_account_id)
        except Exception:
            continue
        balances = balance_data.get("balances", [])
        if balances:
            account.balance = float(balances[0]["balanceAmount"]["amount"])
            account.currency = balances[0]["balanceAmount"]["currency"]
        account.last_synced_at = datetime.now(timezone.utc)
        updated.append(account.id)
    db.commit()
    return {"updated": updated}
