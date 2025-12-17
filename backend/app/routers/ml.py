from fastapi import APIRouter


router = APIRouter()


@router.post("/predict")
async def predict() -> dict:
    """
    MVP stub:
    - Internal ML prediction endpoint.
    """
    return {"predictions": {}, "message": "Stub: ML predict"}


@router.post("/train")
async def train() -> dict:
    """
    MVP stub:
    - Triggers ML model training.
    """
    return {"message": "Stub: ML training triggered"}


