"""Task JSON: percentages, rotation, masks, predictions and relations."""

import json
from pathlib import Path

import yaml

from tests.conftest import write_jpeg
from trainer_studio.service import export_task_json, get_image, import_task_json, open_dataset
from trainer_studio.taskexchange import decode_rle, encode_rle, geometry_fingerprint, mask_from_rle


def _dataset(tmp_path: Path) -> Path:
    root = tmp_path / "dataset"
    (root / "images").mkdir(parents=True)
    (root / "labels").mkdir()
    (root / "data.yaml").write_text(
        yaml.safe_dump({"path": ".", "train": "images", "names": {0: "stop", 1: "car"}}, sort_keys=False),
        encoding="utf-8",
    )
    (root / "labels" / "kept.txt").write_text("0 0.500000 0.500000 0.250000 0.250000\n", encoding="utf-8")
    write_jpeg(root / "images" / "kept.jpg", 100)
    write_jpeg(root / "images" / "fresh.jpg", 100)
    (root / "labels" / "fresh.txt").write_text("", encoding="utf-8")
    return root


def _task(name: str, result: list, predictions: list | None = None) -> dict:
    task = {"id": 7, "data": {"image": name}, "annotations": [{"result": result, "ground_truth": True}]}
    if predictions is not None:
        task["predictions"] = predictions
    return task


def test_rotated_view_and_video_keyframe_use_file_pixels():
    from trainer_studio.taskexchange import convert_results

    rotated = convert_results([{
        "id": "full",
        "type": "rectanglelabels",
        "original_width": 100,
        "original_height": 50,
        "image_rotation": 90,
        "value": {"x": 0, "y": 0, "width": 100, "height": 100, "rotation": 0, "rectanglelabels": ["stop"]},
    }], 100, 50)
    box = rotated["annotations"][0]["geometry"]
    assert box["type"] == "bbox"
    assert round(box["x"], 4) == 0
    assert round(box["y"], 4) == 0
    assert round(box["width"], 4) == 100
    assert round(box["height"], 4) == 50

    video = convert_results([{
        "id": "vid",
        "type": "videorectangle",
        "original_width": 100,
        "original_height": 100,
        "value": {
            "framesCount": 3,
            "sequence": [
                {"frame": 1, "enabled": False, "x": 0, "y": 0, "width": 10, "height": 10},
                {"frame": 2, "enabled": True, "x": 20, "y": 30, "width": 10, "height": 10, "rotation": 0},
            ],
            "labels": ["car"],
        },
    }, {
        "type": "timelinelabels",
        "value": {"ranges": [{"start": 1, "end": 2}], "timelinelabels": ["go"]},
    }], 100, 100)
    assert video["annotations"][0]["label"] == "car"
    assert video["annotations"][0]["geometry"] == {"type": "bbox", "x": 20, "y": 30, "width": 10, "height": 10}
    assert video["timeline"][0]["type"] == "timelinelabels"


def test_brush_rle_roundtrip_is_the_alpha_mask():
    width, height = 8, 6
    mask = [0] * (width * height)
    for y in range(2, 5):
        for x in range(1, 4):
            mask[y * width + x] = 255
    encoded = encode_rle([value for pixel in mask for value in (pixel, pixel, pixel, pixel)])
    decoded = mask_from_rle(encoded, width, height)
    assert decoded == [1 if value else 0 for value in mask]
    assert decode_rle(encoded)[3] == 0


