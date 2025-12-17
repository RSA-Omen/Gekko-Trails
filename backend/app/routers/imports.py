from __future__ import annotations

import csv
from datetime import datetime
from io import StringIO
from typing import Dict, List

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from sqlalchemy.dialects.postgresql import insert

from app.db import get_session
from app.models import ImportJob, Transaction, Account
from sqlalchemy import select


router = APIRouter()


@router.post("/format1")
async def create_import_format1(file: UploadFile = File(...)) -> dict:
    """
    Import a Format 1 CSV file.

    Behaviour:
    - Reads CSV rows with headers:
      Bank Account,Date,Narrative,Debit Amount,Credit Amount,Balance,Categories,Serial
    - For each row in THIS file:
      - Build base key: "{bank_account}|{YYYY-MM-DD}|{narrative}"
      - If duplicate base key appears in this CSV, append "-#"
        to make composite_key unique within the file.
    - Insert into the ledger (transactions) using composite_key as a unique identifier.
      - Uses ON CONFLICT (composite_key) DO NOTHING so re-imports are safe.
    """
    if file.content_type not in ("text/csv", "application/vnd.ms-excel", "application/octet-stream"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported content type: {file.content_type}",
        )

    raw_bytes = await file.read()
    try:
        text = raw_bytes.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="CSV must be UTF-8 encoded.",
        )

    reader = csv.DictReader(StringIO(text))
    required_headers = {
        "Bank Account",
        "Date",
        "Narrative",
        "Debit Amount",
        "Credit Amount",
        "Balance",
        "Categories",
        "Serial",
    }
    if set(reader.fieldnames or []) != required_headers:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"CSV headers must be exactly: {', '.join(sorted(required_headers))}",
        )

    rows: List[Dict[str, str]] = list(reader)
    if not rows:
        return {"message": "CSV contained no data rows.", "import_job_id": None, "inserted": 0}

    # Build composite keys within this CSV only.
    seen: Dict[str, int] = {}
    prepared: List[Dict[str, object]] = []

    for row in rows:
        bank_account = (row.get("Bank Account") or "").strip()
        date_str = (row.get("Date") or "").strip()
        narrative = (row.get("Narrative") or "").strip()

        if not bank_account or not date_str or not narrative:
            # Skip clearly malformed rows; could also collect as errors later.
            continue

        # Try common date formats used by bank exports, e.g. "08/12/2025" or "2025-12-08".
        parsed_date = None
        for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%d/%m/%y"):
            try:
                parsed_date = datetime.strptime(date_str, fmt).date()
                break
            except ValueError:
                continue
        if parsed_date is None:
            # Skip rows with unparseable dates for now; later we can surface as validation errors.
            continue

        debit_str = (row.get("Debit Amount") or "").strip()
        credit_str = (row.get("Credit Amount") or "").strip()
        balance_str = (row.get("Balance") or "").strip()
        categories = (row.get("Categories") or "").strip() or None
        serial = (row.get("Serial") or "").strip() or None

        base_key = f"{bank_account}|{parsed_date.isoformat()}|{narrative}"
        count = seen.get(base_key, 0)
        composite_key = base_key if count == 0 else f"{base_key}-{count}"
        seen[base_key] = count + 1

        def to_decimal(value: str) -> float | None:
            if not value:
                return None
            # Allow simple comma removal e.g. "1,234.56"
            try:
                return float(value.replace(",", ""))
            except ValueError:
                return None

        prepared.append(
            {
                "bank_account": bank_account,
                "date": parsed_date,
                "narrative": narrative,
                "debit_amount": to_decimal(debit_str),
                "credit_amount": to_decimal(credit_str),
                "balance": to_decimal(balance_str),
                "raw_categories": categories,
                "serial": serial,
                "composite_key": composite_key,
            }
        )

    if not prepared:
        return {"message": "No valid rows found in CSV after parsing.", "import_job_id": None, "inserted": 0}

    inserted_count = 0
    job_id: int | None = None
    with get_session() as session:
        # Create ImportJob record.
        job = ImportJob(
            file_name=file.filename or "upload.csv",
            source_format="FORMAT1_CSV",
            status="running",
            total_rows=len(prepared),
        )
        session.add(job)
        session.flush()  # get job.id
        job_id = job.id

        # Build a map of bank_account -> account_id for linking transactions to accounts
        # Match by exact match or by last 4 digits
        account_map: Dict[str, int | None] = {}
        all_accounts = list(session.execute(select(Account)).scalars())
        for acc in all_accounts:
            # Store exact match
            account_map[acc.bank_account_number] = acc.id
            # Also store last 4 digits if account number is longer
            if len(acc.bank_account_number) >= 4:
                last4 = acc.bank_account_number[-4:]
                if last4 not in account_map:
                    account_map[last4] = acc.id

        # Link transactions to accounts
        for row in prepared:
            bank_acc = row["bank_account"]
            # Try exact match first
            account_id = account_map.get(bank_acc)
            # If no exact match, try last 4 digits
            if account_id is None and len(bank_acc) >= 4:
                account_id = account_map.get(bank_acc[-4:])
            row["account_id"] = account_id

        # Prepare insert statement with ON CONFLICT DO NOTHING on composite_key.
        stmt = (
            insert(Transaction)
            .values(
                [
                    {
                        **row,
                        "import_job_id": job_id,
                    }
                    for row in prepared
                ]
            )
            .on_conflict_do_nothing(index_elements=["composite_key"])
        )

        result = session.execute(stmt)
        # result.rowcount may be None with some drivers; fall back to counting manually if needed.
        inserted_count = result.rowcount or 0

        job.status = "completed"
        job.error_count = job.total_rows - inserted_count

    return {
        "message": "Import completed.",
        "import_job_id": job_id,
        "total_rows": len(prepared),
        "inserted": inserted_count,
        "skipped": len(prepared) - inserted_count,
    }


@router.get("")
async def list_imports() -> dict:
    """
    MVP stub:
    - Returns a list of ImportJob records.
    """
    return {"items": [], "message": "Stub: list import jobs"}


@router.get("/{job_id}")
async def get_import(job_id: int) -> dict:
    """
    MVP stub:
    - Returns details for a single ImportJob.
    """
    return {"job_id": job_id, "message": "Stub: get import job details"}


