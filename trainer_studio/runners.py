"""Job bodies for auto-label, training and batch SAM."""

from __future__ import annotations

import subprocess
from pathlib import Path

from trainer_studio.db import data_dir
from trainer_studio.deps import resolve_device, resolve_weights
from trainer_studio.detectors.base import predict
from trainer_studio.errors import StudioError
from trainer_studio.jobs import note, register
from trainer_studio.messages import text
from trainer_studio.service import get_image, get_project, image_file, list_images, save_image


def _names(project_id: str) -> list[str]:
    from trainer_studio.service import list_classes

    return [row["id"] for row in list_classes(project_id)["classes"]]


def proposals_from_detections(boxes: list[dict], names: list[str]) -> tuple[list[dict], int]:
    """Keep detections whose class name is in data.yaml. The numeric model id is ignored."""
    proposals = []
    skipped = 0
    allowed = set(names)
    for box in boxes:
        key = str(box.get("classId") or "")
        if key not in allowed:
            skipped += 1
            continue
        proposals.append({
            "classId": key,
            "geometry": box.get("geometry"),
            "attributes": {"source": "auto", "review": "pending", "score": box.get("score")},
        })
    return proposals, skipped


def _latest_weights(project_id: str) -> str | None:
    from pathlib import Path

    from trainer_studio.jobs import list_jobs

    for job in list_jobs(project_id):
        if job.get("kind") != "train" or job.get("status") != "done":
            continue
        payload = job.get("payload") or {}
        result = payload.get("result") if isinstance(payload, dict) else {}
        best = str((result or {}).get("best") or "")
        if best and Path(best).is_file():
            return best
    return None


def prelabel_one(project_id: str, image_id: str, spec: dict | None = None) -> dict:
    """Run the detector on one empty image. The client applies the boxes."""
    spec = dict(spec or {})
    project = get_project(project_id)
    names = _names(project_id)
    path = image_file(project_id, image_id)
    backend = spec.get("backend") or "ultralytics"
    if not spec.get("weights"):
        found = _latest_weights(project_id)
        if found:
            spec["weights"] = found
    resolve_weights(spec)
    spec["device"] = resolve_device(spec.get("device"))
    if not spec.get("task"):
        spec["task"] = project.get("task") or "detect"
    try:
        boxes = predict(backend, str(path), spec, names)
    except StudioError:
        raise
    except Exception as exc:
        raise StudioError(code="detect.unavailable", status=424) from exc
    proposals, skipped = proposals_from_detections(boxes, names)
    return {"boxes": proposals, "skipped": skipped, "backend": backend, "task": spec.get("task")}


def autolabel(payload: dict, progress, cancel) -> dict:
    project_id = str(payload.get("projectId") or "")
    project = get_project(project_id)
    names = _names(project_id)
    images = list_images(project_id)
    if payload.get("imageId"):
        images = [row for row in images if row["id"] == payload["imageId"]]
    written = 0
    skipped = 0
    backend = payload.get("backend") or "ultralytics"
    resolve_weights(payload)
    payload["device"] = resolve_device(payload.get("device"))
    for index, image in enumerate(images):
        if cancel.is_set():
            raise RuntimeError(text("job.cancelled"))
        progress(index / max(1, len(images)), image["name"])
        path = image_file(project_id, image["id"])
        try:
            boxes = predict(backend, str(path), payload, names)
        except StudioError:
            raise
        except Exception as exc:
            raise StudioError(code="detect.unavailable", status=424) from exc
        proposals, missed = proposals_from_detections(boxes, names)
        skipped += missed
        review = payload.get("review", True)
        if review is False or review == "accepted":
            for proposal in proposals:
                attributes = dict(proposal.get("attributes") or {})
                attributes.pop("review", None)
                proposal["attributes"] = attributes
        current = get_image(project_id, image["id"])["annotations"]
        if payload.get("append", True) is False:
            kept = []
        else:
            kept = [ann for ann in current if (ann.get("attributes") or {}).get("review") != "pending"]
        if proposals or payload.get("append", True) is False:
            save_image(project_id, image["id"], kept + proposals, None, "review")
            if proposals:
                written += 1
    progress(1, "@train.proposals")
    return {
        "images": written,
        "skipped": skipped,
        "backend": backend,
        "task": project["task"],
        "review": True,
        "note": text("train.reviewNote"),
    }


