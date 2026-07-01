"""One-shot: delete all leads with source='test' from the ChromaDB store.

Run once after test isolation is in place:
    uv run python scripts/purge_test_leads.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from leads.store import _init, delete_lead, get_all_leads  # noqa: E402


def purge() -> None:
    _init()
    leads = get_all_leads()
    test_ids = [lead.id for lead in leads if lead.source == "test"]
    n = len(test_ids)
    if n == 0:
        print("No test leads found. Store is clean.")
        return
    for lid in test_ids:
        delete_lead(lid)
    print(f"Deleted {n} test leads (source='test').")
    remaining = len(get_all_leads())
    print(f"Remaining leads in store: {remaining}")


if __name__ == "__main__":
    purge()
