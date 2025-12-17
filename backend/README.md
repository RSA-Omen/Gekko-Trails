## Gekko Tracks – CCC Backend (FastAPI)

This is the backend service for the Credit Card Coding (CCC) domain in Gekko Tracks.
It exposes APIs for:

- Imports and ledger (Format 1)
- Classification workflows (Format 2)
- Finance / Pronto views and exports (Format 3)
- Admin Center usage & health
- Internal ML integration

For domain and architecture details see `../PROJECT_CHARTER.md` and `../ARCHITECTURE.md`.

### Setup (local dev)

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# point CCC_DB_URL at your Postgres instance, for example:
# export CCC_DB_URL="postgresql://user:password@localhost:5432/ccc_db"

# create tables (tiny DB init)
python init_db.py

# run the API
uvicorn app.main:app --reload
```


