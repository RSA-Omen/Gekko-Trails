from fastapi import APIRouter


router = APIRouter()


@router.get("/health")
async def get_health() -> dict:
    """
    MVP stub:
    - Returns basic CCC health information for Admin Center.
    """
    return {
        "status": "ok",
        "components": {
            "db": "unknown",
            "ml_service": "unknown",
            "imports": "unknown",
        },
        "message": "Stub: CCC health status",
    }


@router.get("/usage")
async def get_usage() -> dict:
    """
    MVP stub:
    - Returns aggregated CCC usage metrics for Admin Center.
    """
    return {
        "metrics": [],
        "message": "Stub: CCC usage metrics",
    }