def _metrics(trainer) -> dict:
    raw = getattr(trainer, "metrics", None) or {}
    found = {}
    if isinstance(raw, dict):
        for key, value in list(raw.items())[:16]:
            if isinstance(value, (int, float)):
                found[str(key)] = round(float(value), 5)
    loss = getattr(trainer, "loss", None)
    try:
        if loss is not None:
            found["loss"] = round(float(loss), 5)
    except (TypeError, ValueError):
        pass
    return found


def train(payload: dict, progress, cancel) -> dict:
    if str(payload.get("backend") or "ultralytics") == "rtdetr":
        return train_rtdetr(payload, progress, cancel)
    try:
        from ultralytics import YOLO
    except Exception as exc:
        raise StudioError(code="train.unavailable", status=503) from exc
    project = get_project(str(payload.get("projectId") or ""))
    family = payload.get("family") or "yolo11"
    size = payload.get("size") or "n"
    task = payload.get("task") or project["task"]
    from trainer_studio.detectors.ultralytics_yolo import model_name

    weights = payload.get("weights") or (model_name(family, size, task) + ".pt")
    epochs = int(payload.get("epochs") or 10)
    device = resolve_device(payload.get("device"))
    raw_out = str(payload.get("output") or "").strip()
    run_dir = Path(raw_out).expanduser() if raw_out else data_dir() / "runs"
    run_dir.mkdir(parents=True, exist_ok=True)
    job_id = str(payload.get("jobId") or "")
    model = YOLO(weights)

    def on_epoch(trainer) -> None:
        if cancel.is_set():
            trainer.stop = True
            raise RuntimeError(text("job.cancelled"))
        total = max(1, int(getattr(trainer, "epochs", epochs)))
        done = int(getattr(trainer, "epoch", 0)) + 1
        metrics = _metrics(trainer)
        message = f"{done}/{total}"
        if metrics:
            message = message + " " + " ".join(f"{key}={value}" for key, value in list(metrics.items())[:4])
        progress(done / total, message)
        if job_id:
            note(job_id, message, done / total, metrics)

    model.add_callback("on_train_epoch_end", on_epoch)
    yaml_path = Path(project["root"]) / "data.yaml"
    if job_id:
        note(job_id, text("train.start", weights=weights, device=device), 0.01)
    model.train(
        data=str(yaml_path),
        epochs=epochs,
        imgsz=int(payload.get("imgsz") or 640),
        batch=int(payload.get("batch") or 8),
        project=str(run_dir),
        name=payload.get("name") or "train",
        exist_ok=True,
        device=device,
        workers=int(payload.get("workers") or 0),
    )
    save_dir = Path(getattr(model.trainer, "save_dir", run_dir / "train"))
    best = save_dir / "weights" / "best.pt"
    best_text = str(best) if best.is_file() else ""
    if job_id:
        note(job_id, text("train.bestLine", path=best_text or "missing"), 1)
    return {"run": str(save_dir), "best": best_text, "epochs": epochs, "weights": weights, "device": device, "backend": "ultralytics"}


