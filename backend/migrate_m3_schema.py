#!/usr/bin/env python3
"""
Migration script for M3: Add classification_batches table and extend classifications.
Run this after updating models.py to create the new tables/columns.

Usage:
    python3 migrate_m3_schema.py
    OR
    source .venv/bin/activate && python3 migrate_m3_schema.py
"""
import os
import sys
from pathlib import Path

# Add backend to path
backend_dir = Path(__file__).parent
sys.path.insert(0, str(backend_dir))

# Set SQLite DB URL for local dev
os.environ.setdefault("CCC_DB_URL", "sqlite:///./ccc.db")

try:
    from sqlalchemy import text
    from app.db import engine, Base
    from app.models import ClassificationBatch  # Import to register the model
except ImportError as e:
    print(f"Error: {e}")
    print("Please activate the virtual environment first:")
    print("  source .venv/bin/activate")
    print("  python3 migrate_m3_schema.py")
    sys.exit(1)


def migrate():
    """Create new tables and add columns."""
    print("Starting M3 schema migration...")
    
    with engine.connect() as conn:
        # Check if classification_batches table exists
        result = conn.execute(text(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='classification_batches'"
        ))
        if result.fetchone():
            print("  classification_batches table already exists, skipping creation.")
        else:
            print("  Creating classification_batches table...")
            ClassificationBatch.__table__.create(engine, checkfirst=True)
        
        # Check if batch_id column exists in classifications
        result = conn.execute(text("PRAGMA table_info(classifications)"))
        columns = [row[1] for row in result.fetchall()]
        
        if "batch_id" not in columns:
            print("  Adding batch_id column to classifications...")
            conn.execute(text("ALTER TABLE classifications ADD COLUMN batch_id INTEGER"))
            conn.execute(text(
                "CREATE INDEX IF NOT EXISTS idx_classifications_batch_id ON classifications(batch_id)"
            ))
        
        if "rejection_reason" not in columns:
            print("  Adding rejection_reason column to classifications...")
            conn.execute(text("ALTER TABLE classifications ADD COLUMN rejection_reason VARCHAR(1000)"))
        
        conn.commit()
        print("Migration complete!")


if __name__ == "__main__":
    migrate()
