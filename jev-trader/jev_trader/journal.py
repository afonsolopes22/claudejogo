"""Append-only JSONL journal. Every snapshot, verdict, intent, risk decision, fill and escalation is recorded with
both the event ts (causal) and the wall clock, so the nightly review can replay the session exactly."""
from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any, Iterator


class Journal:
    def __init__(self, path: str | Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._fh = open(self.path, "a", buffering=1)

    def write(self, kind: str, ts: int, payload: dict[str, Any]) -> None:
        rec = {"kind": kind, "ts": ts, "wall_ms": int(time.time() * 1000), **payload}
        self._fh.write(json.dumps(rec, separators=(",", ":"), default=_default) + "\n")

    def close(self) -> None:
        self._fh.close()

    @staticmethod
    def read(path: str | Path) -> Iterator[dict]:
        with open(path) as f:
            for line in f:
                line = line.strip()
                if line:
                    yield json.loads(line)


def _default(o: Any) -> Any:
    if hasattr(o, "model_dump"):
        return o.model_dump(mode="json")
    if hasattr(o, "value"):
        return o.value
    raise TypeError(f"not serializable: {type(o)}")
