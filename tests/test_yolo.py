from trainer_studio.yolo import FORMAT_NOTES, parse_text, render_text, signature, validate_geometry


def test_detect_signature_ignores_spacing():
    original = "7 0.5 0.5 0.2 0.2\n"
    parsed, warnings = parse_text(original, "detect", 32, 32)
    assert warnings == []
    rendered = render_text([(7, parsed[0]["geometry"])], 32, 32, "detect")
    assert signature(original) == signature(rendered)
    assert rendered.split()[0] == "7"


def test_segment_obb_pose_roundtrip_and_variants():
    polygon = "3 0.1 0.1 0.4 0.1 0.4 0.5\n"
    parsed, warnings = parse_text(polygon, "segment", 100, 100)
    assert warnings == []
    assert parsed[0]["geometry"]["type"] == "polygon"
    back = render_text([(3, parsed[0]["geometry"])], 100, 100, "segment")
    assert signature(polygon) == signature(back)

    corners = "1 " + " ".join(["0.1", "0.1", "0.4", "0.1", "0.4", "0.4", "0.1", "0.4"]) + "\n"
    parsed, warnings = parse_text(corners, "obb", 100, 100)
    assert parsed[0]["geometry"]["type"] == "obb"
    assert signature(corners) == signature(render_text([(1, parsed[0]["geometry"])], 100, 100, "obb"))

    xywhr, warnings = parse_text("1 0.5 0.5 0.2 0.1 0\n", "obb", 100, 100)
    assert any("xywhr" in item for item in warnings)
    assert xywhr[0]["geometry"]["type"] == "obb"

    pose = "2 0.5 0.5 0.4 0.6 0.4 0.4 2 0.6 0.7 1\n"
    parsed, warnings = parse_text(pose, "pose", 50, 50)
    assert warnings == []
    assert parsed[0]["geometry"]["keypoints"][1]["visibility"] == 1
    assert signature(pose) == signature(render_text([(2, parsed[0]["geometry"])], 50, 50, "pose"))

    raw, warnings = parse_text("4 0.1 0.2 0.3 0.4 0.5\n", "detect", 10, 10)
    assert raw[0]["geometry"]["type"] == "raw"
    assert any("xyxy" in item or "ham" in item for item in warnings)
    assert "RLE" in FORMAT_NOTES["segment"]
    issues = validate_geometry({"type": "polygon", "points": [{"x": 1, "y": 1}]}, 10, 10)
    assert issues


def test_ultralytics_is_not_imported_by_the_api():
    import sys

    sys.modules.pop("ultralytics", None)
    import trainer_studio.api  # noqa: F401

    assert "ultralytics" not in sys.modules
