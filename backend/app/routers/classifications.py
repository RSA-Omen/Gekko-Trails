from fastapi import APIRouter


router = APIRouter()


@router.get("")
async def list_classifications() -> dict:
    """
    MVP stub:
    - Returns classification records in Format 2 view.
    """
    return {"items": [], "message": "Stub: list classifications (Format 2 view)"}


@router.put("/{transaction_id}")
async def update_classification(transaction_id: int) -> dict:
    """
    MVP stub:
    - Updates classification fields/status for a given transaction.
    """
    return {
        "transaction_id": transaction_id,
        "message": "Stub: update classification for transaction",
    }


@router.post("/{transaction_id}/predict")
async def predict_classification(transaction_id: int) -> dict:
    """
    MVP stub:
    - Asks the ML service for predicted classification values.
    """
    return {
        "transaction_id": transaction_id,
        "message": "Stub: predict classification for transaction",
    }


