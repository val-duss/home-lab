from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Table
from sqlalchemy.orm import relationship

from database import Base

todo_labels = Table(
    "todo_labels",
    Base.metadata,
    Column("todo_id", Integer, ForeignKey("todos.id"), primary_key=True),
    Column("label_id", Integer, ForeignKey("labels.id"), primary_key=True),
)

note_labels = Table(
    "note_labels",
    Base.metadata,
    Column("note_id", Integer, ForeignKey("notes.id"), primary_key=True),
    Column("label_id", Integer, ForeignKey("labels.id"), primary_key=True),
)


class Category(Base):
    __tablename__ = "categories"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    todos = relationship("Todo", back_populates="category")


class Label(Base):
    __tablename__ = "labels"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    todos = relationship("Todo", secondary=todo_labels, back_populates="labels")


class Todo(Base):
    __tablename__ = "todos"
    id = Column(Integer, primary_key=True, index=True)
    text = Column(String, nullable=False)
    done = Column(Boolean, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    category = relationship("Category", back_populates="todos")
    labels = relationship("Label", secondary=todo_labels, back_populates="todos")


class WishlistItem(Base):
    __tablename__ = "wishlist_items"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    amount = Column(Float, nullable=False)
    # Priorité de financement : 1 = basse, 2 = moyenne, 3 = haute
    priority = Column(Integer, nullable=False, default=2)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=True)
    account = relationship("Account")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class Account(Base):
    __tablename__ = "accounts"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    kind = Column(String, nullable=False, default="courant")  # "courant" | "livret"
    balance = Column(Float, nullable=False, default=0.0)
    currency = Column(String, nullable=False, default="EUR")
    source = Column(String, nullable=False, default="manual")  # "manual" | "gocardless"
    institution_name = Column(String, nullable=True)
    external_account_id = Column(String, nullable=True, unique=True)
    last_synced_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class BalanceHistory(Base):
    __tablename__ = "balance_history"
    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    balance = Column(Float, nullable=False)
    currency = Column(String, nullable=False, default="EUR")
    recorded_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class StockHolding(Base):
    __tablename__ = "stock_holdings"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    ticker = Column(String, nullable=True)
    quantity = Column(Float, nullable=False)
    purchase_price = Column(Float, nullable=False)
    current_price = Column(Float, nullable=False)
    currency = Column(String, nullable=False, default="EUR")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class Note(Base):
    __tablename__ = "notes"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=True)
    content = Column(String, nullable=False, default="")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
    labels = relationship("Label", secondary=note_labels)
