from typing import List, Optional

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

import auth
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
