"""Optional AI helpers stay honest when the packages are absent."""

from trainer_studio.deps import install_args, probe, resolve_device, resolve_weights
from trainer_studio.detectors.ultralytics_yolo import match_class_name
from trainer_studio.runners import proposals_from_detections
from trainer_studio.sam import models


def test_prelabel_one_missing_project(data_home):
    from trainer_studio.errors import StudioError
    from trainer_studio.runners import prelabel_one

    try:
        prelabel_one("missing", "img", {})
    except StudioError as exc:
        assert exc.code == "project.missing"
        return
    raise AssertionError("prelabel_one should reject an unknown project")


def test_proposals_use_yaml_names_not_numeric_ids():
    boxes = [
        {"classId": "speed_60", "cls": 5, "geometry": {"type": "bbox", "x": 1, "y": 1, "width": 2, "height": 2}, "score": 0.9},
        {"classId": "not_in_yaml", "cls": 7, "geometry": {"type": "bbox", "x": 0, "y": 0, "width": 1, "height": 1}, "score": 0.2},
        {"classId": "", "cls": 0, "geometry": {"type": "bbox", "x": 0, "y": 0, "width": 1, "height": 1}},
    ]
    proposals, skipped = proposals_from_detections(boxes, ["speed_5", "speed_60"])
    assert skipped == 2
    assert len(proposals) == 1
    assert proposals[0]["classId"] == "speed_60"
    assert proposals[0]["attributes"]["review"] == "pending"
    assert "cls" not in proposals[0]


def test_install_command_is_only_the_optional_requirements_file():
    command = install_args()
    assert command[-2:] == ["-r", command[-1]]
    assert command[-1].endswith("requirements-ai.txt")
    assert "ultralytics" not in command


def test_cuda_request_falls_back_when_missing():
    assert resolve_device("cpu") == "cpu"
    assert resolve_device(None) == "cpu"
    assert resolve_device("CUDA") == ("cuda" if probe()["cuda"] else "cpu")


def test_missing_weights_path_is_dropped():
    spec = {"weights": "C:/no/such/best.pt"}
    resolve_weights(spec)
    assert "weights" not in spec
    named = {"weights": "yolo11n.pt"}
    resolve_weights(named)
    assert named["weights"] == "yolo11n.pt"


def test_detector_labels_map_onto_dataset_names():
    names = ["stop", "vehicle_car", "traffic_light_red", "speed_60"]
    assert match_class_name("stop", names) == "stop"
    assert match_class_name("stop sign", names) == "stop"
    assert match_class_name("car", names) == "vehicle_car"
    assert match_class_name("speed_60", names) == "speed_60"
    assert match_class_name("person", names) is None


def test_probe_and_sam_catalog_do_not_require_a_model_download():
    body = probe()
    assert "installCommand" in body
    assert body["installCommand"].endswith("requirements-ai.txt")
    ids = [row["id"] for row in models()]
    assert "sam2_b" in ids
    assert "mobile_sam" in ids
    assert isinstance(body["ultralytics"], bool)
    assert isinstance(body["cuda"], bool)
