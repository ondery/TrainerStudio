"""Phase 3 exports, review, and open cost. Source labels stay byte-identical."""

import json
import time
from pathlib import Path

import pytest
import yaml

from tests.conftest import write_jpeg
from tests.test_safety import _bytes, _dataset
from trainer_studio.errors import StudioError
from trainer_studio.service import (
    create_snapshot,
    export_project,
    get_image,
    import_legacy_schema,
    open_dataset,
    qc_scan,
    save_image,
    settle_review,
    split_dataset,
    studio_dataset_problem,
)


def test_missing_studio_dataset_is_not_a_yaml_names_error(tmp_path):
    message = studio_dataset_problem(str(tmp_path / "missing-folder"))
    assert "STUDIO_DATASET" in message
    assert "no names list" not in message


def test_qc_scan_does_not_touch_the_dataset(tmp_path, data_home):
    root = _dataset(tmp_path)
    before = _bytes(root)
    project = open_dataset(str(root))
    report = qc_scan(project["id"])
    assert report["distribution"]
    assert any(row["key"] == "speed_60" for row in report["distribution"])
    assert "consistency" in report and "queue" in report
    assert _bytes(root) == before


def test_qc_finds_overlap_tiny_and_outside(tmp_path, data_home):
    root = tmp_path / "qc"
    (root / "images").mkdir(parents=True)
    (root / "labels").mkdir()
    (root / "data.yaml").write_text(yaml.safe_dump({"names": ["alpha"]}, sort_keys=False), encoding="utf-8")
    write_jpeg(root / "images" / "a.jpg", 32)
    project = open_dataset(str(root))
    save_image(project["id"], "a", [
        {"id": "big", "classId": "alpha", "geometry": {"type": "bbox", "x": 2, "y": 2, "width": 20, "height": 20}, "attributes": {}},
        {"id": "over", "classId": "alpha", "geometry": {"type": "bbox", "x": 4, "y": 4, "width": 20, "height": 20}, "attributes": {}},
        {"id": "tiny", "classId": "alpha", "geometry": {"type": "bbox", "x": 1, "y": 1, "width": 1, "height": 8}, "attributes": {}},
        {"id": "out", "classId": "alpha", "geometry": {"type": "bbox", "x": -8, "y": 1, "width": 6, "height": 6}, "attributes": {}},
    ], None, "labeled")
    codes = {item["code"] for item in qc_scan(project["id"])["issues"]}
    assert {"overlap", "tiny", "outside"} <= codes


def test_exports_leave_the_source_unchanged(tmp_path, data_home):
    root = _dataset(tmp_path)
    before = _bytes(root)
    project = open_dataset(str(root))
    for fmt in ("yolo", "coco", "voc"):
        dest = tmp_path / f"out-{fmt}"
        report = export_project(project["id"], "detect", str(dest), fmt, False)
        assert report["ok"] is True
        assert report["bytesIdentical"] is True
        assert _bytes(root) == before
    coco = json.loads((tmp_path / "out-coco" / "annotations" / "instances.json").read_text(encoding="utf-8"))
    kept = next(row for row in coco["annotations"] if row["image_id"] == 1)
    assert kept["category_id"] == 7
    xml = (tmp_path / "out-voc" / "Annotations" / "kept.xml").read_text(encoding="utf-8")
    assert ">speed_60<" in xml
    yolo = (tmp_path / "out-yolo" / "labels" / "kept.txt").read_text(encoding="utf-8")
    assert yolo.split()[0] == "7"


def test_split_is_stratified_and_does_not_rewrite_labels(tmp_path, data_home):
    root = tmp_path / "split"
    (root / "images").mkdir(parents=True)
    (root / "labels").mkdir()
    (root / "data.yaml").write_text(yaml.safe_dump({"names": ["alpha", "beta"]}, sort_keys=False), encoding="utf-8")
    before = {}
    for index in range(10):
        name = f"f{index:02d}"
        write_jpeg(root / "images" / f"{name}.jpg")
        line = f"{0 if index < 5 else 1} 0.5 0.5 0.2 0.2\n"
        (root / "labels" / f"{name}.txt").write_text(line, encoding="utf-8")
        before[name] = (root / "labels" / f"{name}.txt").read_bytes()
    project = open_dataset(str(root))
    result = split_dataset(project["id"], 0.8, 0.1, 0.1)
    assert result["bytesIdentical"] is True
    assert result["counts"] == {"train": 8, "val": 1, "test": 1}
    for name, payload in before.items():
        assert (root / "labels" / f"{name}.txt").read_bytes() == payload
    from trainer_studio.db import connect

    conn = connect()
    rows = conn.execute("SELECT id, split FROM images WHERE project_id = ?", (project["id"],)).fetchall()
    conn.close()
    train = {row["id"] for row in rows if row["split"] == "train"}
    assert any(name.startswith("f0") for name in train)
    assert any(int(name[1:]) >= 5 for name in train)


def test_snapshot_copies_out_and_leaves_the_source(tmp_path, data_home):
    root = _dataset(tmp_path)
    before = _bytes(root)
    project = open_dataset(str(root))
    snap = create_snapshot(project["id"])
    assert snap["bytesIdentical"] is True
    assert _bytes(root) == before
    dest = Path(snap["dest"])
    assert (dest / "data.yaml").is_file()
    assert (dest / "labels" / "kept.txt").read_bytes() == before["labels/kept.txt"]


