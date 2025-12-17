from __future__ import annotations

from datetime import datetime
from typing import List

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select

from app.db import get_session
from app.models import Manager, CardholderManager, Account, Cardholder, ClassificationBatch, Classification, Transaction
from app.schemas import ManagerOut, ManagerAccountOut, ClassificationBatchOut, Format2Item, BatchRejectRequest
from app.services.format2_projection import project_to_format2


router = APIRouter()


# Temporary mapping of manager IDs to emails based on historic import data.
# This mirrors the mapping used in the cardholders router so that Admin/Finance
# can see a meaningful identifier for each manager while SSO is not yet wired up.
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


@router.get("", response_model=List[ManagerOut])
async def list_managers() -> List[ManagerOut]:
    """
    List all managers for Admin/Finance management views.

    For now, managers are fairly minimal:
    - Identified primarily by ID
    - Email is inferred from MANAGER_EMAIL_MAP (historic data) when available

    This will later be replaced / enriched once SSO is implemented and
    managers are linked directly to User records.
    """
    with get_session() as session:
        managers = list(session.execute(select(Manager)).scalars())

        # Preload cardholder counts for each manager so the Admin/Finance UI
        # can see which managers are actively used.
        manager_ids = [m.id for m in managers]
        counts: dict[int, int] = {}
        if manager_ids:
            rows = session.execute(
                select(CardholderManager.manager_id)
                .where(CardholderManager.manager_id.in_(manager_ids))
            ).scalars()
            for manager_id in rows:
                counts[manager_id] = counts.get(manager_id, 0) + 1

        items: List[ManagerOut] = []
        for m in managers:
            email = MANAGER_EMAIL_MAP.get(m.id)
            # ManagerOut currently does not require cardholder_count, but if it
            # is later extended, we can easily enrich it here.
            items.append(
                ManagerOut(
                    id=m.id,
                    user_id=m.user_id,
                    email=email,
                )
            )
    return items


@router.get("/{manager_id}/accounts", response_model=List[ManagerAccountOut])
async def list_manager_accounts(manager_id: int) -> List[ManagerAccountOut]:
    """
    List all accounts (cards) for a given manager, including the cardholder
    display name, so the UI can offer a per-card filter like:
    "Brown – 7173".
    """
    with get_session() as session:
        manager = session.get(Manager, manager_id)
        if not manager:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Manager with id {manager_id} not found.",
            )

        # Find all cardholders linked to this manager
        cardholder_ids = session.execute(
            select(CardholderManager.cardholder_id).where(
                CardholderManager.manager_id == manager_id
            )
        ).scalars().all()

        if not cardholder_ids:
            return []

        # Load accounts and their cardholders
        accounts = list(
            session.execute(
                select(Account).where(Account.cardholder_id.in_(cardholder_ids))
            ).scalars()
        )

        results: List[ManagerAccountOut] = []
        for acc in accounts:
            if not acc.cardholder_id:
                continue
            ch = session.get(Cardholder, acc.cardholder_id)
            if not ch:
                continue
            results.append(
                ManagerAccountOut(
                    account_id=acc.id,
                    bank_account_number=acc.bank_account_number,
                    cardholder_id=ch.id,
                    cardholder_display_name=ch.get_display_name(),
                )
            )

    return results


# Manager Inbox endpoints
@router.get("/{manager_id}/inbox", response_model=dict)
async def get_manager_inbox(manager_id: int) -> dict:
    """
    Get Manager inbox: list of cardholder batches awaiting approval.
    """
    with get_session() as session:
        manager = session.get(Manager, manager_id)
        if not manager:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Manager with id {manager_id} not found.",
            )
        
        # Get cardholder IDs for this manager
        cardholder_ids = list(
            session.execute(
                select(CardholderManager.cardholder_id).where(
                    CardholderManager.manager_id == manager_id
                )
            ).scalars()
        )
        
        if not cardholder_ids:
            return {"items": []}
        
        # Get batches for these cardholders that are completed (submitted)
        batches = list(
            session.execute(
                select(ClassificationBatch).where(
                    ClassificationBatch.owner_type == "cardholder",
                    ClassificationBatch.owner_id.in_(cardholder_ids),
                    ClassificationBatch.status == "completed"
                ).order_by(ClassificationBatch.submitted_at.desc())
            ).scalars()
        )
        
        items = []
        for batch in batches:
            cardholder = session.get(Cardholder, batch.owner_id)
            tx_count = session.execute(
                select(func.count(Classification.transaction_id)).where(
                    Classification.batch_id == batch.id
                )
            ).scalar() or 0
            
            items.append({
                "batch_id": batch.id,
                "cardholder_id": batch.owner_id,
                "cardholder_display_name": cardholder.get_display_name() if cardholder else f"Cardholder {batch.owner_id}",
                "transaction_count": tx_count,
                "status": batch.status,
                "submitted_at": batch.submitted_at,
                "title": batch.title,
                "label": batch.label,
            })
    
    return {"items": items}


