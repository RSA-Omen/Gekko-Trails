from __future__ import annotations

from typing import List

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.db import get_session
from app.models import Cardholder, Manager, CardholderManager
from app.schemas import CardholderOut, CardholderCreate, CardholderUpdate, ManagerOut


router = APIRouter()

# Manager email mapping (from import data)
# This will be replaced with proper User/Manager linking when SSO is implemented
MANAGER_EMAIL_MAP = {
    1: "andrewe@gekkos.com",
    2: "melindap@gekkos.com",
    3: "nigelg@gekkos.com",
    4: "markd@gekkos.com",
    5: "dano@gekkos.com",
    6: "timb@gekkos.com",
    7: "michaelt@gekkos.com",
    8: "waynel@gekkos.com",
}


@router.get("", response_model=List[CardholderOut])
async def list_cardholders() -> List[CardholderOut]:
    """
    List all cardholders with their managers (if assigned).
    """
    with get_session() as session:
        cardholders = list(session.execute(select(Cardholder)).scalars())
        items = []
        for ch in cardholders:
            # Get manager if assigned
            manager_link = session.execute(
                select(CardholderManager).where(CardholderManager.cardholder_id == ch.id).limit(1)
            ).scalar_one_or_none()
            
            manager = None
            if manager_link:
                manager_obj = session.get(Manager, manager_link.manager_id)
                if manager_obj:
                    manager_email = MANAGER_EMAIL_MAP.get(manager_obj.id)
                    manager = ManagerOut(id=manager_obj.id, user_id=manager_obj.user_id, email=manager_email)
            
            items.append(
                CardholderOut(
                    id=ch.id,
                    name=ch.name,
                    surname=ch.surname,
                    email=ch.email,
                    user_id=ch.user_id,
                    display_name=ch.get_display_name(),
                    manager=manager,
                )
            )
    return items


@router.post("", response_model=CardholderOut)
async def create_cardholder(payload: CardholderCreate) -> CardholderOut:
    """
    Create a new cardholder with optional manager assignment.
    """
    if not payload.name.strip() or not payload.surname.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="name and surname are required.",
        )
    if not payload.email.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="email is required.",
        )

    with get_session() as session:
        # Check for duplicate email
        existing = session.execute(
            select(Cardholder).where(Cardholder.email == payload.email.strip().lower())
        ).scalar_one_or_none()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cardholder with email {payload.email} already exists.",
            )

        # Set display_name for backwards compatibility with existing NOT NULL constraint
        display_name = f"{payload.name.strip()} {payload.surname.strip()}".strip()
        
        cardholder = Cardholder(
            name=payload.name.strip(),
            surname=payload.surname.strip(),
            email=payload.email.strip().lower(),
            display_name=display_name,
        )
        session.add(cardholder)
        session.flush()

        # Assign manager if provided
        if payload.manager_id:
            manager = session.get(Manager, payload.manager_id)
            if not manager:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Manager with id {payload.manager_id} not found.",
                )
            link = CardholderManager(cardholder_id=cardholder.id, manager_id=manager.id)
            session.add(link)
            session.flush()

        # Get manager if assigned
        manager_link = session.execute(
            select(CardholderManager).where(CardholderManager.cardholder_id == cardholder.id).limit(1)
        ).scalar_one_or_none()
        
        manager = None
        if manager_link:
            manager_obj = session.get(Manager, manager_link.manager_id)
            if manager_obj:
                manager = ManagerOut(id=manager_obj.id, user_id=manager_obj.user_id)

        result = CardholderOut(
            id=cardholder.id,
            name=cardholder.name,
            surname=cardholder.surname,
            email=cardholder.email,
            user_id=cardholder.user_id,
            display_name=cardholder.get_display_name(),
            manager=manager,
        )
        return result


@router.put("/{cardholder_id}", response_model=CardholderOut)
async def update_cardholder(
    cardholder_id: int,
    payload: CardholderUpdate,
) -> CardholderOut:
    """
    Update cardholder fields and/or manager assignment.
    """
    with get_session() as session:
        cardholder = session.get(Cardholder, cardholder_id)
        if not cardholder:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Cardholder not found.",
            )

        # Update fields if provided
        if payload.name is not None:
            cardholder.name = payload.name.strip()
        if payload.surname is not None:
            cardholder.surname = payload.surname.strip()
        if payload.email is not None:
            new_email = payload.email.strip().lower()
            # Check for duplicate email (excluding current cardholder)
            existing = session.execute(
                select(Cardholder).where(
                    Cardholder.email == new_email,
                    Cardholder.id != cardholder_id
                )
            ).scalar_one_or_none()
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Cardholder with email {new_email} already exists.",
                )
            cardholder.email = new_email

        # Update manager assignment
        if payload.manager_id is not None:
            # Remove existing manager links
            existing_links = list(
                session.execute(
                    select(CardholderManager).where(
                        CardholderManager.cardholder_id == cardholder_id
                    )
                ).scalars()
            )
            for link in existing_links:
                session.delete(link)

            # Add new manager if provided
            if payload.manager_id > 0:
                manager = session.get(Manager, payload.manager_id)
                if not manager:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail=f"Manager with id {payload.manager_id} not found.",
                    )
                link = CardholderManager(cardholder_id=cardholder_id, manager_id=manager.id)
                session.add(link)

        session.flush()

        # Get manager if assigned
        manager_link = session.execute(
            select(CardholderManager).where(CardholderManager.cardholder_id == cardholder_id).limit(1)
        ).scalar_one_or_none()
        
        manager = None
        if manager_link:
            manager_obj = session.get(Manager, manager_link.manager_id)
            if manager_obj:
                manager = ManagerOut(id=manager_obj.id, user_id=manager_obj.user_id)

        return CardholderOut(
            id=cardholder.id,
            name=cardholder.name,
            surname=cardholder.surname,
            email=cardholder.email,
            user_id=cardholder.user_id,
            display_name=cardholder.get_display_name(),
            manager=manager,
        )


@router.get("/{cardholder_id}", response_model=CardholderOut)
async def get_cardholder(cardholder_id: int) -> CardholderOut:
    """
    Get a single cardholder by ID.
    """
    with get_session() as session:
        cardholder = session.get(Cardholder, cardholder_id)
        if not cardholder:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Cardholder not found.",
            )
        
        # Get manager if assigned
        manager_link = session.execute(
            select(CardholderManager).where(CardholderManager.cardholder_id == cardholder_id).limit(1)
        ).scalar_one_or_none()
        
        manager = None
        if manager_link:
            manager_obj = session.get(Manager, manager_link.manager_id)
            if manager_obj:
                manager = ManagerOut(id=manager_obj.id, user_id=manager_obj.user_id)
        
        return CardholderOut(
            id=cardholder.id,
            name=cardholder.name,
            surname=cardholder.surname,
            email=cardholder.email,
            user_id=cardholder.user_id,
            display_name=cardholder.get_display_name(),
            manager=manager,
        )


@router.delete("/{cardholder_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_cardholder(cardholder_id: int):
    """
    Delete a cardholder by ID.
    Note: This will cascade delete related records (accounts, transactions, etc.)
    based on foreign key constraints.
    """
    with get_session() as session:
        cardholder = session.get(Cardholder, cardholder_id)
        if not cardholder:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Cardholder not found.",
            )
        session.delete(cardholder)
        session.commit()
