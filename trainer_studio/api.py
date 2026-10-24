"""HTTP API. The static UI is mounted after these routes."""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from trainer_studio.buildinfo import current as build_current
from trainer_studio.db import data_dir
from trainer_studio.errors import StudioError
from trainer_studio.jobs import cancel as cancel_job
from trainer_studio.jobs import get_job, list_jobs
from trainer_studio.jobs import start as start_job
from trainer_studio.messages import text
from trainer_studio.plugins import HOST
from trainer_studio.progress import snapshot as import_progress
from trainer_studio.runners import register_runners
from trainer_studio.sam import segment
from trainer_studio.service import (
    align_catalog,
    apply_template,
    class_apply,
    class_preview,
    create_project,
    create_snapshot,
    export_project,
    get_image,
    get_project,
    get_schema,
    image_file,
    image_raw,
    import_legacy_schema,
    list_classes,
    list_images,
    list_projects,
    list_snapshots,
    list_versions,
    mark_review,
    open_dataset,
    put_schema,
    qc_scan,
    save_image,
    set_task,
    settle_review,
    split_dataset,
    undo_class_change,
    update_class_style,
    validate_only,
)
from trainer_studio.thumbs import thumb_path

STATIC_CANDIDATES = [
    Path(__file__).resolve().parents[1] / "static",
    Path(__file__).resolve().parents[1] / "web" / "out",
]


