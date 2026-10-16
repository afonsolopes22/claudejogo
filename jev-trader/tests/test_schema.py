import pytest

from jev_trader.jev_client import neutral_answers
from jev_trader.schema import FIELDS, SchemaParseError, compile_questions, parse_verdicts, schema_version
from jev_trader.types import Direction, Regime, RiskState


def test_compiles_five_questions_per_setup_and_validates_against_sdk(book, hints):
    q = compile_questions(book, hints)
    assert len(q) == 5 * len(book.setups)
    for s in book.setups:
        for f in FIELDS:
            assert f"{s.symbol}.{f}" in q
    # The real SDK's validator and wire models must accept what we compiled.
    from typesafe_sdk._core.questions import normalize_questions
    from typesafe_sdk._schemas.models import Question

    normalize_questions(q)
    for v in q.values():
        Question.model_validate(v)
    assert q["MON.setup_quality"]["type"] == "score" and len(q["MON.setup_quality"]["criteria"]) == 4
    assert set(q["HYPE.regime"]["criteria"]) == {"trending", "mean_reverting", "high_vol", "crisis"}
    assert set(q["HYPE.risk_state"]["criteria"]) == {"safe", "near_limit", "reduce"}


def test_schema_version_is_deterministic_and_changes_with_content(book, hints):
    q = compile_questions(book, hints)
    v1 = schema_version(book, q)
    assert v1 == schema_version(book, compile_questions(book, hints))
    q2 = dict(q)
    q2["HYPE.direction"] = {**q2["HYPE.direction"], "instructions": "changed"}
    assert schema_version(book, q2) != v1


def test_parse_roundtrip_and_errors(mini_book, hints):
    q = compile_questions(mini_book, hints)
    ans = neutral_answers(q)
    vs = parse_verdicts(ans, mini_book, ts=1, latency_ms=81, model="stub", version="v")
    assert vs["HYPE"].direction == Direction.neutral
    assert vs["HYPE"].regime == Regime.mean_reverting
    assert vs["HYPE"].risk_state == RiskState.safe
    assert vs["MON"].setup_quality == 0.0
    del ans["MON.regime"]
    with pytest.raises(SchemaParseError):
        parse_verdicts(ans, mini_book, 1, 81, "stub", "v")
    ans = neutral_answers(q)
    ans["HYPE.toxic_flow"] = {"type": "choice", "choice": "x", "confidence": 1, "probabilities": {}}
    with pytest.raises(SchemaParseError):
        parse_verdicts(ans, mini_book, 1, 81, "stub", "v")


def test_setup_window(mini_book):
    import datetime as dt

    s = mini_book.setups[0].model_copy(update={"active_from": dt.date(2026, 10, 20), "active_to": dt.date(2026, 10, 25)})
    ts = lambda d: int(dt.datetime(2026, 10, d, 12, tzinfo=dt.timezone.utc).timestamp() * 1000)
    assert not s.is_active(ts(19)) and s.is_active(ts(20)) and s.is_active(ts(25)) and not s.is_active(ts(26))
