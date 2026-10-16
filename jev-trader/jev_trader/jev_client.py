"""Reflex layer client. Wraps the official typesafe-sdk; exposes a tiny Judge protocol so the loop and the tests
never depend on the network. Jev only judges; it never sees thresholds, sizes or side effects."""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Callable, Optional, Protocol


class JudgeUnavailable(RuntimeError):
    """Raised when no verdict could be obtained in time. The loop treats this as HOLD + escalation counter."""


@dataclass(frozen=True)
class JudgeResult:
    answers: dict[str, dict]
    latency_ms: float
    model: str
    input_tokens: int = 0
    output_tokens: int = 0


class Judge(Protocol):
    def judge(self, state: dict, questions: dict[str, dict]) -> JudgeResult: ...


class TypeSafeJudge:
    """Production judge. `pip install typesafe-sdk`; TYPESAFE_API_KEY from https://console.typesafe.ai.

    Request shape (from the SDK): POST /v1/systemone {state, model, questions}. Answers come back keyed by
    question name with type-specific fields (choice/confidence/probabilities, score/confidence/probabilities, noul).
    """

    def __init__(self, model: str = "jev-latest", timeout_s: float = 1.5, api_key: Optional[str] = None):
        from typesafe_sdk import RetryPolicy, TypeSafeClient  # imported lazily so tests run without the SDK

        self.model = model
        # One attempt only: a candle loop must not block on retries; the loop decides what to do on a miss.
        self._client = TypeSafeClient(api_key=api_key, timeout=timeout_s, retry=RetryPolicy(max_retries=0))

    def judge(self, state: dict, questions: dict[str, dict]) -> JudgeResult:
        from typesafe_sdk import TypeSafeAPIError, TypeSafeAPITimeoutError, TypeSafeError

        t0 = time.perf_counter()
        try:
            resp = self._client.system_one(state=state, questions=questions, model=self.model)
        except (TypeSafeAPITimeoutError, TypeSafeAPIError, TypeSafeError) as e:
            raise JudgeUnavailable(str(e)) from e
        lat = (time.perf_counter() - t0) * 1000.0
        answers = {k: v.model_dump(mode="json") for k, v in resp.answers.items()}
        return JudgeResult(
            answers=answers,
            latency_ms=lat,
            model=resp.model,
            input_tokens=resp.usage.input_tokens,
            output_tokens=resp.usage.output_tokens,
        )


def neutral_answers(questions: dict[str, dict]) -> dict[str, dict]:
    """A maximally cautious answer set: neutral direction, quality 0, risk safe. Useful default for stubs."""
    out: dict[str, dict] = {}
    for name, q in questions.items():
        t = q["type"]
        if t == "choice":
            keys = list(q["criteria"].keys())
            pick = "neutral" if "neutral" in keys else ("mean_reverting" if "mean_reverting" in keys else ("safe" if "safe" in keys else keys[0]))
            probs = {k: (0.0 if k != pick else 1.0) for k in keys}
            out[name] = {"type": "choice", "choice": pick, "confidence": 1.0, "probabilities": probs}
        elif t == "score":
            n = len(q["criteria"])
            out[name] = {"type": "score", "score": 0.0, "confidence": 1.0, "probabilities": {str(i): (1.0 if i == 0 else 0.0) for i in range(n)}}
        elif t == "noul":
            out[name] = {"type": "noul", "noul": 0.0}
    return out


@dataclass
class StubJudge:
    """Deterministic judge for tests, replay and paper mode. `scripted` lets a test inject any answers."""

    scripted: Optional[Callable[[dict, dict[str, dict]], dict[str, dict]]] = None
    latency_ms: float = 81.0
    calls: int = field(default=0)
    fail_next: int = 0

    def judge(self, state: dict, questions: dict[str, dict]) -> JudgeResult:
        self.calls += 1
        if self.fail_next > 0:
            self.fail_next -= 1
            raise JudgeUnavailable("stub failure")
        answers = self.scripted(state, questions) if self.scripted else neutral_answers(questions)
        return JudgeResult(answers=answers, latency_ms=self.latency_ms, model="stub")
