#!/usr/bin/env python3
"""Nightly review: score the session, write the report and a PROPOSED setups.yaml. Approval is a separate step.

  python scripts/nightly_review.py                       # writes data/review-YYYY-MM-DD.md and data/setups.proposed.yaml
  python scripts/nightly_review.py --approve             # copies the proposed book over config/setups.yaml (operator gate)
"""
from __future__ import annotations

import argparse
import datetime as dt
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from jev_trader.review.nightly import propose_revision, review, write_proposed_book, write_report
from jev_trader.schema import load_setups


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--setups", default="config/setups.yaml")
    ap.add_argument("--journal", default="data/journal.jsonl")
    ap.add_argument("--out-dir", default="data")
    ap.add_argument("--approve", action="store_true")
    a = ap.parse_args()
    today = dt.date.today()
    out = Path(a.out_dir)
    out.mkdir(parents=True, exist_ok=True)
    proposed = out / "setups.proposed.yaml"
    if a.approve:
        if not proposed.exists():
            print("nothing to approve", file=sys.stderr)
            return 1
        load_setups(proposed)  # validate before replacing
        shutil.copy(a.setups, out / f"setups.backup-{today.isoformat()}.yaml")
        shutil.copy(proposed, a.setups)
        print(f"approved: {proposed} -> {a.setups}")
        return 0
    book = load_setups(a.setups)
    revs = review(a.journal, book)
    prop = propose_revision(revs, book, today)
    text = write_report(out / f"review-{today.isoformat()}.md", revs, prop, today)
    write_proposed_book(proposed, prop)
    print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
