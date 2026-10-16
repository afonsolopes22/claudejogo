import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from jev_trader.risk import RiskLimits  # noqa: E402
from jev_trader.schema import RiskHints, SetupBook, SetupSpec, load_setups  # noqa: E402
from jev_trader.state_engine import BookLevel, L2Book  # noqa: E402


@pytest.fixture
def book() -> SetupBook:
    return load_setups(ROOT / "config" / "setups.yaml")


@pytest.fixture
def mini_book() -> SetupBook:
    import datetime as dt

    return SetupBook(
        version="v0.1",
        as_of=dt.date(2026, 10, 16),
        setups=[
            SetupSpec(symbol="HYPE", bias="long", thesis="t", bear_case="b", invalidation=["i"], stop_bps=300, target_bps=600, horizon_bars=10, max_notional_pct=20),
            SetupSpec(symbol="MON", bias="short", thesis="t", bear_case="b", invalidation=["i"], stop_bps=500, target_bps=1000, horizon_bars=10, max_notional_pct=10),
        ],
    )


@pytest.fixture
def limits(tmp_path) -> RiskLimits:
    return RiskLimits(kill_switch_path=str(tmp_path / "KILL"), halt_latch_path=str(tmp_path / "HALTED"), min_order_notional_usd=1.0)


@pytest.fixture
def hints() -> RiskHints:
    return RiskHints(max_drawdown_pct=15, max_daily_loss_pct=3, max_position_notional_pct=20)


def make_book(symbol: str, ts: int, mid: float, spread_bps: float = 4.0, depth_usd: float = 1_000_000.0, skew: float = 0.0) -> L2Book:
    h = mid * spread_bps / 2e4
    q = depth_usd / 5 / mid
    bids = [BookLevel(mid - h - k * h, q * (1 + skew)) for k in range(5)]
    asks = [BookLevel(mid + h + k * h, q * (1 - skew)) for k in range(5)]
    return L2Book(symbol, ts, bids, asks)
