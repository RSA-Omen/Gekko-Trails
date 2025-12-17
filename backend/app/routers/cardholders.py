from __future__ import annotations

from datetime import datetime
from typing import List

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select, update

from app.db import get_session
from app.models import Cardholder, Manager, CardholderManager, ClassificationBatch, Transaction, Account, Classification
from app.schemas import (
    CardholderOut,
    CardholderCreate,
    CardholderUpdate,
    ManagerOut,
    ClassificationBatchCreate,
    ClassificationBatchOut,
    ClassificationBatchUpdate,
    Format2Item,
)
from app.services.format2_projection import project_to_format2


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


# Cardholder Inbox endpoints
@router.get("/{cardholder_id}/inbox", response_model=dict)
async def get_cardholder_inbox(cardholder_id: int) -> dict:
    """
    Get Cardholder inbox: list of batches for this cardholder.
    """
    with get_session() as session:
        cardholder = session.get(Cardholder, cardholder_id)
        if not cardholder:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Cardholder not found.",
            )
        
        batches = list(
            session.execute(
                select(ClassificationBatch).where(
                    ClassificationBatch.owner_type == "cardholder",
                    ClassificationBatch.owner_id == cardholder_id
                ).order_by(ClassificationBatch.created_at.desc())
            ).scalars()
        )
        
        items = []
        for batch in batches:
            tx_count = session.execute(
                select(func.count(Classification.transaction_id)).where(
                    Classification.batch_id == batch.id
                )
            ).scalar() or 0
            
            items.append({
                "batch_id": batch.id,
                "label": batch.label or batch.title,
                "title": batch.title,
                "status": batch.status,
                "transaction_count": tx_count,
                "created_at": batch.created_at,
                "submitted_at": batch.submitted_at,
            })
    
    return {"items": items}


@router.post("/{cardholder_id}/batches/from-finance", response_model=ClassificationBatchOut)
async def create_cardholder_batch_from_finance(
    cardholder_id: int,
    payload: ClassificationBatchCreate,
) -> ClassificationBatchOut:
    """
    Create a cardholder batch from finance-reviewed transactions.
    """
    with get_session() as session:
        cardholder = session.get(Cardholder, cardholder_id)
        if not cardholder:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Cardholder not found.",
            )
        
        if not payload.parent_batch_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="parent_batch_id is required.",
            )
        
        parent_batch = session.get(ClassificationBatch, payload.parent_batch_id)
        if not parent_batch:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Parent batch not found.",
            )
        
        # Check if a cardholder batch already exists for this cardholder from this parent batch
        existing_batch = session.execute(
            select(ClassificationBatch).where(
                ClassificationBatch.parent_batch_id == payload.parent_batch_id,
                ClassificationBatch.owner_type == "cardholder",
                ClassificationBatch.owner_id == cardholder_id
            ).limit(1)
        ).scalar_one_or_none()
        
        if existing_batch:
            # Return existing batch instead of creating a duplicate
            tx_count = session.execute(
                select(func.count(Classification.transaction_id)).where(
                    Classification.batch_id == existing_batch.id
                )
            ).scalar() or 0
            
            return ClassificationBatchOut(
                id=existing_batch.id,
                owner_type=existing_batch.owner_type,
                owner_id=existing_batch.owner_id,
                parent_batch_id=existing_batch.parent_batch_id,
                import_job_id=existing_batch.import_job_id,
                status=existing_batch.status,
                title=existing_batch.title,
                label=existing_batch.label,
                note=existing_batch.note,
                rejection_reason=existing_batch.rejection_reason,
                created_at=existing_batch.created_at,
                completed_at=existing_batch.completed_at,
                submitted_at=existing_batch.submitted_at,
                approved_at=existing_batch.approved_at,
                transaction_count=tx_count,
            )
        
        # Get transactions for this cardholder from the parent batch
        # First, get accounts for this cardholder
        accounts = list(
            session.execute(
                select(Account.bank_account_number).where(Account.cardholder_id == cardholder_id)
            ).scalars()
        )
        
        if not accounts:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cardholder has no accounts assigned.",
            )
        
        # Get transactions from parent batch that match this cardholder's accounts
        from sqlalchemy import or_
        conditions = []
        for acc_num in accounts:
            if len(acc_num) >= 4:
                last4 = acc_num[-4:]
                conditions.append(Transaction.bank_account.like(f"%{last4}"))
        
        if not conditions:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No matching transactions found for cardholder accounts.",
            )
        
        # Get transactions from the parent batch's import job
        if not parent_batch.import_job_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Parent batch has no import job associated.",
            )
        
        # Get all transactions from the import job that match this cardholder's accounts
        matching_txs = list(
            session.execute(
                select(Transaction).where(
                    Transaction.import_job_id == parent_batch.import_job_id,
                    or_(*conditions)
                )
            ).scalars()
        )
        
        if not matching_txs:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No matching transactions found in parent batch.",
            )
        
        # Create cardholder batch
        batch = ClassificationBatch(
            owner_type="cardholder",
            owner_id=cardholder_id,
            parent_batch_id=payload.parent_batch_id,
            status="open",
            title=payload.title or f"{cardholder.get_display_name()} - Classification",
            label=payload.label,
        )
        session.add(batch)
        session.flush()
        
        # Link transactions to batch via classifications
        for tx in matching_txs:
            classification = session.get(Classification, tx.id)
            if not classification:
                classification = Classification(transaction_id=tx.id)
                session.add(classification)
            classification.batch_id = batch.id
            session.flush()
        
        tx_count = len(matching_txs)
        
        return ClassificationBatchOut(
            id=batch.id,
            owner_type=batch.owner_type,
            owner_id=batch.owner_id,
            parent_batch_id=batch.parent_batch_id,
            import_job_id=batch.import_job_id,
            status=batch.status,
            title=batch.title,
            label=batch.label,
            note=batch.note,
            rejection_reason=batch.rejection_reason,
            created_at=batch.created_at,
            completed_at=batch.completed_at,
            submitted_at=batch.submitted_at,
            approved_at=batch.approved_at,
            transaction_count=tx_count,
        )