def create_app() -> FastAPI:
    register_runners()
    app = FastAPI(title="Trainer Studio", version=build_current()["version"])

    @app.exception_handler(StudioError)
    async def studio_error(_request: Request, exc: StudioError):
        return JSONResponse(status_code=exc.status, content={"detail": exc.message, "code": exc.code, "params": exc.params})

    @app.get("/api/health")
    def health():
        from trainer_studio.local_access import session_token

        info = build_current()
        from trainer_studio.service import project_places

        places = project_places()
        return {
            "ok": True,
            "name": "Trainer Studio",
            "version": info["version"],
            "build": info["id"],
            "session": session_token(),
            "dataDir": str(data_dir()),
            "defaultProjects": places["defaultDir"],
            "installRoot": places["installRoot"],
        }

    @app.get("/api/import/progress")
    def import_status():
        return import_progress()

    @app.get("/api/projects")
    def projects():
        return {"projects": list_projects()}

    @app.post("/api/projects/open")
    def open_project(body: dict):
        return open_dataset(str(body.get("path") or ""), body.get("task"))

    @app.post("/api/projects")
    def create(body: dict):
        return create_project(str(body.get("path") or ""), str(body.get("name") or ""), str(body.get("template") or "blank"))

    @app.get("/api/projects/places")
    def project_places_route():
        from trainer_studio.service import project_places

        return project_places()

    @app.post("/api/projects/{project_id}/move")
    def project_move(project_id: str, body: dict):
        from trainer_studio.service import move_project

        return move_project(
            project_id,
            str(body.get("path") or ""),
            source=str(body.get("source") or ""),
            confirm=body.get("confirm") is True,
        )

    @app.get("/api/projects/{project_id}/tree")
    def project_tree_route(project_id: str):
        from trainer_studio.service import project_tree

        return project_tree(project_id)

    @app.post("/api/projects/{project_id}/folders")
    def project_folder(project_id: str, body: dict):
        from trainer_studio.service import make_folder

        return make_folder(project_id, str(body.get("path") or ""))

    @app.post("/api/projects/{project_id}/images/{image_id}/split")
    def image_split(project_id: str, image_id: str, body: dict):
        from trainer_studio.service import set_image_split

        return set_image_split(project_id, image_id, str(body.get("split") or ""))

    @app.get("/api/projects/{project_id}")
    def project(project_id: str):
        return get_project(project_id)

    @app.post("/api/projects/{project_id}/task")
    def task(project_id: str, body: dict):
        return set_task(project_id, str(body.get("task") or ""))

    @app.get("/api/projects/{project_id}/classes")
    def classes(project_id: str):
        return list_classes(project_id)

    @app.patch("/api/projects/{project_id}/classes/{key}")
    def class_style(project_id: str, key: str, body: dict):
        return update_class_style(project_id, key, body)

    @app.post("/api/projects/{project_id}/classes/preview")
    def preview_classes(project_id: str, body: dict):
        return class_preview(project_id, body)

    @app.post("/api/projects/{project_id}/classes/apply")
    def apply_classes(project_id: str, body: dict):
        op = str(body.get("op") or "")
        if op in {"delete", "reorder", "merge"} and body.get("confirm") is not True:
            preview = class_preview(project_id, body)
            preview["needsConfirm"] = True
            preview["applied"] = False
            return preview
        return class_apply(project_id, body)

    @app.post("/api/projects/{project_id}/classes/undo")
    def undo_classes(project_id: str):
        return undo_class_change(project_id)

    @app.post("/api/projects/{project_id}/catalog/align")
    def align(project_id: str):
        return align_catalog(project_id)

    @app.get("/api/projects/{project_id}/schema")
    def schema(project_id: str):
        return get_schema(project_id)

    @app.put("/api/projects/{project_id}/schema")
    def schema_put(project_id: str, body: dict):
        return put_schema(project_id, body.get("fields") or [])

    @app.post("/api/projects/{project_id}/schema/template")
    def schema_template(project_id: str, body: dict):
        return apply_template(project_id, str(body.get("template") or "blank"))

    @app.post("/api/projects/{project_id}/schema/legacy")
    async def schema_legacy(project_id: str, request: Request):
        source = None
        raw = await request.body()
        if raw:
            body = json.loads(raw)
            source = str(body.get("path") or "") or None
        return import_legacy_schema(project_id, source)

    def _session(request: Request) -> None:
        from trainer_studio.local_access import check_session

        check_session(request.headers.get("x-studio-session"))

    @app.post("/api/dialog")
    def dialog(body: dict, request: Request):
        from trainer_studio.dialogs import pick

        _session(request)
        filters = body.get("filters") if isinstance(body.get("filters"), list) else []
        return pick(str(body.get("kind") or "file"), filters, str(body.get("title") or ""), str(body.get("initial") or ""))

    @app.post("/api/local/read")
    def local_read(body: dict, request: Request):
        from trainer_studio.dialogs import read_local_text

        _session(request)
        return {"text": read_local_text(str(body.get("path") or ""), str(body.get("grant") or "") or None)}

    @app.post("/api/local/write")
    def local_write(body: dict, request: Request):
        from trainer_studio.dialogs import write_local_text

        _session(request)
        path = write_local_text(str(body.get("path") or ""), str(body.get("text") or ""), str(body.get("grant") or "") or None)
        return {"ok": True, "path": path}

    @app.get("/api/projects/{project_id}/images")
    def images(project_id: str):
        return {"images": list_images(project_id)}

    @app.get("/api/projects/{project_id}/images/{image_id}")
    def image(project_id: str, image_id: str):
        return get_image(project_id, image_id)

    @app.put("/api/projects/{project_id}/images/{image_id}")
    def image_save(project_id: str, image_id: str, body: dict):
        return save_image(project_id, image_id, body.get("annotations") or [], body.get("attributes"), body.get("status"))

    @app.get("/api/projects/{project_id}/images/{image_id}/raw")
    def image_raw_route(project_id: str, image_id: str):
        return image_raw(project_id, image_id)

    @app.get("/api/projects/{project_id}/images/{image_id}/file")
    def image_bytes(project_id: str, image_id: str):
        return FileResponse(image_file(project_id, image_id))

    @app.get("/api/projects/{project_id}/images/{image_id}/thumb")
    def image_thumb(project_id: str, image_id: str):
        source = image_file(project_id, image_id)
        return FileResponse(thumb_path(project_id, image_id, source))

    @app.post("/api/projects/{project_id}/export")
    def export(project_id: str, body: dict):
        precision = int(body.get("precision") or 6)
        skip_empty = bool(body.get("skipEmpty"))
        return export_project(project_id, body.get("task"), body.get("dest"), body.get("format"), bool(body.get("grouped")), precision, skip_empty)

    @app.post("/api/projects/{project_id}/split")
    def split(project_id: str, body: dict):
        return split_dataset(project_id, body.get("train", 0.8), body.get("val", 0.1), body.get("test", 0.1))

    @app.post("/api/projects/{project_id}/snapshots")
    def snapshot_create(project_id: str):
        return create_snapshot(project_id)

    @app.get("/api/projects/{project_id}/snapshots")
    def snapshot_list(project_id: str):
        return list_snapshots(project_id)

    @app.get("/api/projects/{project_id}/versions")
    def versions(project_id: str):
        return list_versions(project_id)

    @app.post("/api/projects/{project_id}/review/settle")
    def review_settle(project_id: str, body: dict):
        return settle_review(project_id, list(body.get("accept") or []), list(body.get("reject") or []))

    @app.get("/api/projects/{project_id}/export/validate")
    def export_validate(project_id: str, task: str | None = None):
        return validate_only(project_id, task)

    @app.get("/api/projects/{project_id}/qc")
    def qc(project_id: str):
        return qc_scan(project_id)

    @app.post("/api/projects/{project_id}/qc/review")
    def qc_review(project_id: str, body: dict):
        return mark_review(project_id, list(body.get("imageIds") or []))

    @app.get("/api/models")
    def models():
        from trainer_studio.detectors.base import catalog

        return {"backends": catalog(), "telemetry": False}

    @app.get("/api/jobs")
    def jobs(projectId: str | None = None):
        return {"jobs": list_jobs(projectId)}

    @app.post("/api/jobs")
    def jobs_start(body: dict):
        return start_job(str(body.get("kind") or ""), body.get("projectId"), body)

    @app.get("/api/jobs/{job_id}")
    def jobs_get(job_id: str):
        return get_job(job_id)

    @app.post("/api/jobs/{job_id}/cancel")
    def jobs_cancel(job_id: str):
        return cancel_job(job_id)

    @app.get("/api/jobs/{job_id}/best")
    def jobs_best(job_id: str):
        job = get_job(job_id)
        payload = job.get("payload") or {}
        result = payload.get("result") if isinstance(payload, dict) else {}
        raw = str((result or {}).get("best") or "")
        path = Path(raw)
        request = payload.get("request") if isinstance(payload, dict) else {}
        if not isinstance(request, dict):
            request = {}
        custom = str(request.get("output") or "").strip()
        roots = [(data_dir() / "runs").resolve()]
        if custom:
            roots.append(Path(custom).expanduser().resolve())
        resolved = path.resolve() if raw else path
        allowed = raw and path.is_file() and path.suffix.lower() == ".pt" and any(resolved.is_relative_to(root) for root in roots)
        if not allowed:
            raise StudioError(code="train.best", status=404)
        return FileResponse(path, filename="best.pt")

    @app.get("/api/ai/status")
    def ai_status():
        from trainer_studio.deps import probe
        from trainer_studio.sam import models

        body = probe()
        body["models"] = models()
        return body

    @app.post("/api/ai/install")
    def ai_install():
        return start_job("ai-install", None, {})

    @app.post("/api/projects/{project_id}/sam")
    def sam(project_id: str, body: dict):
        path = image_file(project_id, str(body.get("imageId") or ""))
        return segment(path, body.get("points") or [], body.get("labels"), body.get("model"), body.get("device"))

    @app.post("/api/projects/{project_id}/images/{image_id}/prelabel")
    def prelabel(project_id: str, image_id: str, body: dict | None = None):
        from trainer_studio.runners import prelabel_one

        return prelabel_one(project_id, image_id, body or {})

    @app.get("/api/plugins")
    def plugins():
        HOST.discover()
        return {"plugins": HOST.public()}

    @app.post("/api/plugins/{plugin_id}/enabled")
    def plugin_enabled(plugin_id: str, body: dict):
        HOST.set_enabled(plugin_id, bool(body.get("enabled")))
        return {"plugins": HOST.public()}

    @app.get("/api/plugins/file/{plugin_id}/{relative:path}")
    def plugin_file(plugin_id: str, relative: str):
        HOST.discover()
        return FileResponse(HOST.file(plugin_id, relative))

    async def plugin_ext(plugin_id: str, rest: str, request: Request):
        HOST.discover()
        path = request.url.path
        body = {}
        if request.method in {"POST", "PUT"}:
            raw = await request.body()
            if raw:
                body = json.loads(raw)
        for route in HOST.routes():
            if route["method"] == request.method and route["path"] == path:
                result = route["fn"](body, request)
                return result
        raise StudioError(code="plugin.route", status=404)

    for _method, _operation_id in (
        ("GET", "plugin_ext_get"),
        ("POST", "plugin_ext_post"),
        ("PUT", "plugin_ext_put"),
        ("DELETE", "plugin_ext_delete"),
    ):
        app.add_api_route(
            "/api/plugins/ext/{plugin_id}/{rest:path}",
            plugin_ext,
            methods=[_method],
            operation_id=_operation_id,
            name=_operation_id,
        )

    @app.get("/api/ee/status")
    def ee_status():
        from trainer_studio.enterprise import license_status

        return license_status()

    @app.post("/api/license")
    def license_put(body: dict):
        from trainer_studio.enterprise import save_license

        return save_license(str(body.get("token") or ""))

    @app.post("/api/fs/reveal")
    def fs_reveal(body: dict, request: Request):
        from trainer_studio.files import reveal_project

        _session(request)
        return reveal_project(str(body.get("project") or ""), str(body.get("path") or ""))

    @app.post("/api/projects/{project_id}/rename")
    def project_rename(project_id: str, body: dict):
        from trainer_studio.enterprise import rename_entry

        return rename_entry(project_id, str(body.get("path") or ""), str(body.get("name") or ""))

    @app.post("/api/projects/{project_id}/forget")
    def project_forget(project_id: str):
        from trainer_studio.enterprise import delete_project

        return delete_project(project_id)

    @app.post("/api/ee/video")
    def ee_video(body: dict):
        from trainer_studio.enterprise import extract_frames

        return extract_frames(str(body.get("source") or ""), str(body.get("dest") or ""))

    @app.get("/api/ee/camera")
    def ee_camera(index: int = 0):
        from trainer_studio.enterprise import camera_status

        return camera_status(index)

    @app.post("/api/ee/remote")
    def ee_remote(body: dict):
        from trainer_studio.enterprise import import_remote

        return import_remote(str(body.get("url") or ""), str(body.get("dest") or ""))

    @app.post("/api/ee/marketplace")
    def ee_market(body: dict):
        from trainer_studio.enterprise import install_plugin

        return install_plugin(str(body.get("source") or ""))

    @app.get("/api/ee/popout")
    def ee_popout(panel: str = "layers"):
        from trainer_studio.enterprise import popout

        return popout(panel)

    @app.post("/api/ee/folders")
    def ee_folders(body: dict):
        from trainer_studio.enterprise import add_folder

        return add_folder(str(body.get("project") or ""), str(body.get("path") or ""))

    @app.get("/api/ee/link")
    def ee_link_ready():
        from trainer_studio.enterprise import require_feature

        require_feature("link")
        return {"ready": True}

    @app.post("/api/ee/link")
    def ee_link(body: dict):
        from trainer_studio.enterprise import link_shapes

        return link_shapes(str(body.get("from") or ""), str(body.get("to") or ""))

    @app.post("/api/ee/cut")
    def ee_cut(body: dict):
        from trainer_studio.enterprise import cut_files

        paths = body.get("paths") if isinstance(body.get("paths"), list) else []
        return cut_files(str(body.get("project") or ""), [str(item) for item in paths])

    @app.post("/api/ee/paste")
    def ee_paste(body: dict):
        from trainer_studio.enterprise import paste_files

        return paste_files(str(body.get("project") or ""), str(body.get("dest") or "images"))

    @app.get("/api/ee/teams")
    def ee_teams():
        from trainer_studio.enterprise import current_role, require_feature

        require_feature("rbac")
        return {"ready": True, "role": current_role()}

    @app.post("/api/ee/teams")
    def ee_teams_set(body: dict):
        from trainer_studio.enterprise import set_role

        return set_role(str(body.get("role") or ""))

    @app.get("/api/ee/sso")
    def ee_sso():
        from trainer_studio.enterprise import require_feature

        require_feature("sso")
        return {"ready": True}

    @app.post("/api/ee/sso")
    def ee_sso_login(body: dict):
        from trainer_studio.enterprise import sso_login

        return sso_login(str(body.get("token") or ""))

    @app.get("/api/ee/audit")
    def ee_audit():
        from trainer_studio.enterprise import audit_lines

        return {"ready": True, "lines": audit_lines()}

    @app.post("/api/ee/audit")
    def ee_audit_add(body: dict):
        from trainer_studio.enterprise import record_audit

        detail = body.get("detail") if isinstance(body.get("detail"), dict) else {}
        return record_audit(str(body.get("event") or "note"), detail)

    @app.get("/api/ee/review")
    def ee_review(project: str = "", reviewer: str = ""):
        from trainer_studio.enterprise import review_for

        return review_for(project, reviewer)

    @app.post("/api/ee/review")
    def ee_review_set(body: dict):
        from trainer_studio.enterprise import assign_review

        return assign_review(str(body.get("project") or ""), str(body.get("image") or ""), str(body.get("reviewer") or ""))

    @app.get("/api/ee/storage")
    def ee_storage():
        from trainer_studio.enterprise import require_feature

        require_feature("postgres")
        return {"ready": True}

    @app.post("/api/ee/storage")
    def ee_storage_open(body: dict):
        from trainer_studio.enterprise import open_store

        return open_store(str(body.get("url") or ""))

    @app.post("/api/ee/s3")
    def ee_s3(body: dict):
        from trainer_studio.enterprise import put_object

        return put_object(str(body.get("url") or ""), str(body.get("text") or "").encode("utf-8"), str(body.get("accessKey") or ""), str(body.get("secret") or ""))

    @app.get("/api/ee/queue")
    def ee_queue():
        from trainer_studio.enterprise import queue_snapshot

        return queue_snapshot()

    @app.post("/api/ee/queue")
    def ee_queue_add(body: dict):
        from trainer_studio.enterprise import enqueue

        return enqueue(str(body.get("kind") or "train"))

    @app.post("/api/ee/queue/claim")
    def ee_queue_claim():
        from trainer_studio.enterprise import claim_job

        return claim_job()

    @app.get("/api/ee/active-learning")
    def ee_active(project: str = ""):
        from trainer_studio.enterprise import next_active

        return next_active(project)

    @app.get("/api/ee/analytics")
    def ee_analytics(project: str = ""):
        from trainer_studio.enterprise import class_counts

        return class_counts(project)

    @app.get("/api/ee/support")
    def ee_support():
        from trainer_studio.enterprise import support_bundle

        return support_bundle()

    _open_env_dataset()

    @app.get("/ee-addon.js")
    def ee_addon():
        from trainer_studio.enterprise import addon_path

        path = addon_path()
        if path is None:
            raise StudioError(code="ee.locked", status=404)
        return FileResponse(path, media_type="text/javascript")

    static = next((path for path in STATIC_CANDIDATES if (path / "index.html").is_file()), None)
    if static is not None:
        app.mount("/", StaticFiles(directory=static, html=True), name="ui")
    else:

        @app.get("/")
        def missing_ui():
            return JSONResponse({"detail": text("ui.missing"), "code": "ui.missing"}, status_code=503)

    return app


def _open_env_dataset() -> None:
    from trainer_studio.service import last_dataset_path

    raw = os.environ.get("STUDIO_DATASET") or ""
    if raw:
        from trainer_studio.service import studio_dataset_problem

        problem = studio_dataset_problem(raw)
        if problem:
            logging.getLogger("trainer_studio").warning("%s", problem)
            return
        path = Path(raw).expanduser()
    else:
        remembered = last_dataset_path()
        if not remembered:
            return
        path = Path(remembered)
        if not (path / "data.yaml").is_file():
            return
    try:
        open_dataset(str(path))
    except StudioError as exc:
        logging.getLogger("trainer_studio").warning("%s", exc.message)


app = create_app()
