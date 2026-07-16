import os

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import declarative_base, sessionmaker

DATA_DIR = os.getenv("DATA_DIR", "/app/data")
SQLALCHEMY_DATABASE_URL = f"sqlite:///{DATA_DIR}/home-lab.db"

engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def run_migrations() -> None:
    """Patches columns added to existing models after their table was first created.

    `Base.metadata.create_all()` only creates missing tables — it never alters an
    already-existing table, so a new nullable column added to a model (e.g.
    WishlistItem.priority) silently never appears in a long-lived deployment's
    SQLite file, and every insert then fails with "no such column".
    """
    inspector = inspect(engine)
    with engine.begin() as conn:
        for table in Base.metadata.sorted_tables:
            if not inspector.has_table(table.name):
                continue
            existing_columns = {col["name"] for col in inspector.get_columns(table.name)}
            for column in table.columns:
                if column.name in existing_columns:
                    continue
                col_type = column.type.compile(dialect=engine.dialect)
                default_clause = ""
                if column.default is not None and column.default.is_scalar:
                    default_clause = f" DEFAULT {column.default.arg!r}"
                conn.execute(
                    text(f'ALTER TABLE "{table.name}" ADD COLUMN "{column.name}" {col_type}{default_clause}')
                )
