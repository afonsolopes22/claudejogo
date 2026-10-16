"""jev_trader: Brain/Reflex autonomous trading agent.

Layering (never blurred):
  BRAIN  (Claude Opus 5.5)  -> research, schema derivation, escalations, nightly review  (slow, deep)
  REFLEX (TypeSafe Jev)     -> typed calibrated judgement on every candle                 (fast, ~100ms)
  CODE   (this package)     -> every threshold, size, side-effect, and hard limit          (deterministic)
"""
__version__ = "0.1.0"