@router.get("/{manager_id}/batches/{batch_id}/items", response_model=dict)
async def get_manager_batch_items(
    manager_id: int,
    batch_id: int,
) -> dict:
    """
    Get Format 2 items for a manager batch review.
    """
    with get_session() as session:
        batch = session.get(ClassificationBatch, batch_id)
        if not batch:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Batch not found.",
            )
        
        # Verify this batch belongs to a cardholder under this manager
        if batch.owner_type != "cardholder":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Batch is not a cardholder batch.",
            )
        
        # Check if cardholder is under this manager
        link = session.execute(
            select(CardholderManager).where(
                CardholderManager.manager_id == manager_id,
                CardholderManager.cardholder_id == batch.owner_id
            ).limit(1)
        ).scalar_one_or_none()
        
        if not link:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Batch does not belong to a cardholder under this manager.",
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


@router.post("/{manager_id}/batches/{batch_id}/approve", response_model=ClassificationBatchOut)
async def approve_manager_batch(
    manager_id: int,
    batch_id: int,
) -> ClassificationBatchOut:
    """
    Approve a cardholder batch. Marks batch and all classifications as manager_approved.
    """
    with get_session() as session:
        batch = session.get(ClassificationBatch, batch_id)
        if not batch:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Batch not found.",
            )
        
        # Verify this batch belongs to a cardholder under this manager
        if batch.owner_type != "cardholder":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Batch is not a cardholder batch.",
            )
        
        link = session.execute(
            select(CardholderManager).where(
                CardholderManager.manager_id == manager_id,
                CardholderManager.cardholder_id == batch.owner_id
            ).limit(1)
        ).scalar_one_or_none()
        
        if not link:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Batch does not belong to a cardholder under this manager.",
            )
        
        # Status guard: only completed (submitted) batches can be approved
        if batch.status != "completed":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Batch must be in 'completed' status to approve. Current status: {batch.status}",
            )
        
        # Update batch
        batch.status = "approved"
        batch.approved_at = datetime.utcnow()
        
        # Update all classifications in batch
        classifications = list(
            session.execute(
                select(Classification).where(Classification.batch_id == batch_id)
            ).scalars()
        )
        
        for classification in classifications:
            classification.status = "manager_approved"
            classification.source = "manager"
            classification.last_updated_at = datetime.utcnow()
        
        session.flush()
        
        tx_count = len(classifications)
        
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


@router.post("/{manager_id}/batches/{batch_id}/reject", response_model=ClassificationBatchOut)
async def reject_manager_batch(
    manager_id: int,
    batch_id: int,
    payload: BatchRejectRequest,
) -> ClassificationBatchOut:
    """
    Reject a cardholder batch. Requires a rejection reason.
    Marks batch as rejected and stores the reason.
    """
    with get_session() as session:
        batch = session.get(ClassificationBatch, batch_id)
        if not batch:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Batch not found.",
            )
        
        # Verify this batch belongs to a cardholder under this manager
        if batch.owner_type != "cardholder":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Batch is not a cardholder batch.",
            )
        
        link = session.execute(
            select(CardholderManager).where(
                CardholderManager.manager_id == manager_id,
                CardholderManager.cardholder_id == batch.owner_id
            ).limit(1)
        ).scalar_one_or_none()
        
        if not link:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Batch does not belong to a cardholder under this manager.",
            )
        
        # Status guard: only completed (submitted) batches can be rejected
        if batch.status != "completed":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Batch must be in 'completed' status to reject. Current status: {batch.status}",
            )
        
        if not payload.reason or not payload.reason.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Rejection reason is required.",
            )
        
        # Update batch
        batch.status = "rejected"
        batch.rejection_reason = payload.reason.strip()
        
        # Update all classifications in batch
        classifications = list(
            session.execute(
                select(Classification).where(Classification.batch_id == batch_id)
            ).scalars()
        )
        
        for classification in classifications:
            classification.status = "rejected"
            classification.rejection_reason = payload.reason.strip()
            classification.source = "manager"
            classification.last_updated_at = datetime.utcnow()
        
        session.flush()
        
        tx_count = len(classifications)
        
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


