"""Local control panel. Zero extra dependencies (stdlib HTTP server). Run:  python -m jev_trader.ui.server
Then open http://127.0.0.1:8787. Everything the UI does goes through the same code paths as the scripts."""
from __future__ import annotations

import datetime as dt
import json
import os
import shutil
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Optional
from urllib.parse import parse_qs, urlparse

from .. import _yaml

from ..review.nightly import propose_revision, review, write_proposed_book, write_report
from ..risk import RiskLimits, load_limits
from ..schema import SetupBook, load_setups
from ..alerts import AlertConfig, AlertManager, sinks_from_env
from ..policy import Gates, Policy
from .runner import RunConfig, Runner

ROOT = Path(__file__).resolve().parents[2]
STATIC = Path(__file__).resolve().parent / "static"


class Api:
    def __init__(self, root: Path):
        self.root = root
        self.runner = Runner(root)

    # ---- reads ----
    def state(self) -> dict:
        limits = load_limits(self.root / "config/risk.yaml")
        ks, hl = self.root / limits.kill_switch_path, self.root / limits.halt_latch_path
        d = self.runner.snapshot()
        d["kill_switch"] = ks.exists()
        d["halted"] = hl.read_text().strip() if hl.exists() else None
        d["env"] = {"typesafe_key": bool(os.environ.get("TYPESAFE_API_KEY")), "anthropic_key": bool(os.environ.get("ANTHROPIC_API_KEY"))}
        d["limits"] = limits.model_dump()
        return d

    def config(self) -> dict:
        return {
            "setups": (self.root / "config/setups.yaml").read_text(),
            "risk": (self.root / "config/risk.yaml").read_text(),
        }

    def doc(self, name: str) -> str:
        allowed = {p.name: p for p in (self.root / "docs").glob("*.md")}
        allowed["README.md"] = self.root / "README.md"
        if name not in allowed:
            raise KeyError(name)
        return allowed[name].read_text()

    def journal_tail(self, n: int) -> list[dict]:
        p = self.root / "data/journal.jsonl"
        if not p.exists():
            return []
        lines = p.read_text().splitlines()[-n:]
        return [json.loads(l) for l in lines if l.strip()]

    def alerts(self, since: int) -> dict:
        return {
            "alerts": [a.model_dump(mode="json") for a in self.runner.alert_sink.since(since)],
            "channels": {
                "telegram": bool(os.environ.get("TELEGRAM_BOT_TOKEN") and os.environ.get("TELEGRAM_CHAT_ID")),
                "webhook": bool(os.environ.get("JEV_WEBHOOK_URL")),
            },
            "levels": sorted(self.runner.alert_config.levels),
            "watch_conf": self.runner.alert_config.watch_conf,
        }

    def set_alert_levels(self, levels: list[str], watch_conf: Optional[float]) -> dict:
        ok = {"setup", "watch", "fill", "risk"}
        bad = set(levels) - ok
        if bad:
            raise ValueError(f"níveis inválidos: {sorted(bad)}")
        cfg = self.runner.alert_config
        cfg.levels = frozenset(levels)
        if watch_conf is not None:
            cfg.watch_conf = float(watch_conf)
        return {"ok": True, "levels": sorted(cfg.levels), "watch_conf": cfg.watch_conf}

    def test_alert(self) -> dict:
        mgr = self.runner.alerts or AlertManager(policy=Policy(Gates()), sinks=[self.runner.alert_sink, *sinks_from_env()], config=self.runner.alert_config)
        a = mgr.test_alert()
        return {"ok": True, "alert": a.model_dump(mode="json")}

    def reviews(self) -> list[dict]:
        out = []
        for p in sorted((self.root / "data").glob("review-*.md"), reverse=True):
            out.append({"name": p.name, "text": p.read_text()})
        return out

    # ---- writes ----
    def start(self, body: dict) -> dict:
        cfg = RunConfig(
            judge=body.get("judge", "stub"),
            brain=bool(body.get("brain", False)),
            bars=int(body.get("bars", 300)),
            delay_ms=int(body.get("delay_ms", 400)),
            equity=float(body.get("equity", 10_000)),
            vol_bps=float(body.get("vol_bps", 40)),
            replay=body.get("replay") or None,
        )
        if cfg.judge == "jev" and not os.environ.get("TYPESAFE_API_KEY"):
            raise ValueError("TYPESAFE_API_KEY não definida: exporta a chave antes de arrancar o servidor")
        if cfg.brain and not os.environ.get("ANTHROPIC_API_KEY"):
            raise ValueError("ANTHROPIC_API_KEY não definida")
        self.runner.start(cfg)
        return {"ok": True}

    def stop(self) -> dict:
        self.runner.stop()
        return {"ok": True}

    def kill(self, armed: bool) -> dict:
        limits = load_limits(self.root / "config/risk.yaml")
        p = self.root / limits.kill_switch_path
        if armed:
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text("armed from UI\n")
        else:
            p.unlink(missing_ok=True)
        return {"ok": True, "armed": p.exists()}

    def clear_halt(self) -> dict:
        limits = load_limits(self.root / "config/risk.yaml")
        (self.root / limits.halt_latch_path).unlink(missing_ok=True)
        return {"ok": True}

    def save_config(self, which: str, text: str) -> dict:
        data = _yaml.load(text)
        if which == "setups":
            SetupBook.model_validate(data)
            path = self.root / "config/setups.yaml"
        elif which == "risk":
            RiskLimits.model_validate(data)
            path = self.root / "config/risk.yaml"
        else:
            raise ValueError("unknown config")
        shutil.copy(path, path.with_suffix(f".bak-{dt.datetime.now(dt.timezone.utc).strftime('%Y%m%d%H%M%S')}.yaml"))
        path.write_text(text)
        return {"ok": True, "note": "guardado; aplica-se no próximo arranque do loop"}

    def run_review(self) -> dict:
        book = load_setups(self.root / "config/setups.yaml")
        jp = self.root / "data/journal.jsonl"
        if not jp.exists():
            raise ValueError("sem journal ainda: corre o loop primeiro")
        today = dt.date.today()
        revs = review(jp, book)
        prop = propose_revision(revs, book, today)
        out = self.root / "data"
        text = write_report(out / f"review-{today.isoformat()}.md", revs, prop, today)
        write_proposed_book(out / "setups.proposed.yaml", prop)
        return {"ok": True, "report": text, "proposals": prop["proposals"], "proposed_version": prop["proposed_book"]["version"]}

    def approve_review(self) -> dict:
        proposed = self.root / "data/setups.proposed.yaml"
        if not proposed.exists():
            raise ValueError("nada para aprovar")
        load_setups(proposed)
        target = self.root / "config/setups.yaml"
        shutil.copy(target, self.root / f"data/setups.backup-{dt.date.today().isoformat()}.yaml")
        shutil.copy(proposed, target)
        return {"ok": True}


