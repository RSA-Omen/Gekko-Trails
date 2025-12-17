from fastapi import APIRouter


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