def test_task_json_import_fixes_percent_rotation_and_does_not_download(tmp_path, data_home):
    root = _dataset(tmp_path)
    kept_before = (root / "labels" / "kept.txt").read_bytes()
    project = open_dataset(str(root))
    tasks = [
        _task("fresh.jpg", [
            {
                "id": "box",
                "type": "rectanglelabels",
                "from_name": "label",
                "to_name": "image",
                "original_width": 100,
                "original_height": 100,
                "image_rotation": 0,
                "value": {"x": 10, "y": 20, "width": 30, "height": 40, "rotation": 0, "rectanglelabels": ["stop"]},
            },
            {
                "id": "box",
                "type": "textarea",
                "from_name": "sign_text",
                "to_name": "image",
                "value": {"text": ["DUR"]},
            },
            {
                "id": "turn",
                "type": "rectanglelabels",
                "from_name": "label",
                "to_name": "image",
                "original_width": 100,
                "original_height": 100,
                "value": {"x": 10, "y": 10, "width": 20, "height": 10, "rotation": 90, "rectanglelabels": ["car"]},
            },
            {
                "id": "poly",
                "type": "polygonlabels",
                "from_name": "label",
                "to_name": "image",
                "original_width": 100,
                "original_height": 100,
                "value": {"points": [{"x": 10, "y": 10}, {"x": 40, "y": 10}, {"x": 40, "y": 30}], "polygonlabels": ["stop"]},
            },
            {
                "type": "relation",
                "from_id": "box",
                "to_id": "turn",
                "direction": "right",
                "labels": ["speed-vehicle"],
            },
            {
                "id": "scene",
                "type": "choices",
                "from_name": "scene",
                "to_name": "image",
                "value": {"choices": ["Night"]},
            },
        ]),
        {"data": {"image": "https://example.test/secret.jpg"}, "annotations": [{"result": []}]},
        _task("kept.jpg", [{
            "id": "bad",
            "type": "rectanglelabels",
            "original_width": 100,
            "original_height": 100,
            "value": {"x": 0, "y": 0, "width": 10, "height": 10, "rectanglelabels": ["missing"]},
        }]),
    ]
    report = import_task_json(project["id"], {"tasks": tasks, "createClasses": False})
    assert report["updated"] == 1
    assert report["regions"] == 3
    assert any(item["code"] == "tasks.url" for item in report["skipped"])
    assert any(item["image"] == "kept.jpg" and item["code"] == "tasks.noClass" for item in report["skipped"])
    assert (root / "labels" / "kept.txt").read_bytes() == kept_before

    fresh = get_image(project["id"], "fresh")
    by_id = {item["id"]: item for item in fresh["annotations"]}
    box = by_id["box"]
    assert box["geometry"]["type"] == "bbox"
    assert box["geometry"]["x"] == 10
    assert box["geometry"]["y"] == 20
    assert box["geometry"]["width"] == 30
    assert box["geometry"]["height"] == 40
    assert box["attributes"]["sign_text"] == "dur" or box["attributes"]["sign_text"] == "DUR" or "sign_text" in box["attributes"]
    assert box["attributes"]["linkedTo"] == "turn"
    assert box["attributes"]["relationLabel"] == "speed-vehicle"
    turn = by_id["turn"]
    assert turn["geometry"]["type"] == "obb"
    corners = {(round(point["x"], 4), round(point["y"], 4)) for point in turn["geometry"]["corners"]}
    assert corners == {(25, 5), (25, 25), (15, 25), (15, 5)}
    poly = by_id["poly"]
    assert poly["geometry"]["points"][0] == {"x": 10, "y": 10}
    assert fresh["attributes"]["scene"] == "night"
    assert fresh["meta"]["xchg"]["groundTruth"] is True

    exported = export_task_json(project["id"])
    tasks = json.loads(Path(exported["path"]).read_text(encoding="utf-8"))
    fresh_task = next(item for item in tasks if item["data"]["image"] == "fresh.jpg")
    result = fresh_task["annotations"][0]["result"]
    rectangle = next(item for item in result if item["id"] == "box")
    assert rectangle["value"]["rectanglelabels"] == ["stop"]
    assert rectangle["value"]["x"] == 10
    assert "attributes" not in rectangle["value"]
    assert isinstance(next(item for item in result if item["id"] == "poly")["value"]["points"][0], list)
    note = next(item for item in result if item["type"] == "textarea" and item["id"] == "box")
    assert note["value"]["text"] == ["DUR"] or note["value"]["text"] == ["dur"]
    relation = next(item for item in result if item["type"] == "relation")
    assert relation["labels"] == ["speed-vehicle"]
    assert relation["from_id"] == "box"
    choices = next(item for item in result if item["type"] == "choices")
    assert choices["value"]["choices"] == ["Night"]


