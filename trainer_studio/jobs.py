"""Background jobs for auto-label, training and batch SAM."""

from __future__ import annotations

import json
import threading
import traceback
import uuid
from typing import Callable

from trainer_studio.db import connect, transaction
from trainer_studio.errors import StudioError
from trainer_studio.importer import now
from trainer_studio.messages import text

_RUNNERS: dict[str, Callable] = {}
_CANCEL: dict[str, threading.Event] = {}


def register(kind: str, fn: Callable) -> None:
    _RUNNERS[kind] = fn


def runner(kind: str) -> Callable | None:
    return _RUNNERS.get(kind)


def list_jobs(project_id: str | None = None) -> list[dict]:
    with transaction():
        conn = connect()
        try:
            if project_id:
                rows = conn.execute("SELECT * FROM jobs WHERE project_id = ? ORDER BY created_at DESC", (project_id,)).fetchall()
            else:
                rows = conn.execute("SELECT * FROM jobs ORDER BY created_at DESC LIMIT 100").fetchall()
            return [_public(row) for row in rows]
        finally:
            conn.close()


def get_job(job_id: str) -> dict:
    with transaction():
        conn = connect()
        try:
            row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
            if row is None:
                raise StudioError(code="job.missing", status=404)
            return _public(row)
        finally:
            conn.close()


def _public(row) -> dict:
    raw = row["message"] or ""
    code = raw[1:] if raw.startswith("@") else ""
    payload = json.loads(row["payload"] or "{}")
    params = payload.get("messageParams") if isinstance(payload, dict) else {}
    if not isinstance(params, dict):
        params = {}
    return {
        "id": row["id"],
        "projectId": row["project_id"],
        "kind": row["kind"],
        "status": row["status"],
        "progress": row["progress"],
        "message": text(code, **params) if code else raw,
        "messageCode": code,
        "messageParams": params,
        "payload": payload,
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def _update(job_id: str, **fields) -> None:
    sets = []
    values = []
    for key, value in fields.items():
        sets.append(f"{key} = ?")
        values.append(value)
    sets.append("updated_at = ?")
    values.append(now())
    values.append(job_id)
    with transaction():
        conn = connect()
        try:
            conn.execute(f"UPDATE jobs SET {', '.join(sets)} WHERE id = ?", values)
            conn.commit()
        finally:
            conn.close()


def note(job_id: str, message: str, progress: float | None = None, metrics: dict | None = None) -> None:
    job = get_job(job_id)
    payload = job["payload"] if isinstance(job["payload"], dict) else {}
    logs = [str(item) for item in payload.get("logs") or []]
    logs.append(message)
    payload["logs"] = logs[-120:]
    if metrics:
        payload["metrics"] = {str(key): value for key, value in metrics.items()}
    fields: dict = {"message": message[:400], "payload": json.dumps(payload, ensure_ascii=False)}
    if progress is not None:
        fields["progress"] = max(0.0, min(1.0, float(progress)))
    _update(job_id, **fields)


def start(kind: str, project_id: str | None, payload: dict) -> dict:
    fn = _RUNNERS.get(kind)
    if fn is None:
        raise StudioError(code="job.kind")
    job_id = uuid.uuid4().hex
    stamp = now()
    with transaction():
        conn = connect()
        try:
            conn.execute(
                """INSERT INTO jobs (id, project_id, kind, status, progress, message, payload, created_at, updated_at)
                   VALUES (?, ?, ?, 'queued', 0, '', ?, ?, ?)""",
                (job_id, project_id, kind, json.dumps(payload), stamp, stamp),
            )
            conn.commit()
        finally:
            conn.close()
    cancel = threading.Event()
    _CANCEL[job_id] = cancel

    def run() -> None:
        _update(job_id, status="running", message="@job.started")

        def progress(value: float, message: str = "") -> None:
            if cancel.is_set():
                raise RuntimeError(text("job.cancelled"))
            _update(job_id, progress=max(0.0, min(1.0, float(value))), message=message[:400])

        try:
            call = dict(payload)
            call["jobId"] = job_id
            result = fn(call, progress, cancel)
            latest = get_job(job_id)["payload"]
            logs = latest.get("logs") if isinstance(latest, dict) else []
            metrics = latest.get("metrics") if isinstance(latest, dict) else None
            body = {"request": payload, "result": result, "logs": logs or []}
            if metrics:
                body["metrics"] = metrics
            _update(job_id, status="done", progress=1, message="@job.done", payload=json.dumps(body, ensure_ascii=False))
        except Exception as exc:  # noqa: BLE001 - job failures are stored for the UI
            status = "cancelled" if cancel.is_set() else "failed"
            latest = {}
            try:
                latest = get_job(job_id)["payload"]
            except Exception:
                latest = {}
            logs = latest.get("logs") if isinstance(latest, dict) else []
            params = {}
            if cancel.is_set():
                message = "@job.cancelled"
            elif isinstance(exc, StudioError):
                message = f"@{exc.code}"
                params = exc.params or {}
            else:
                message = str(exc)[:500]
            _update(
                job_id,
                status=status,
                message=message,
                payload=json.dumps({
                    "request": payload,
                    "error": traceback.format_exc()[-2000:],
                    "logs": logs or [],
                    "messageParams": params,
                }, ensure_ascii=False),
            )

    threading.Thread(target=run, name=f"job-{kind}", daemon=True).start()
    return get_job(job_id)


def cancel(job_id: str) -> dict:
    event = _CANCEL.get(job_id)
    if event:
        event.set()
    _update(job_id, message="@job.cancel")
    return get_job(job_id)
