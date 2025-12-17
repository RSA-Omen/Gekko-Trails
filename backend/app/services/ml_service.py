from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.models import Transaction


def predict_classification(transaction: "Transaction") -> dict[str, str | None]:
    """
    ML stub: Simple keyword-based prediction for Format 2 fields.
    
    In M3, this is a deterministic rule-based stub. Future milestones will
    replace this with actual ML model inference.
    
    Returns:
        dict with keys: description, project, cost_category, gl_account
    """
    narrative_lower = (transaction.narrative or "").lower()
    
    # Simple keyword matching for cost_category
    cost_category = None
    if any(word in narrative_lower for word in ["coffee", "cafe", "restaurant", "food"]):
        cost_category = "Meals & Entertainment"
    elif any(word in narrative_lower for word in ["fuel", "petrol", "gas"]):
        cost_category = "Travel & Fuel"
    elif any(word in narrative_lower for word in ["office", "stationery", "supplies"]):
        cost_category = "Office Supplies"
    elif any(word in narrative_lower for word in ["hotel", "accommodation", "lodging"]):
        cost_category = "Travel & Accommodation"
    else:
        cost_category = "Other"
    
    # Simple project extraction (look for common project codes)
    project = None
    if "project" in narrative_lower:
        # Try to extract project identifier
        words = narrative_lower.split()
        for i, word in enumerate(words):
            if word == "project" and i + 1 < len(words):
                project = words[i + 1].upper()
                break
    
    # Default GL account based on cost category
    gl_account = None
    if cost_category == "Meals & Entertainment":
        gl_account = "6000"
    elif cost_category == "Travel & Fuel":
        gl_account = "6100"
    elif cost_category == "Office Supplies":
        gl_account = "6200"
    elif cost_category == "Travel & Accommodation":
        gl_account = "6100"
    else:
        gl_account = "6999"  # Other expenses
    
    # Description: use narrative as-is for now
    description = transaction.narrative[:500] if transaction.narrative else None
    
    return {
        "description": description,
        "project": project,
        "cost_category": cost_category,
        "gl_account": gl_account,
    }
