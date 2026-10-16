import pytest

from jev_trader.jev_client import JudgeUnavailable, StubJudge, TypeSafeJudge, neutral_answers
from jev_trader.schema import compile_questions


def test_stub_judge_and_failures(mini_book, hints):
    q = compile_questions(mini_book, hints)
    j = StubJudge(fail_next=1)
    with pytest.raises(JudgeUnavailable):
        j.judge({"snapshots": []}, q)
    r = j.judge({"snapshots": []}, q)
    assert r.model == "stub" and set(r.answers) == set(q)


def test_typesafe_judge_converts_sdk_response(monkeypatch, mini_book, hints):
    import httpx2
    from typesafe_sdk import SystemOneResponse, TypeSafeAPITimeoutError

    q = compile_questions(mini_book, hints)
    ans = neutral_answers(q)
    for name, a in ans.items():  # the wire ScoreAnswer carries a legend and int-keyed probabilities
        if a["type"] == "score":
            a["legend"] = {i: c for i, c in enumerate(q[name]["criteria"])}
            a["probabilities"] = {int(k): v for k, v in a["probabilities"].items()}
    fake = SystemOneResponse.model_validate({"model": "jev-1.13", "usage": {"input_tokens": 300, "output_tokens": 0}, "answers": ans})
    j = TypeSafeJudge(api_key="test-key", timeout_s=0.5)
    captured = {}

    def fake_system_one(*, state, questions, model):
        captured["state"], captured["questions"], captured["model"] = state, questions, model
        return fake

    monkeypatch.setattr(j._client, "system_one", fake_system_one)
    r = j.judge({"snapshots": [{"sym": "HYPE"}]}, q)
    assert captured["model"] == "jev-latest" and captured["questions"] is q
    assert r.answers["HYPE.direction"]["choice"] == "neutral" and r.input_tokens == 300 and r.model == "jev-1.13"
    assert isinstance(r.answers["HYPE.toxic_flow"]["noul"], float)
    assert set(r.answers["HYPE.setup_quality"]["probabilities"]) == {"0", "1", "2", "3"}  # model_dump(mode="json") stringifies the SDK int keys

    def boom(**kw):
        raise TypeSafeAPITimeoutError("timeout")

    monkeypatch.setattr(j._client, "system_one", boom)
    with pytest.raises(JudgeUnavailable):
        j.judge({}, q)
