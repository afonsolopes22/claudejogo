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


@dataclass
class DemoJudge:
    """DEMO ONLY. A transparent heuristic that turns the snapshot's own momentum into plausible verdicts so the UI
    shows entries, exits and escalations without an API key. It has no skill by construction; it exists so the
    plumbing can be watched. Never use its output as evidence of anything."""

    latency_ms: float = 81.0
    crisis_every: int = 97
    calls: int = field(default=0)

    def judge(self, state: dict, questions: dict[str, dict]) -> JudgeResult:
        import math
        import random

        self.calls += 1
        rng = random.Random(self.calls)
        snaps = {s["sym"]: s for s in state.get("snapshots", [])}
        out: dict[str, dict] = {}
        crisis = self.calls % self.crisis_every == 0
        for name, q in questions.items():
            sym = name.split(".")[0]
            s = snaps.get(sym, {})
            rs, rl, rvl = s.get("rS", 0.0), s.get("rL", 0.0), max(s.get("rvL", 1.0), 1.0)
            z = rl / (rvl * math.sqrt(12))  # momentum z-score over the long window
            p_long = 1 / (1 + math.exp(-2.2 * z))
            p_long = min(max(p_long, 0.02), 0.98)
            if name.endswith(".regime"):
                probs = {"trending": 0.1, "mean_reverting": 0.1, "high_vol": 0.1, "crisis": 0.0}
                pick = "crisis" if crisis else ("trending" if abs(z) > 0.8 else ("high_vol" if s.get("rvS", 0) > 1.5 * rvl else "mean_reverting"))
                probs[pick] = 0.7
                tot = sum(probs.values()); probs = {k: v / tot for k, v in probs.items()}
                out[name] = {"type": "choice", "choice": pick, "confidence": probs[pick], "probabilities": probs}
            elif name.endswith(".direction"):
                pn = 0.08
                probs = {"long": p_long * (1 - pn), "short": (1 - p_long) * (1 - pn), "neutral": pn}
                pick = max(probs, key=probs.get)
                out[name] = {"type": "choice", "choice": pick, "confidence": probs[pick], "probabilities": probs}
            elif name.endswith(".toxic_flow"):
                out[name] = {"type": "noul", "noul": min(0.95, max(0.02, abs(s.get("flow", 0.0)) * 0.6 + rng.random() * 0.2))}
            elif name.endswith(".setup_quality"):
                strength = min(abs(z) / 1.5, 1.0)
                p3 = 0.5 * strength ** 2; p2 = 0.5 * strength; p1 = 0.3 * (1 - strength); p0 = max(0.0, 1 - p3 - p2 - p1)
                probs = {"0": p0, "1": p1, "2": p2, "3": p3}
                score = sum(int(k) * v for k, v in probs.items())
                out[name] = {"type": "score", "score": score, "confidence": max(probs.values()), "probabilities": probs}
            elif name.endswith(".risk_state"):
                dd, dp, inv = s.get("dd", 0.0), -min(s.get("dPnl", 0.0), 0.0), s.get("invPct", 0.0)
                pick = "reduce" if (dd >= 15 or dp >= 3 or inv >= 20) else ("near_limit" if (dd >= 7.5 or dp >= 1.5 or inv >= 10) else "safe")
                probs = {"safe": 0.1, "near_limit": 0.1, "reduce": 0.1}; probs[pick] = 0.8
                out[name] = {"type": "choice", "choice": pick, "confidence": 0.8, "probabilities": probs}
        return JudgeResult(answers=out, latency_ms=self.latency_ms, model="demo-heuristic")
