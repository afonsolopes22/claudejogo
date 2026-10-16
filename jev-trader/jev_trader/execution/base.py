from __future__ import annotations

from typing import Iterator, Optional, Protocol

from ..state_engine import Funding, L2Book, Trade
from ..types import Fill, Intent, RiskApproval


class Feed(Protocol):
    """Yields market events in causal order. Each item is a candle-close bundle for one symbol."""

    def __iter__(self) -> Iterator[tuple[L2Book, list[Trade], Optional[Funding]]]: ...


class ExchangeAdapter(Protocol):
    def submit(self, intent: Intent, approval: RiskApproval, book: L2Book) -> Optional[Fill]: ...