@router.get("/{cardholder_id}/batches/{batch_id}/items", response_model=dict)
async def get_cardholder_batch_items(
    cardholder_id: int,
    batch_id: int,
) -> dict:
    """
    Get Format 2 items for a cardholder batch.
    """
    with get_session() as session:
        batch = session.get(ClassificationBatch, batch_id)
        if not batch:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Batch not found.",
            )
        
        if batch.owner_type != "cardholder" or batch.owner_id != cardholder_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Batch does not belong to this cardholder.",
            )
        
        classifications = list(
            session.execute(
                select(Classification).where(Classification.batch_id == batch_id)
            ).scalars()
        )
        
        items: List[Format2Item] = []
        for classification in classifications:
            transaction = session.get(Transaction, classification.transaction_id)
            if transaction:
                items.append(project_to_format2(transaction, classification))
        
        return {"items": items}


@router.post("/{cardholder_id}/batches/{batch_id}/submit", response_model=ClassificationBatchOut)
async def submit_cardholder_batch(
    cardholder_id: int,
    batch_id: int,
    payload: ClassificationBatchUpdate,
) -> ClassificationBatchOut:
    """
    Submit a cardholder batch for manager approval.
    Status guard: Only batches in 'open' status can be submitted.
    """
    with get_session() as session:
        batch = session.get(ClassificationBatch, batch_id)
        if not batch:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Batch not found.",
            )
        
        if batch.owner_type != "cardholder" or batch.owner_id != cardholder_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Batch does not belong to this cardholder.",
            )
        
        # Status guard: only open or in_review batches can be submitted
        if batch.status not in ["open", "in_review"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Batch must be in 'open' or 'in_review' status to submit. Current status: {batch.status}",
            )
        
        # Handle partial submission if transaction_ids are provided
        if payload.transaction_ids and len(payload.transaction_ids) > 0:
            # Partial submission: only submit selected transactions
            # Verify all selected transactions are user_confirmed and belong to this batch
            for tx_id in payload.transaction_ids:
                classification = session.execute(
                    select(Classification).where(
                        Classification.transaction_id == tx_id,
                        Classification.batch_id == batch_id
                    )
                ).scalar_one_or_none()
                
                if not classification:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Transaction {tx_id} is not in this batch.",
                    )
                
                if classification.status != "user_confirmed":
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Transaction {tx_id} is not confirmed (status: {classification.status}). Only user_confirmed transactions can be submitted.",
                    )
            
            # Create a new sub-batch for the submitted transactions
            sub_batch = ClassificationBatch(
                owner_type="cardholder",
                owner_id=cardholder_id,
                parent_batch_id=batch_id,
                status="completed",  # Sub-batch is immediately submitted
                title=f"{batch.title or f'Batch {batch_id}'} - Partial Submission",
                label=batch.label,
            )
            session.add(sub_batch)
            session.flush()
            
            # Move selected classifications to the sub-batch
            for tx_id in payload.transaction_ids:
                classification = session.execute(
                    select(Classification).where(
                        Classification.transaction_id == tx_id,
                        Classification.batch_id == batch_id
                    )
                ).scalar_one_or_none()
                if classification:
                    classification.batch_id = sub_batch.id
            
            # Update parent batch status
            remaining_count = session.execute(
                select(func.count(Classification.transaction_id)).where(
                    Classification.batch_id == batch_id,
                    Classification.status == "user_confirmed"
                )
            ).scalar() or 0
            
            if remaining_count == 0:
                # All confirmed transactions were submitted
                batch.status = "completed"
                batch.submitted_at = datetime.utcnow()
            else:
                # Some transactions remain - batch is partially submitted
                batch.status = "in_review"
                if not batch.submitted_at:
                    batch.submitted_at = datetime.utcnow()
            
            # Return the sub-batch info
            sub_tx_count = len(payload.transaction_ids)
            return ClassificationBatchOut(
                id=sub_batch.id,
                owner_type=sub_batch.owner_type,
                owner_id=sub_batch.owner_id,
                parent_batch_id=sub_batch.parent_batch_id,
                import_job_id=sub_batch.import_job_id,
                status=sub_batch.status,
                title=sub_batch.title,
                label=sub_batch.label,
                note=sub_batch.note,
                rejection_reason=sub_batch.rejection_reason,
                created_at=sub_batch.created_at,
                completed_at=sub_batch.completed_at,
                submitted_at=sub_batch.submitted_at,
                approved_at=sub_batch.approved_at,
                transaction_count=sub_tx_count,
            )
        else:
            # Full submission: submit all user_confirmed transactions
            confirmed_count = session.execute(
                select(func.count(Classification.transaction_id)).where(
                    Classification.batch_id == batch_id,
                    Classification.status == "user_confirmed"
                )
            ).scalar() or 0
            
            if confirmed_count == 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot submit batch: no transactions have been classified (user_confirmed).",
                )
            
            batch.status = "completed"
            batch.submitted_at = datetime.utcnow()
        
        if payload.note:
            batch.note = payload.note
        
        session.flush()
        
        tx_count = session.execute(
            select(func.count(Classification.transaction_id)).where(
                Classification.batch_id == batch.id
            )
        ).scalar() or 0
        
        return ClassificationBatchOut(
            id=batch.id,
            owner_type=batch.owner_type,
            owner_id=batch.owner_id,
            parent_batch_id=batch.parent_batch_id,
            import_job_id=batch.import_job_id,
            status=batch.status,
            title=batch.title,
            label=batch.label,
            note=batch.note,
            rejection_reason=batch.rejection_reason,
            created_at=batch.created_at,
            completed_at=batch.completed_at,
            submitted_at=batch.submitted_at,
            approved_at=batch.approved_at,
            transaction_count=tx_count,
        )


