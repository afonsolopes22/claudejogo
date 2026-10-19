"""YAML shim: PyYAML when available, else ruamel.yaml (pure Python, so it installs on brand-new Python versions
such as 3.15 on Windows where PyYAML has no prebuilt wheel yet)."""
from __future__ import annotations

import io
from typing import Any

try:  # pragma: no cover - depends on the environment
    import yaml as _pyyaml

    def load(text: str) -> Any:
        return _pyyaml.safe_load(text)

    def dump(obj: Any) -> str:
        return _pyyaml.safe_dump(obj, sort_keys=False)

except ImportError:  # pragma: no cover
    from ruamel.yaml import YAML as _YAML

    def load(text: str) -> Any:
        return _YAML(typ="safe").load(text)

    def dump(obj: Any) -> str:
        y = _YAML(typ="safe")
        y.default_flow_style = False
        buf = io.StringIO()
        y.dump(obj, buf)
        return buf.getvalue()
