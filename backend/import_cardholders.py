#!/usr/bin/env python3
"""
Import cardholders, managers, and accounts from the provided data.
"""
import os
import sys
from pathlib import Path

# Add backend to path
backend_dir = Path(__file__).parent
sys.path.insert(0, str(backend_dir))

# Set SQLite DB URL for local dev
os.environ.setdefault("CCC_DB_URL", "sqlite:///./ccc.db")

from sqlalchemy import select
from app.db import get_session
from app.models import Cardholder, Manager, Account, CardholderManager, User


# Data from the user
CARDHOLDER_DATA = [
    {"card": "6547", "name": "Baker", "email": "scottb@gekkos.com", "manager_email": "andrewe@gekkos.com"},
    {"card": "6341", "name": "Barclay", "email": "simon.barclay@gekkos.com", "manager_email": "melindap@gekkos.com"},
    {"card": "4137", "name": "Bell", "email": "timb@gekkos.com", "manager_email": "nigelg@gekkos.com"},
    {"card": "7173", "name": "Brown", "email": "mbrown@gekkos.com", "manager_email": "markd@gekkos.com"},
    {"card": "4265", "name": "Conroy", "email": "MatthewC@gekkos.com", "manager_email": "dano@gekkos.com"},
    {"card": "7718", "name": "Delemontex", "email": "GeorgesD@gekkos.com", "manager_email": "markd@gekkos.com"},
    {"card": "2571", "name": "Donadio", "email": "markd@gekkos.com", "manager_email": "andrewe@gekkos.com"},
    {"card": "3601", "name": "DUva", "email": "LisaL@gekkos.com", "manager_email": "timb@gekkos.com"},
    {"card": "1694", "name": "Edmondston", "email": "AndrewE@gekkos.com", "manager_email": "markd@gekkos.com"},
    {"card": "3540", "name": "Gort", "email": "MarleenG@gekkos.com", "manager_email": "markd@gekkos.com"},
    {"card": "8338", "name": "Grigg", "email": "NigelG@gekkos.com", "manager_email": "andrewe@gekkos.com"},
    {"card": "7601", "name": "Hughes", "email": "TimH@gekkos.com", "manager_email": "michaelt@gekkos.com"},
    {"card": "9020", "name": "Jenkins", "email": "ShayneJ@gekkos.com", "manager_email": "waynel@gekkos.com"},
    {"card": "3035", "name": "Lanyon", "email": "Austell.lanyon@gekkos.com", "manager_email": "waynel@gekkos.com"},
    {"card": "3599", "name": "Lewis Gray E", "email": "eloisee@gekkos.com", "manager_email": "andrewe@gekkos.com"},
    {"card": "1929", "name": "Lewis Gray S", "email": "eloisee@gekkos.com", "manager_email": "andrewe@gekkos.com"},
    {"card": "4138", "name": "Lodge", "email": "WayneL@gekkos.com", "manager_email": "andrewe@gekkos.com"},
    {"card": "4747", "name": "McLaughlin", "email": "ShaneMc@gekkos.com", "manager_email": "waynel@gekkos.com"},
    {"card": "8624", "name": "O'Halloran", "email": "DanO@gekkos.com", "manager_email": "andrewe@gekkos.com"},
    {"card": "9664", "name": "Predergast", "email": "MelindaP@gekkos.com", "manager_email": "waynel@gekkos.com"},
    {"card": "6087", "name": "Rouhan", "email": "kate.fellowes@gekkos.com", "manager_email": "markd@gekkos.com"},
    {"card": "7833", "name": "Torney", "email": "ClintT@gekkos.com", "manager_email": "dano@gekkos.com"},
    {"card": "5241", "name": "Trenorden", "email": "MichaelT@gekkos.com", "manager_email": "waynel@gekkos.com"},
    {"card": "1431", "name": "Tuncks", "email": "BarryT@gekkos.com", "manager_email": "markd@gekkos.com"},
    {"card": "9991", "name": "VanKollenburg", "email": "leonvk@gekkos.com", "manager_email": "dano@gekkos.com"},
    {"card": "6594", "name": "Zhang", "email": "nick.zhang@gekkos.com", "manager_email": "waynel@gekkos.com"},
    {"card": "4130", "name": "Wraith", "email": "Ben.Wraith@gekkos.com", "manager_email": "nigelg@gekkos.com"},
    {"card": "8761", "name": "Riley", "email": "aimee.riley@gekkos.com", "manager_email": "markd@gekkos.com"},
    {"card": "8082", "name": "Lee", "email": "zacharyl@gekkos.com", "manager_email": "waynel@gekkos.com"},
    {"card": "5474", "name": "Lodge H", "email": "harryl@gekkos.com", "manager_email": "waynel@gekkos.com"},
    {"card": "9087", "name": "Randell", "email": "adrian.randell@gekkos.com", "manager_email": "timb@gekkos.com"},
    {"card": "5635", "name": "Ntombela", "email": "MxolisiN@gekkos.com", "manager_email": "nigelg@gekkos.com"},
]