def test_review_accept_uses_yaml_index_and_reject_keeps_bytes(tmp_path, data_home):
    root = _dataset(tmp_path)
    before = _bytes(root)
    project = open_dataset(str(root))
    kept = get_image(project["id"], "kept")
    original = kept["annotations"][0]
    save_image(project["id"], "kept", [
        original,
        {
            "id": "proposal-1",
            "classId": "speed_60",
            "cls": 0,
            "geometry": {"type": "bbox", "x": 1, "y": 1, "width": 4, "height": 4},
            "attributes": {"source": "auto", "review": "pending", "score": 0.4},
        },
    ], None, "labeled")
    assert (root / "labels" / "kept.txt").read_bytes() == before["labels/kept.txt"]
    rejected = settle_review(project["id"], [], ["proposal-1"])
    assert rejected["images"][0]["bytesIdentical"] is True
    assert (root / "labels" / "kept.txt").read_bytes() == before["labels/kept.txt"]
    assert len(get_image(project["id"], "kept")["annotations"]) == 1
    save_image(project["id"], "kept", [
        original,
        {
            "id": "proposal-2",
            "classId": "speed_60",
            "cls": 0,
            "geometry": {"type": "bbox", "x": 1, "y": 1, "width": 4, "height": 4},
            "attributes": {"review": "pending"},
        },
    ], None, "labeled")
    accepted = settle_review(project["id"], ["proposal-2"], [])
    assert accepted["images"][0]["written"] is True
    lines = (root / "labels" / "kept.txt").read_text(encoding="utf-8").splitlines()
    assert lines[-1].split()[0] == "7"
    assert (root / "data.yaml").read_bytes() == before["data.yaml"]


def test_legacy_attributes_stay_read_only(tmp_path, data_home):
    root = _dataset(tmp_path)
    project = open_dataset(str(root))
    path = root / "labeling.json"
    payload = json.loads(path.read_text(encoding="utf-8"))
    payload["images"] = [{
        "id": "kept",
        "attributes": {"comment": "from-legacy"},
        "boxes": [{"id": "b1", "attributes": {"lane": "right"}}],
    }]
    path.write_text(json.dumps(payload), encoding="utf-8")
    before = path.read_bytes()
    imported = import_legacy_schema(project["id"])
    assert imported["bytesIdentical"] is True
    assert imported["attributes"] >= 1
    assert path.read_bytes() == before
    kept = get_image(project["id"], "kept")
    assert kept["attributes"]["comment"] == "from-legacy"
    assert kept["annotations"][0]["attributes"]["lane"] == "right"
    assert (root / "labels" / "kept.txt").read_bytes() == _bytes(root)["labels/kept.txt"]


def test_label_identity_is_size_and_mtime(tmp_path, data_home):
    root = _dataset(tmp_path)
    project = open_dataset(str(root))
    from trainer_studio.db import connect

    conn = connect()
    token = conn.execute("SELECT label_sha FROM images WHERE project_id = ? AND id = 'kept'", (project["id"],)).fetchone()[0]
    conn.close()
    assert ":" in token
    assert len(token) < 48


def test_sam_missing_is_not_a_server_error():
    from trainer_studio.sam import segment

    try:
        segment(Path("missing.jpg"), [{"x": 1, "y": 1}])
    except StudioError as exc:
        if exc.code == "sam.unavailable":
            assert exc.status == 424
            return
        pytest.skip("SAM imports on this machine")
    else:
        raise AssertionError("segment should fail without a model")


def test_autolabel_keeps_the_missing_package_code():
    from trainer_studio.detectors.base import predict
    from trainer_studio.detectors.ultralytics_yolo import UltralyticsDetector

    ready, code = UltralyticsDetector().ready()
    if ready:
        pytest.skip("ultralytics is installed")
    with pytest.raises(StudioError) as caught:
        predict("ultralytics", "frame.jpg", {}, ["speed_60"])
    assert caught.value.code == code == "detect.ultralytics"
    assert caught.value.status == 424


def test_first_open_of_6200_images_stays_under_three_seconds(tmp_path, data_home):
    root = tmp_path / "wide"
    (root / "images").mkdir(parents=True)
    (root / "labels").mkdir()
    names = ["alpha", "beta"]
    (root / "data.yaml").write_text(yaml.safe_dump({"names": names}, sort_keys=False), encoding="utf-8")
    sample = tmp_path / "one.jpg"
    write_jpeg(sample, 64)
    blob = sample.read_bytes()
    images = []
    for index in range(6200):
        name = f"frame_{index:05d}.jpg"
        (root / "images" / name).write_bytes(blob)
        label = "" if index % 3 == 2 else f"{index % 2} 0.5 0.5 0.2 0.2\n"
        if label:
            (root / "labels" / f"frame_{index:05d}.txt").write_text(label, encoding="utf-8")
        images.append({"id": f"frame_{index:05d}", "name": name, "file": f"images/{name}", "width": 64, "height": 64, "split": "train"})
    (root / "meta.json").write_text(json.dumps({"images": images}), encoding="utf-8")
    started = time.perf_counter()
    project = open_dataset(str(root))
    elapsed = time.perf_counter() - started
    assert project["imageCount"] == 6200
    assert elapsed < 3.0, f"first open took {elapsed:.2f}s"
    again = time.perf_counter()
    open_dataset(str(root))
    second = time.perf_counter() - again
    assert second < 1.5, f"second open took {second:.2f}s"
