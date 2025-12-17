from __future__ import annotations

from datetime import datetime
from typing import List

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select

from app.db import get_session
from app.models import ClassificationBatch, Classification, ImportJob, Transaction
from app.schemas import ClassificationBatchCreate, ClassificationBatchOut, ClassificationBatchUpdate


router = APIRouter()


@router.get("/transactions")
async def list_finance_transactions() -> dict:
    """
    MVP stub:
    - Returns Format 3 (finance/Pronto) view rows.
    - Restricted to Admin/Finance in the future.
    """
    return {"items": [], "message": "Stub: list finance transactions (Format 3 view)"}


@router.post("/export-batches")
async def create_export_batch() -> dict:
    """
    MVP stub:
    - Creates an export batch from selected transactions.
    """
    return {"batch_id": 0, "message": "Stub: create export batch"}


@router.get("/export-batches")
async def list_export_batches() -> dict:
    """
    MVP stub:
    - Lists export batches.
    """
    return {"items": [], "message": "Stub: list export batches"}


@router.get("/export-batches/{batch_id}")
async def get_export_batch(batch_id: int) -> dict:
    """
    MVP stub:
    - Returns metadata for a single export batch.
    """
    return {"batch_id": batch_id, "message": "Stub: get export batch"}


# Finance Inbox endpoints
@router.get("/inbox", response_model=dict)
async def get_finance_inbox() -> dict:
    """
    Get Finance inbox: list of recent ImportJobs with batch status.
    """
    with get_session() as session:
        try:
            import_jobs = list(
                session.execute(
                    select(ImportJob).order_by(ImportJob.id.desc()).limit(50)
                ).scalars()
            )
            
            items = []
            for job in import_jobs:
                # Find associated finance batch if any
                finance_batch = session.execute(
                    select(ClassificationBatch).where(
                        ClassificationBatch.import_job_id == job.id,
                        ClassificationBatch.owner_type == "finance"
                    ).limit(1)
                ).scalar_one_or_none()
                
                # Count transactions
                tx_count = session.execute(
                    select(func.count(Transaction.id)).where(Transaction.import_job_id == job.id)
                ).scalar() or 0
                
                # Use started_at as created_at, or fallback to None
                created_at = job.started_at.isoformat() if job.started_at else None
                
                # Check if finance batch has been released to cardholders (has child batches)
                released_to_cardholders = False
                if finance_batch:
                    child_batch_count = session.execute(
                        select(func.count(ClassificationBatch.id)).where(
                            ClassificationBatch.parent_batch_id == finance_batch.id,
                            ClassificationBatch.owner_type == "cardholder"
                        )
                    ).scalar() or 0
                    released_to_cardholders = child_batch_count > 0
                
                items.append({
                    "import_job_id": job.id,
                    "file_name": job.file_name or "",
                    "created_at": created_at,
                    "transaction_count": tx_count,
                    "finance_batch_id": finance_batch.id if finance_batch else None,
                    "status": finance_batch.status if finance_batch else "pending",
                    "released_to_cardholders": released_to_cardholders,
                })
            
            return {"items": items}
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Error loading finance inbox: {str(e)}",
            )


