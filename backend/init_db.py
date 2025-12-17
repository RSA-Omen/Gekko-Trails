"""
Tiny DB bootstrap script for the CCC domain.

- Reads CCC_DB_URL (or falls back to a local default).
- Creates all tables defined in app.models.Base metadata.

Usage (from backend/):
  python init_db.py
"""

from app.db import Base, engine
from app import models  # noqa: F401  - ensure models are imported so metadata is populated


def main() -> None:
    Base.metadata.create_all(bind=engine)
    print("CCC domain tables created (or already exist).")


if __name__ == "__main__":
    main()


