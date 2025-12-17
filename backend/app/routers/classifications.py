from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from app.db import get_session
from app.models import Classification, Transaction
from app.schemas import ClassificationUpdate, Format2Item
from app.services.format2_projection import project_to_format2
from app.services.ml_service import predict_classification as ml_predict


router = APIRouter()


@router.get("/cardholder/{cardholder_id}", response_model=dict)
async def list_cardholder_classifications(
    cardholder_id: int,
    status_filter: Optional[str] = Query(default=None, alias="status"),
    batch_id: Optional[int] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=1000),
) -> dict:
    """
    List Format 2 items for a cardholder with optional status and batch filters.
    Gets transactions by matching cardholder's assigned accounts.
    """
    from app.models import Account
    from sqlalchemy import or_
    
    with get_session() as session:
        # Get accounts for this cardholder
        accounts = list(
            session.execute(
                select(Account.bank_account_number).where(Account.cardholder_id == cardholder_id)
            ).scalars()
        )
        
        if not accounts:
            return {"items": []}
        
        # Build conditions to match transactions by account last 4 digits
        conditions = []
        for acc_num in accounts:
            if len(acc_num) >= 4:
                last4 = acc_num[-4:]
                conditions.append(Transaction.bank_account.like(f"%{last4}"))
        
        if not conditions:
            return {"items": []}
        
        # Get transactions matching these accounts
        stmt = select(Transaction).where(or_(*conditions))
        
        if batch_id:
            # Filter by batch via classifications
            stmt = stmt.join(Classification).where(Classification.batch_id == batch_id)
        
        transactions = list(session.execute(stmt.limit(limit)).scalars())
        
        items: List[Format2Item] = []
        for tx in transactions:
            # Classification uses transaction_id as primary key, not id
            classification = session.execute(
                select(Classification).where(Classification.transaction_id == tx.id)
            ).scalar_one_or_none()
            
            if status_filter:
                if classification:
                    if classification.status != status_filter:
                        continue
                else:
                    if status_filter != "unclassified":
                        continue
            
            items.append(project_to_format2(tx, classification))
    
    return {"items": items}


@router.get("/manager/{manager_id}", response_model=dict)
async def list_manager_classifications(
    manager_id: int,
    batch_id: Optional[int] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=1000),
) -> dict:
    """
    List Format 2 items for all cardholders under a manager.
    """
    from app.models import CardholderManager, Account
    
    with get_session() as session:
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
        
        # Get accounts for these cardholders
        accounts = list(
            session.execute(
                select(Account.bank_account_number).where(Account.cardholder_id.in_(cardholder_ids))
            ).scalars()
        )
        
        if not accounts:
            return {"items": []}
        
        # Get transactions matching these accounts
        conditions = []
        for acc_num in accounts:
            if len(acc_num) >= 4:
                last4 = acc_num[-4:]
                conditions.append(Transaction.bank_account.like(f"%{last4}"))
        
        if not conditions:
            return {"items": []}
        
        from sqlalchemy import or_
        stmt = select(Transaction).where(or_(*conditions))
        
        if batch_id:
            stmt = stmt.join(Classification).where(Classification.batch_id == batch_id)
        
        transactions = list(session.execute(stmt.limit(limit)).scalars())
        
        items: List[Format2Item] = []
        for tx in transactions:
            classification = session.get(Classification, tx.id)
            items.append(project_to_format2(tx, classification))
    
    return {"items": items}


@router.get("/finance/batch/{import_job_id}", response_model=dict)
async def list_finance_batch_classifications(
    import_job_id: int,
    limit: int = Query(default=100, ge=1, le=1000),
) -> dict:
    """
    List Format 2 items for a Finance review batch (from an ImportJob).
    """
    try:
        with get_session() as session:
            # Check if import job exists
            from app.models import ImportJob
            import_job = session.get(ImportJob, import_job_id)
            if not import_job:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"ImportJob {import_job_id} not found.",
                )
            
            transactions = list(
                session.execute(
                    select(Transaction).where(Transaction.import_job_id == import_job_id).limit(limit)
                ).scalars()
            )
            
            items: List[Format2Item] = []
            for tx in transactions:
                try:
                    # Classification uses transaction_id as primary key, not id
                    classification = session.execute(
                        select(Classification).where(Classification.transaction_id == tx.id)
                    ).scalar_one_or_none()
                    items.append(project_to_format2(tx, classification))
                except Exception as e:
                    # Log error for this transaction but continue
                    import traceback
                    print(f"Error processing transaction {tx.id}: {str(e)}")
                    print(traceback.format_exc())
                    # Still add the transaction with None classification
                    items.append(project_to_format2(tx, None))
        
        return {"items": items}
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        error_msg = f"Error loading finance batch items: {str(e)}\n{traceback.format_exc()}"
        print(error_msg)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error loading finance batch items: {str(e)}",
        )


@router.put("/{transaction_id}", response_model=Format2Item)
async def update_classification(
    transaction_id: int,
    payload: ClassificationUpdate,
) -> Format2Item:
    """
    Update classification fields for a transaction.
    Sets status to 'user_confirmed' if user edits fields.
    """
    with get_session() as session:
        transaction = session.get(Transaction, transaction_id)
        if not transaction:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Transaction not found.",
            )
        
        classification = session.get(Classification, transaction_id)
        if not classification:
            classification = Classification(transaction_id=transaction_id)
            session.add(classification)
        
        # Update fields if provided
        if payload.description is not None:
            classification.description = payload.description
        if payload.project is not None:
            classification.project = payload.project
        if payload.cost_category is not None:
            classification.cost_category = payload.cost_category
        if payload.gl_account is not None:
            classification.gl_account = payload.gl_account
        if payload.status is not None:
            classification.status = payload.status
        else:
            # Auto-set to user_confirmed if user edits
            if payload.description is not None or payload.project is not None or payload.cost_category is not None or payload.gl_account is not None:
                classification.status = "user_confirmed"
        
        classification.last_updated_at = datetime.utcnow()
        classification.source = "user"
        session.flush()
        
        return project_to_format2(transaction, classification)


@router.post("/{transaction_id}/predict", response_model=Format2Item)
async def predict_classification_endpoint(transaction_id: int) -> Format2Item:
    """
    Run ML prediction for a transaction and update its classification.
    """
    with get_session() as session:
        transaction = session.get(Transaction, transaction_id)
        if not transaction:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Transaction not found.",
            )
        
        # Get or create classification
        classification = session.get(Classification, transaction_id)
        if not classification:
            classification = Classification(transaction_id=transaction_id)
            session.add(classification)
        
        # Run ML prediction stub
        predictions = ml_predict(transaction)
        
        # Update classification with predictions
        classification.description = predictions.get("description")
        classification.project = predictions.get("project")
        classification.cost_category = predictions.get("cost_category")
        classification.gl_account = predictions.get("gl_account")
        classification.status = "predicted"
        classification.source = "ml"
        classification.last_updated_at = datetime.utcnow()
        
        session.flush()
        
        return project_to_format2(transaction, classification)


