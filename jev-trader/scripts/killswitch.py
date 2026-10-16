#!/usr/bin/env python3
"""Operator kill switch. `arm` blocks every automated order before it reaches an exchange; `disarm` re-enables;
`status` prints both the kill switch and the risk HALTED latch; `clear-halt` removes the latch after review."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from jev_trader.risk import load_limits


def main() -> int:
    cmd = sys.argv[1] if len(sys.argv) > 1 else "status"
    L = load_limits("config/risk.yaml")
    ks, hl = Path(L.kill_switch_path), Path(L.halt_latch_path)
    if cmd == "arm":
        ks.parent.mkdir(parents=True, exist_ok=True)
        ks.write_text("armed by operator\n")
    elif cmd == "disarm":
        ks.unlink(missing_ok=True)
    elif cmd == "clear-halt":
        hl.unlink(missing_ok=True)
    print(f"kill_switch={'ARMED' if ks.exists() else 'off'} halted={'YES: ' + hl.read_text().strip() if hl.exists() else 'no'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