def train_rtdetr(payload: dict, progress, cancel) -> dict:
    """Fine-tune RT-DETR when Transformers is installed. Boxes stay in review until accepted."""
    try:
        import torch
        from PIL import Image
        from transformers import AutoImageProcessor, RTDetrForObjectDetection
    except Exception as exc:
        raise StudioError(code="train.rtdetr", status=503) from exc
    project = get_project(str(payload.get("projectId") or ""))
    size = payload.get("size") or "r50"
    model_id = str(payload.get("weights") or "").strip() or ("PekingU/rtdetr_r18vd" if size == "r18" else "PekingU/rtdetr_r50vd")
    device = resolve_device(payload.get("device"))
    if device == "cuda":
        torch_device = torch.device("cuda")
    else:
        torch_device = torch.device("cpu")
        device = "cpu"
    epochs = max(1, int(payload.get("epochs") or 1))
    raw_out = str(payload.get("output") or "").strip()
    run_dir = Path(raw_out).expanduser() if raw_out else data_dir() / "runs" / "rtdetr"
    run_dir.mkdir(parents=True, exist_ok=True)
    processor = AutoImageProcessor.from_pretrained(model_id)
    model = RTDetrForObjectDetection.from_pretrained(model_id)
    model.to(torch_device)
    model.train()
    optimizer = torch.optim.AdamW(model.parameters(), lr=1e-5)
    names = _names(project["id"])
    images = list_images(project["id"])
    job_id = str(payload.get("jobId") or "")
    if job_id:
        note(job_id, text("train.start", weights=model_id, device=device), 0.01)
    steps = 0
    for epoch in range(epochs):
        if cancel.is_set():
            raise RuntimeError(text("job.cancelled"))
        for image in images:
            if cancel.is_set():
                raise RuntimeError(text("job.cancelled"))
            path = image_file(project["id"], image["id"])
            width = max(1, int(image.get("width") or 1))
            height = max(1, int(image.get("height") or 1))
            labels = []
            boxes = []
            for ann in get_image(project["id"], image["id"]).get("annotations") or []:
                if (ann.get("attributes") or {}).get("review") == "pending":
                    continue
                geometry = ann.get("geometry") or {}
                if geometry.get("type") != "bbox":
                    continue
                if ann.get("classId") not in names:
                    continue
                x = float(geometry.get("x") or 0) / width
                y = float(geometry.get("y") or 0) / height
                w = float(geometry.get("width") or 0) / width
                h = float(geometry.get("height") or 0) / height
                labels.append(names.index(ann["classId"]))
                boxes.append([x + w / 2, y + h / 2, w, h])
            if not boxes:
                continue
            picture = Image.open(path).convert("RGB")
            target = {
                "class_labels": torch.tensor(labels, dtype=torch.long),
                "boxes": torch.tensor(boxes, dtype=torch.float32),
            }
            inputs = processor(images=picture, annotations=target, return_tensors="pt")
            inputs = {key: value.to(torch_device) if hasattr(value, "to") else value for key, value in inputs.items()}
            optimizer.zero_grad()
            loss = model(**inputs).loss
            loss.backward()
            optimizer.step()
            steps += 1
        progress((epoch + 1) / epochs, f"{epoch + 1}/{epochs}")
    model.save_pretrained(run_dir)
    if job_id:
        note(job_id, text("train.bestLine", path=str(run_dir)), 1, {"steps": steps})
    return {"run": str(run_dir), "best": str(run_dir), "epochs": epochs, "weights": model_id, "device": device, "backend": "rtdetr", "steps": steps}


def sam_batch(payload: dict, progress, cancel) -> dict:
    from trainer_studio.sam import segment

    project_id = str(payload.get("projectId") or "")
    image_id = str(payload.get("imageId") or "")
    path = image_file(project_id, image_id)
    progress(0.2, "SAM")
    if cancel.is_set():
        raise RuntimeError(text("job.cancelled"))
    result = segment(
        path,
        payload.get("points") or [],
        payload.get("labels"),
        payload.get("model"),
        payload.get("device"),
        payload.get("conf"),
    )
    project_id = str(payload.get("projectId") or "")
    class_id = str(payload.get("classId") or "")
    names = _names(project_id)
    if not class_id and names:
        class_id = names[0]
    if class_id and result.get("geometry"):
        current = get_image(project_id, image_id)["annotations"]
        kept = [ann for ann in current if (ann.get("attributes") or {}).get("source") != "sam" or (ann.get("attributes") or {}).get("review") != "pending"]
        proposal = {
            "classId": class_id,
            "geometry": result["geometry"],
            "attributes": {"source": "sam", "review": "pending"},
        }
        save_image(project_id, image_id, kept + [proposal], None, "review")
        result["saved"] = True
    progress(1, "@job.done")
    return result


def install_ai(payload: dict, progress, cancel) -> dict:
    from trainer_studio.deps import install_args

    command = install_args(str(payload.get("pack") or "ai"))
    progress(0.02, "pip")
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    lines: list[str] = []
    stream = process.stdout
    if stream is not None:
        for line in stream:
            if cancel.is_set():
                process.terminate()
                raise RuntimeError(text("job.cancelled"))
            line_text = line.strip()
            if not line_text:
                continue
            lines.append(line_text)
            progress(min(0.95, 0.05 + len(lines) / 200), line_text[-180:])
            job_id = str(payload.get("jobId") or "")
            if job_id:
                note(job_id, line_text[-180:])
    code = process.wait()
    if code != 0:
        tail = lines[-1] if lines else text("ai.exit", code=code)
        job_id = str(payload.get("jobId") or "")
        if job_id:
            note(job_id, tail)
        raise StudioError(code="ai.install")
    return {"ok": True, "lines": lines[-30:]}


def register_runners() -> None:
    register("autolabel", autolabel)
    register("train", train)
    register("sam", sam_batch)
    register("ai-install", install_ai)
