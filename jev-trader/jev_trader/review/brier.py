"""Calibration metrics. Pure functions over (probability, outcome) pairs."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence

import numpy as np


@dataclass(frozen=True)
class Calibration:
    n: int
    brier: float
    brier_climatology: float  # Brier of always predicting the base rate
    skill: float              # 1 - brier/brier_climatology  (>0 means better than base rate)
    ece: float                # expected calibration error over bins
    bins: list[tuple[float, float, int]]  # (mean predicted, observed frequency, count)


def brier_score(p: Sequence[float], y: Sequence[int]) -> float:
    p = np.asarray(p, dtype=float)
    y = np.asarray(y, dtype=float)
    if len(p) == 0:
        return float("nan")
    return float(np.mean((p - y) ** 2))


def calibration(p: Sequence[float], y: Sequence[int], n_bins: int = 10) -> Calibration:
    p = np.asarray(p, dtype=float)
    y = np.asarray(y, dtype=float)
    n = len(p)
    if n == 0:
        return Calibration(0, float("nan"), float("nan"), float("nan"), float("nan"), [])
    b = brier_score(p, y)
    base = float(np.mean(y))
    bclim = float(np.mean((base - y) ** 2))
    # Degenerate base rate (all 0 or all 1): climatology is perfect, so any error is negative skill.
    skill = 1.0 - b / bclim if bclim > 0 else (0.0 if b == 0 else -1.0)
    edges = np.linspace(0, 1, n_bins + 1)
    idx = np.clip(np.digitize(p, edges[1:-1]), 0, n_bins - 1)
    bins = []
    ece = 0.0
    for k in range(n_bins):
        m = idx == k
        c = int(m.sum())
        if c == 0:
            continue
        mp, of = float(p[m].mean()), float(y[m].mean())
        bins.append((mp, of, c))
        ece += c / n * abs(mp - of)
    return Calibration(n, b, bclim, skill, ece, bins)
