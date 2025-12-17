from __future__ import annotations

import os
from contextlib import contextmanager
from typing import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, declarative_base, sessionmaker


DATABASE_URL = os.getenv("CCC_DB_URL", "postgresql://user:password@localhost:5432/ccc_db")

engine = create_engine(DATABASE_URL, future=True, echo=False)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)

Base = declarative_base()


@contextmanager
def get_session() -> Iterator[Session]:
    """Yield a SQLAlchemy session for use in request handlers or scripts."""
    session: Session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


