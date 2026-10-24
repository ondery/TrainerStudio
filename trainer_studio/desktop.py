"""Start the local server and open a window or the browser."""

from __future__ import annotations

import logging
import logging.handlers
import os
import socket
import threading
import time
import urllib.request
import webbrowser

from trainer_studio.db import data_dir
from trainer_studio.messages import text

HOST = os.environ.get("STUDIO_HOST", "127.0.0.1")
PORT = int(os.environ.get("STUDIO_PORT", "43150"))


def configure_log() -> None:
    path = data_dir() / "logs" / "server.log"
    path.parent.mkdir(parents=True, exist_ok=True)
    handler = logging.handlers.RotatingFileHandler(path, maxBytes=1_048_576, backupCount=3, encoding="utf-8")
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
    root = logging.getLogger()
    root.setLevel(logging.INFO)
    root.addHandler(handler)


def healthy(port: int = PORT) -> bool:
    try:
        with urllib.request.urlopen(f"http://{HOST}:{port}/api/health", timeout=1) as response:
            return response.status == 200
    except Exception:
        return False


def port_open(port: int = PORT) -> bool:
    try:
        with socket.create_connection((HOST, port), timeout=0.4):
            return True
    except OSError:
        return False


def serve(port: int = PORT) -> None:
    import uvicorn

    uvicorn.run("trainer_studio.api:app", host=HOST, port=port, log_level="info")


def open_browser(url: str) -> None:
    webbrowser.open(url)


def open_window(url: str) -> bool:
    try:
        import webview
    except Exception:
        print(text("desktop.window"))
        return False
    webview.create_window("Trainer Studio", url, width=1440, height=900)
    webview.start()
    return True


def main() -> None:
    configure_log()
    url = f"http://{HOST}:{PORT}"
    if healthy():
        print(text("desktop.already", url=url))
        if not open_window(url):
            open_browser(url)
        return
    if port_open():
        print(text("desktop.port", port=PORT))
        return
    print(text("desktop.url", url=url))
    print(text("desktop.close"))

    def later() -> None:
        for _ in range(80):
            if healthy():
                if not open_window(url):
                    open_browser(url)
                return
            time.sleep(0.25)

    # pywebview must run on the main thread. The server is the background thread
    # only when a window library is present. Otherwise the server stays in front
    # and the browser opens beside it.
    try:
        import webview  # noqa: F401
        have_window = True
    except Exception:
        have_window = False
    if have_window:
        threading.Thread(target=serve, name="trainer-studio", daemon=True).start()
        for _ in range(80):
            if healthy():
                break
            time.sleep(0.25)
        open_window(url)
        return
    threading.Thread(target=later, name="trainer-studio-open", daemon=True).start()
    serve()