API = Api(ROOT)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):  # quiet
        pass

    def _json(self, obj, status=200):
        body = json.dumps(obj, default=str).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _text(self, text: str, ctype="text/html; charset=utf-8", status=200):
        body = text.encode()
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        u = urlparse(self.path)
        q = parse_qs(u.query)
        try:
            if u.path in ("/", "/index.html"):
                return self._text((STATIC / "index.html").read_text())
            if u.path == "/api/state":
                return self._json(API.state())
            if u.path == "/api/config":
                return self._json(API.config())
            if u.path == "/api/doc":
                return self._json({"text": API.doc(q.get("name", ["README.md"])[0])})
            if u.path == "/api/journal":
                return self._json(API.journal_tail(int(q.get("n", ["200"])[0])))
            if u.path == "/api/reviews":
                return self._json(API.reviews())
            if u.path == "/api/alerts":
                return self._json(API.alerts(int(q.get("since", ["0"])[0])))
            return self._json({"error": "not found"}, 404)
        except Exception as e:
            return self._json({"error": str(e)}, 400)

    def do_POST(self):
        u = urlparse(self.path)
        n = int(self.headers.get("Content-Length") or 0)
        body = json.loads(self.rfile.read(n) or b"{}")
        try:
            if u.path == "/api/start":
                return self._json(API.start(body))
            if u.path == "/api/stop":
                return self._json(API.stop())
            if u.path == "/api/kill":
                return self._json(API.kill(bool(body.get("armed"))))
            if u.path == "/api/clear-halt":
                return self._json(API.clear_halt())
            if u.path == "/api/config":
                return self._json(API.save_config(body["which"], body["text"]))
            if u.path == "/api/review":
                return self._json(API.run_review())
            if u.path == "/api/review/approve":
                return self._json(API.approve_review())
            if u.path == "/api/alerts/test":
                return self._json(API.test_alert())
            if u.path == "/api/alerts/config":
                return self._json(API.set_alert_levels(body.get("levels", []), body.get("watch_conf")))
            return self._json({"error": "not found"}, 404)
        except Exception as e:
            return self._json({"error": str(e)}, 400)


def main() -> int:
    host = os.environ.get("JEV_UI_HOST", "127.0.0.1")
    port = int(os.environ.get("JEV_UI_PORT", "8787"))
    srv = ThreadingHTTPServer((host, port), Handler)
    print(f"jev-trader UI em http://{host}:{port}  (Ctrl+C para sair)")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
