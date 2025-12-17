#!/usr/bin/env python3
"""
Migration script to update Cardholder table from display_name to name/surname/email structure.

Run this once after updating the model to migrate existing data.
"""
import os
import sys
from pathlib import Path

# Add backend to path
backend_dir = Path(__file__).parent
sys.path.insert(0, str(backend_dir))

# Set SQLite DB URL for local dev (same as app uses)
os.environ.setdefault("CCC_DB_URL", "sqlite:///./ccc.db")

from sqlalchemy import text
from app.db import engine


def migrate_cardholders():
    """
    Migrate existing cardholders from display_name to name/surname/email.
    """
    print("Starting cardholder migration...")
    
    with engine.connect() as conn:
        # Check if migration is needed (if name column doesn't exist)
        result = conn.execute(text("""
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name='cardholders'
        """))
        if not result.fetchone():
            print("Cardholders table doesn't exist yet. Run init_db.py first.")
            return
        
        # Check if name column exists
        result = conn.execute(text("PRAGMA table_info(cardholders)"))
        columns = [row[1] for row in result.fetchall()]
        
        if "name" in columns:
            print("Migration already applied (name column exists).")
            return
        
        print("Adding new columns: name, surname, email")
        conn.execute(text("ALTER TABLE cardholders ADD COLUMN name TEXT"))
        conn.execute(text("ALTER TABLE cardholders ADD COLUMN surname TEXT"))
        conn.execute(text("ALTER TABLE cardholders ADD COLUMN email TEXT"))
        conn.commit()
        
        print("Migrating existing display_name data...")
        # Get all cardholders with display_name
        result = conn.execute(text("SELECT id, display_name FROM cardholders WHERE display_name IS NOT NULL"))
        rows = result.fetchall()
        
        for cardholder_id, display_name in rows:
            if not display_name:
                continue
            
            # Parse display_name into name and surname
            parts = display_name.strip().split(maxsplit=1)
            if len(parts) == 2:
                name, surname = parts
            else:
                name = display_name
                surname = ""
            
            # Generate placeholder email
            email = f"{name.lower()}.{surname.lower()}@gekko.local" if surname else f"{name.lower()}@gekko.local"
            
            # Update the row
            conn.execute(text("""
                UPDATE cardholders 
                SET name = :name, surname = :surname, email = :email
                WHERE id = :id
            """), {"name": name, "surname": surname, "email": email, "id": cardholder_id})
        
        conn.commit()
        print(f"Migrated {len(rows)} cardholders.")
        print("Migration complete!")
        
        # Note: We keep display_name column for now for backwards compatibility
        # It can be removed in a future migration if needed


if __name__ == "__main__":
    migrate_cardholders()