@router.post("/{cardholder_id}/batches/{batch_id}/auto-predict", response_model=dict)
async def auto_predict_batch(
    cardholder_id: int,
    batch_id: int,
) -> dict:
    """
    Run prediction on all unclassified items in a batch.
    """
    with get_session() as session:
        batch = session.get(ClassificationBatch, batch_id)
        if not batch:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Batch not found.",
            )
        
        if batch.owner_type != "cardholder" or batch.owner_id != cardholder_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Batch does not belong to this cardholder.",
            )
        
        from app.services.ml_service import predict_classification as ml_predict
        
        classifications = list(
            session.execute(
                select(Classification).where(
                    Classification.batch_id == batch_id,
                    Classification.status.in_(["unclassified", None])
                )
            ).scalars()
        )
        
        predicted_count = 0
        for classification in classifications:
            transaction = session.get(Transaction, classification.transaction_id)
            if transaction:
                predictions = ml_predict(transaction)
                classification.description = predictions.get("description")
                classification.project = predictions.get("project")
                classification.cost_category = predictions.get("cost_category")
                classification.gl_account = predictions.get("gl_account")
                classification.status = "predicted"
                classification.source = "ml"
                classification.last_updated_at = datetime.utcnow()
                predicted_count += 1
        
        session.flush()
        
        return {"predicted_count": predicted_count, "message": f"Predicted {predicted_count} transactions"}
