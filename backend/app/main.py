from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import accounts, admincenter, cardholders, classifications, finance, imports, ml, transactions


def create_app() -> FastAPI:
    app = FastAPI(
        title="Gekko Tracks – CCC Backend",
        description="Credit Card Coding domain API for imports, classifications, finance views, and admin center integration.",
        version="0.1.0",
    )

    # Allow local frontend dev (Vite on 5173) to call the API.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Public APIs
    app.include_router(imports.router, prefix="/api/imports", tags=["imports"])
    app.include_router(transactions.router, prefix="/api/transactions", tags=["transactions"])
    app.include_router(classifications.router, prefix="/api/classifications", tags=["classifications"])
    app.include_router(finance.router, prefix="/api/finance", tags=["finance"])
    app.include_router(admincenter.router, prefix="/api/admincenter", tags=["admincenter"])
    app.include_router(accounts.router, prefix="/api/accounts", tags=["accounts"])
    app.include_router(cardholders.router, prefix="/api/cardholders", tags=["cardholders"])
    app.include_router(accounts.router, prefix="/api/accounts", tags=["accounts"])
    app.include_router(cardholders.router, prefix="/api/cardholders", tags=["cardholders"])

    # Internal ML API
    app.include_router(ml.router, prefix="/internal/ml", tags=["ml"])

    return app


app = create_app()