def parse_name(name_str):
    """Parse cardholder name into name and surname."""
    parts = name_str.strip().split(maxsplit=1)
    if len(parts) == 2:
        return parts[0], parts[1]
    elif len(parts) == 1:
        return parts[0], ""
    return "", ""


def get_or_create_manager(session, manager_email):
    """Get or create a Manager by email."""
    # First, try to find a User with this email
    user = session.execute(
        select(User).where(User.email == manager_email.lower())
    ).scalar_one_or_none()
    
    if user:
        # Check if Manager already exists for this user
        manager = session.execute(
            select(Manager).where(Manager.user_id == user.id)
        ).scalar_one_or_none()
        if manager:
            return manager
    
    # Create a Manager (without user_id for now, since we don't have Users)
    # We'll just create managers without user links for now
    manager = session.execute(
        select(Manager).where(Manager.user_id == None)
    ).scalars().first()
    
    # For now, create a new manager for each unique email
    # In a real system, we'd link to Users
    manager = Manager(user_id=None)
    session.add(manager)
    session.flush()
    return manager


def import_cardholders():
    """Import all cardholders, managers, and accounts."""
    print("Starting cardholder import...")
    
    with get_session() as session:
        # Track managers by email
        manager_cache = {}
        cardholders_created = 0
        accounts_created = 0
        managers_created = 0
        
        for item in CARDHOLDER_DATA:
            card_number = item["card"]
            name_str = item["name"]
            email = item["email"].lower()
            manager_email = item["manager_email"].lower()
            
            # Parse name
            name, surname = parse_name(name_str)
            if not surname:
                # If no surname, use the name as surname and leave name empty
                surname = name
                name = ""
            
            # Get or create manager
            if manager_email not in manager_cache:
                # For now, create managers without user links
                # We'll need to handle this differently - maybe create a mapping
                manager = Manager(user_id=None)
                session.add(manager)
                session.flush()
                manager_cache[manager_email] = manager
                managers_created += 1
                print(f"  Created manager for {manager_email}")
            
            manager = manager_cache[manager_email]
            
            # Check if cardholder already exists
            existing_cardholder = session.execute(
                select(Cardholder).where(Cardholder.email == email)
            ).scalar_one_or_none()
            
            if existing_cardholder:
                cardholder = existing_cardholder
                print(f"  Cardholder {email} already exists, updating...")
            else:
                # Create cardholder
                display_name = f"{name} {surname}".strip() if name else surname
                cardholder = Cardholder(
                    name=name,
                    surname=surname,
                    email=email,
                    display_name=display_name,
                )
                session.add(cardholder)
                session.flush()
                cardholders_created += 1
                print(f"  Created cardholder: {display_name} ({email})")
            
            # Create or update account
            # Find account by last 4 digits
            existing_account = session.execute(
                select(Account).where(Account.bank_account_number.like(f"%{card_number}"))
            ).scalar_one_or_none()
            
            if existing_account:
                # Update account to link to cardholder
                existing_account.cardholder_id = cardholder.id
                existing_account.label = f"Card {card_number}"
                print(f"  Updated account {card_number} to link to {cardholder.display_name}")
            else:
                # Create new account
                # Note: We need the full account number, but we only have last 4 digits
                # For now, we'll use a placeholder format
                account = Account(
                    bank_account_number=card_number,  # This should be full number, but we only have last 4
                    label=f"Card {card_number}",
                    cardholder_id=cardholder.id,
                )
                session.add(account)
                session.flush()
                accounts_created += 1
                print(f"  Created account: {card_number} for {cardholder.display_name}")
            
            # Link cardholder to manager (check for existing link first)
            existing_link = session.execute(
                select(CardholderManager).where(
                    CardholderManager.cardholder_id == cardholder.id,
                    CardholderManager.manager_id == manager.id
                )
            ).scalar_one_or_none()
            
            if not existing_link:
                try:
                    link = CardholderManager(
                        cardholder_id=cardholder.id,
                        manager_id=manager.id
                    )
                    session.add(link)
                    session.flush()
                    print(f"  Linked {cardholder.display_name} to manager {manager_email}")
                except Exception as e:
                    print(f"  Warning: Could not link {cardholder.display_name} to manager {manager_email}: {e}")
            else:
                print(f"  Link already exists: {cardholder.display_name} -> {manager_email}")
        
        print(f"\nImport complete:")
        print(f"  Cardholders created/updated: {cardholders_created}")
        print(f"  Accounts created/updated: {accounts_created}")
        print(f"  Managers created: {managers_created}")


if __name__ == "__main__":
    import_cardholders()

