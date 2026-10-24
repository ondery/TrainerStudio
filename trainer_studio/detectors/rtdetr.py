"""RT-DETR via Transformers. Apache-2.0. Does not import Ultralytics."""

from __future__ import annotations

from trainer_studio.messages import text


class RTDetrDetector:
    id = "rtdetr"
    license = "Apache-2.0"
    families = [
        {
            "id": "rtdetr",
            "label": "RT-DETR",
            "sizes": ["r18", "r50"],
            "tasks": ["detect"],
            "license": "Apache-2.0",
            "note": text("detect.note.rtdetr"),
        }
    ]

    def ready(self) -> tuple[bool, str]:
        try:
            import importlib

            importlib.import_module("transformers")
        except Exception:
            return False, "detect.rtdetr"
        return True, ""

    def predict(self, image_path: str, spec: dict, names: list[str]) -> list[dict]:
        import torch
        from PIL import Image
        from transformers import AutoImageProcessor, AutoModelForObjectDetection

        size = spec.get("size") or "r50"
        model_id = "PekingU/rtdetr_r18vd" if size == "r18" else "PekingU/rtdetr_r50vd"
        image = Image.open(image_path).convert("RGB")
        processor = AutoImageProcessor.from_pretrained(model_id)
        model = AutoModelForObjectDetection.from_pretrained(model_id)
        inputs = processor(images=image, return_tensors="pt")
        with torch.no_grad():
            outputs = model(**inputs)
        target = torch.tensor([image.size[::-1]])
        results = processor.post_process_object_detection(outputs, target_sizes=target, threshold=float(spec.get("threshold") or 0.4))[0]
        id2label = model.config.id2label
        boxes = []
        for score, label, box in zip(results["scores"], results["labels"], results["boxes"]):
            key = str(id2label.get(int(label), "")).replace(" ", "_")
            if key not in names:
                continue
            x0, y0, x1, y1 = [float(value) for value in box.tolist()]
            boxes.append({
                "classId": key,
                "geometry": {"type": "bbox", "x": x0, "y": y0, "width": max(0.0, x1 - x0), "height": max(0.0, y1 - y0)},
                "score": float(score),
            })
        return boxes
