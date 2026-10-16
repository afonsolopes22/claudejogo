import datetime as dt

import pytest

from jev_trader.execution import PaperExchange, SyntheticFeed
from jev_trader.jev_client import StubJudge
from jev_trader.journal import Journal
from jev_trader.loop import TradingLoop
from jev_trader.review.brier import brier_score, calibration
from jev_trader.review.nightly import propose_revision, review, write_proposed_book, write_report
from jev_trader.schema import load_setups
from tests.test_loop import bullish_hype


def test_brier_and_calibration():
    assert brier_score([1, 0, 1], [1, 0, 1]) == 0.0
    assert brier_score([0.5, 0.5], [1, 0]) == pytest.approx(0.25)
    c = calibration([0.9] * 10 + [0.1] * 10, [1] * 9 + [0] + [0] * 9 + [1])
    assert c.n == 20 and c.skill > 0 and c.ece < 0.05
    bad = calibration([0.9] * 10, [0] * 10)
    assert bad.skill < 0
    assert calibration([], []).n == 0


def test_nightly_review_end_to_end(mini_book, limits, tmp_path):
    jpath = tmp_path / "j.jsonl"
    loop = TradingLoop(book=mini_book, judge=StubJudge(scripted=bullish_hype), exchange=PaperExchange(), journal=Journal(jpath), limits=limits)
    for ev in SyntheticFeed(symbols=["HYPE", "MON"], start_ts=1_700_000_000_000, n_bars=80, vol_bps=30, prices={"HYPE": 80, "MON": 0.02}):
        loop.on_event(*ev)
    revs = review(jpath, mini_book)
    assert revs["HYPE"].n_verdicts == 80 and revs["HYPE"].n_fills > 0
    assert revs["HYPE"].direction_cal is not None and revs["HYPE"].direction_cal.n > 50
    assert revs["MON"].blocked_reasons.get("setup_quality_low", 0) > 0
    prop = propose_revision(revs, mini_book, dt.date(2026, 10, 17))
    assert prop["proposed_book"]["version"] == "v0.2"
    text = write_report(tmp_path / "r.md", revs, prop, dt.date(2026, 10, 17))
    assert "Brier=" in text and "Proposed revision" in text
    write_proposed_book(tmp_path / "p.yaml", prop)
    b2 = load_setups(tmp_path / "p.yaml")  # proposal must round-trip through the validator
    assert b2.version == "v0.2"


def test_revision_disables_setup_with_negative_skill(mini_book):
    from jev_trader.review.brier import Calibration
    from jev_trader.review.nightly import SymbolReview

    bad = Calibration(n=40, brier=0.4, brier_climatology=0.25, skill=-0.6, ece=0.3, bins=[])
    revs = {"HYPE": SymbolReview(symbol="HYPE", direction_cal=bad, quality_cal=bad)}
    prop = propose_revision(revs, mini_book, dt.date(2026, 10, 17))
    hype = [s for s in prop["proposed_book"]["setups"] if s["symbol"] == "HYPE"][0]
    assert hype["tradable"] is False
    assert {p["change"] for p in prop["proposals"]} == {"disable", "rewrite_setup_quality_rubric"}