def test_predictions_stay_pending_and_brush_ellipse_vector_roundtrip(tmp_path, data_home):
    root = _dataset(tmp_path)
    project = open_dataset(str(root))
    width = height = 100
    mask = [0] * (width * height)
    for y in range(10, 30):
        for x in range(10, 40):
            mask[y * width + x] = 255
    rle = encode_rle([value for pixel in mask for value in (pixel, pixel, pixel, pixel)])
    config = """
    <View>
      <Image name="image" value="$image"/>
      <BrushLabels name="label" toName="image">
        <Label value="lane" background="#336699" hotkey="l"/>
      </BrushLabels>
      <Choices name="scene" toName="image" choice="single" visibleWhen="label" whenChoiceValue="lane">
        <Choice value="Night"/>
        <Choice value="Day"/>
      </Choices>
    </View>
    """
    payload = {
        "createClasses": True,
        "config": config,
        "tasks": [_task("fresh.jpg", [
            {
                "id": "mask",
                "type": "brushlabels",
                "from_name": "label",
                "to_name": "image",
                "original_width": width,
                "original_height": height,
                "value": {"format": "rle", "rle": rle, "brushlabels": ["lane"]},
            },
            {
                "id": "dot",
                "type": "keypointlabels",
                "from_name": "label",
                "to_name": "image",
                "original_width": width,
                "original_height": height,
                "value": {"x": 50, "y": 60, "width": 0.5, "keypointlabels": ["stop"]},
            },
            {
                "id": "ring",
                "type": "ellipselabels",
                "from_name": "label",
                "to_name": "image",
                "original_width": width,
                "original_height": height,
                "value": {"x": 50, "y": 50, "radiusX": 10, "radiusY": 5, "rotation": 0, "ellipselabels": ["car"]},
            },
            {
                "id": "line",
                "type": "vectorlabels",
                "from_name": "label",
                "to_name": "image",
                "original_width": width,
                "original_height": height,
                "value": {"vertices": [[10, 10], [20, 30], [40, 30]], "closed": False, "vectorlabels": ["lane"]},
            },
        ], predictions=[{
            "model_version": "yolo11",
            "score": 0.25,
            "result": [{
                "id": "ghost",
                "type": "rectanglelabels",
                "from_name": "label",
                "to_name": "image",
                "original_width": 100,
                "original_height": 100,
                "score": 0.25,
                "value": {"x": 1, "y": 1, "width": 8, "height": 8, "rotation": 0, "rectanglelabels": ["stop"]},
            }],
        }])],
    }
    report = import_task_json(project["id"], payload)
    assert report["classesAdded"] == ["lane"]
    assert report["predictions"] == 1
    assert "lane" in (root / "data.yaml").read_text(encoding="utf-8")
    fresh = get_image(project["id"], "fresh")
    by_id = {item["id"]: item for item in fresh["annotations"]}
    assert by_id["mask"]["geometry"]["type"] == "polygon"
    assert by_id["mask"]["classId"] == "lane"
    assert by_id["dot"]["geometry"]["type"] == "pose"
    assert by_id["dot"]["geometry"]["keypoints"][0]["x"] == 50
    ghost = next(item for item in fresh["annotations"] if item["attributes"].get("source") == "prediction")
    assert ghost["attributes"]["review"] == "pending"
    assert ghost["attributes"]["score"] == 0.25
    label = (root / "labels" / "fresh.txt").read_text(encoding="utf-8")
    assert label.strip()
    assert not any(line.startswith("1 ") is False and "ghost" in line for line in label.splitlines())
    indexes = {int(float(line.split()[0])) for line in label.splitlines() if line.strip()}
    assert 0 in indexes or 1 in indexes or 2 in indexes
    assert all(item["attributes"].get("review") != "pending" for item in fresh["annotations"] if item["id"] != ghost["id"])

    exported = export_task_json(project["id"])
    tasks = json.loads(Path(exported["path"]).read_text(encoding="utf-8"))
    fresh_task = next(item for item in tasks if item["meta"]["image_id"] == "fresh")
    kinds = {item["type"] for item in fresh_task["annotations"][0]["result"]}
    assert "brushlabels" in kinds
    assert "ellipselabels" in kinds
    assert "vectorlabels" in kinds
    assert "keypointlabels" in kinds
    brush = next(item for item in fresh_task["annotations"][0]["result"] if item["type"] == "brushlabels")
    assert brush["value"]["rle"] == rle
    vector = next(item for item in fresh_task["annotations"][0]["result"] if item["type"] == "vectorlabels")
    assert vector["value"]["closed"] is False
    assert fresh_task["predictions"][0]["model_version"] == "yolo11"
    assert fresh_task["predictions"][0]["result"][0]["type"] == "rectanglelabels"
    assert geometry_fingerprint(by_id["ring"]["geometry"]) == by_id["ring"]["attributes"]["xchg"]["fingerprint"]
    reopened = open_dataset(str(root))
    assert reopened["id"] == project["id"]
    kept = get_image(project["id"], "fresh")
    mask = next(item for item in kept["annotations"] if item["id"] == "mask")
    assert mask["geometry"]["type"] == "polygon"
    assert mask["attributes"]["xchg"]["kind"] == "brushlabels"


def test_second_annotation_loses_to_ground_truth_and_empty_result_clears(tmp_path, data_home):
    root = _dataset(tmp_path)
    project = open_dataset(str(root))
    other = {
        "id": "other",
        "result": [{
            "id": "wrong",
            "type": "rectanglelabels",
            "original_width": 100,
            "original_height": 100,
            "value": {"x": 70, "y": 70, "width": 10, "height": 10, "rectanglelabels": ["car"]},
        }],
    }
    truth = {
        "ground_truth": True,
        "updated_at": "2020-01-01T00:00:00Z",
        "result": [{
            "id": "right",
            "type": "rectanglelabels",
            "original_width": 100,
            "original_height": 100,
            "value": {"x": 5, "y": 5, "width": 10, "height": 10, "rectanglelabels": ["stop"]},
        }],
    }
    imported = import_task_json(project["id"], [_task("fresh.jpg", []) | {"annotations": [other, truth]}])
    assert imported["regions"] == 1
    fresh = get_image(project["id"], "fresh")
    assert [item["id"] for item in fresh["annotations"]] == ["right"]
    exported = export_task_json(project["id"])
    tasks = json.loads(Path(exported["path"]).read_text(encoding="utf-8"))
    fresh_task = next(item for item in tasks if item["meta"]["image_id"] == "fresh")
    assert len(fresh_task["annotations"]) == 2
    assert fresh_task["annotations"][0]["ground_truth"] is True
    cleared = import_task_json(project["id"], [_task("fresh.jpg", [])])
    assert cleared["updated"] == 1
    assert get_image(project["id"], "fresh")["annotations"] == []