@router.post("/batches/{import_job_id}/open", response_model=ClassificationBatchOut)
async def open_finance_batch(
    import_job_id: int,
    payload: ClassificationBatchCreate,
) -> ClassificationBatchOut:
    """
    Create or reopen a Finance batch for an ImportJob.
    """
    try:
        with get_session() as session:
            import_job = session.get(ImportJob, import_job_id)
            if not import_job:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="ImportJob not found.",
                )
            
            # Check if batch already exists
            existing = session.execute(
                select(ClassificationBatch).where(
                    ClassificationBatch.import_job_id == import_job_id,
                    ClassificationBatch.owner_type == "finance"
                ).limit(1)
            ).scalar_one_or_none()
            
            if existing:
                # Reopen if closed
                if existing.status in ["completed", "rejected"]:
                    existing.status = "open"
                batch = existing
            else:
                # Create new batch
                file_name = import_job.file_name or f"Import {import_job_id}"
                batch = ClassificationBatch(
                    owner_type="finance",
                    owner_id=payload.owner_id,
                    import_job_id=import_job_id,
                    status="open",
                    title=payload.title or f"Finance Review - {file_name}",
                    label=payload.label,
                    note=None,
                )
                session.add(batch)
                session.flush()
                
                # Optionally link transactions to batch via classifications
                if payload.transaction_ids:
                    from app.models import Classification
                    for tx_id in payload.transaction_ids:
                        classification = session.execute(
                            select(Classification).where(Classification.transaction_id == tx_id)
                        ).scalar_one_or_none()
                        if not classification:
                            classification = Classification(transaction_id=tx_id)
                            session.add(classification)
                        classification.batch_id = batch.id
                        session.flush()
            
            # Count transactions in batch
            from app.models import Classification
            tx_count = session.execute(
                select(func.count(Classification.transaction_id)).where(
                    Classification.batch_id == batch.id
                )
            ).scalar() or 0
            
            result = ClassificationBatchOut(
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
            return result
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        error_msg = f"Error opening finance batch: {str(e)}\n{traceback.format_exc()}"
        print(error_msg)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error opening finance batch: {str(e)}",
        )


@router.post("/batches/{batch_id}/complete", response_model=ClassificationBatchOut)
async def complete_finance_batch(
    batch_id: int,
    payload: ClassificationBatchUpdate,
) -> ClassificationBatchOut:
    """
    Mark a Finance batch as completed (ready for cardholders).
    """
    with get_session() as session:
        batch = session.get(ClassificationBatch, batch_id)
        if not batch:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Batch not found.",
            )
        
        if batch.owner_type != "finance":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Batch is not a Finance batch.",
            )
        
        # Status guard: only open batches can be completed
        if batch.status != "open":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Batch must be in 'open' status to complete. Current status: {batch.status}",
            )
        
        batch.status = "completed"
        batch.completed_at = datetime.utcnow()
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


@router.get("/batches/{batch_id}/cardholders-with-transactions", response_model=dict)
async def get_cardholders_with_transactions(batch_id: int) -> dict:
    """
    Get list of cardholders who have transactions in this finance batch.
    Used to filter the "Release to Cardholders" dialog.
    """
    with get_session() as session:
        batch = session.get(ClassificationBatch, batch_id)
        if not batch:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Batch not found.",
            )
        
        if batch.owner_type != "finance":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Batch is not a Finance batch.",
            )
        
        if not batch.import_job_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Batch has no import job associated.",
            )
        
        # Get all transactions from the import job
        transactions = list(
            session.execute(
                select(Transaction.bank_account).where(
                    Transaction.import_job_id == batch.import_job_id
                ).distinct()
            ).scalars()
        )
        
        if not transactions:
            return {"cardholder_ids": []}
        
        # Extract last 4 digits from each transaction bank account
        from sqlalchemy import or_, func
        from app.models import Account, Cardholder
        
        conditions = []
        for tx_account in transactions:
            if len(tx_account) >= 4:
                last4 = tx_account[-4:]
                conditions.append(Account.bank_account_number.like(f"%{last4}"))
        
        if not conditions:
            return {"cardholder_ids": []}
        
        # Find accounts that match any of these last 4 digits
        matching_accounts = list(
            session.execute(
                select(Account.cardholder_id).where(
                    Account.cardholder_id.isnot(None),
                    or_(*conditions)
                ).distinct()
            ).scalars()
        )
        
        # Get unique cardholder IDs
        cardholder_ids = list(set([cid for cid in matching_accounts if cid is not None]))
        
        # Check which cardholders already have batches from this finance batch
        existing_batches = list(
            session.execute(
                select(ClassificationBatch.owner_id).where(
                    ClassificationBatch.parent_batch_id == batch_id,
                    ClassificationBatch.owner_type == "cardholder",
                    ClassificationBatch.owner_id.in_(cardholder_ids) if cardholder_ids else False
                )
            ).scalars()
        )
        already_released_ids = list(set([bid for bid in existing_batches if bid is not None]))
        
        return {
            "cardholder_ids": cardholder_ids,
            "already_released_ids": already_released_ids,
        }


