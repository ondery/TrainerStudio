import json

import yaml

from tests.conftest import write_jpeg
from trainer_studio.service import export_project, open_dataset, save_image


def test_extra_formats_leave_the_source_unchanged(tmp_path, data_home):
    root = tmp_path / "shapes"
    (root / "images").mkdir(parents=True)
    (root / "labels").mkdir()
    (root / "data.yaml").write_text(yaml.safe_dump({"names": ["alpha"]}, sort_keys=False), encoding="utf-8")
    write_jpeg(root / "images" / "frame.jpg", 40)
    project = open_dataset(str(root))
    save_image(
        project["id"],
        "frame",
        [
            {"classId": "alpha", "geometry": {"type": "bbox", "x": 2, "y": 3, "width": 10, "height": 8}, "attributes": {}},
            {
                "classId": "alpha",
                "geometry": {"type": "polygon", "points": [{"x": 1, "y": 1}, {"x": 8, "y": 1}, {"x": 4, "y": 9}]},
                "attributes": {},
            },
            {
                "classId": "alpha",
                "geometry": {
                    "type": "pose",
                    "box": {"x": 2, "y": 3, "width": 10, "height": 8},
                    "keypoints": [{"x": 4, "y": 5, "visibility": 2}],
                },
                "attributes": {},
            },
        ],
        None,
        "labeled",
    )
    before = {
        "yaml": (root / "data.yaml").read_bytes(),
        "label": (root / "labels" / "frame.txt").read_bytes(),
    }
    markers = {
        "createml": (tmp_path / "out-createml", tmp_path / "out-createml" / "createml.json"),
        "cvat": (tmp_path / "out-cvat", tmp_path / "out-cvat" / "annotations.xml"),
        "labelme": (tmp_path / "out-labelme", tmp_path / "out-labelme" / "labelme" / "frame.json"),
        "kitti": (tmp_path / "out-kitti", tmp_path / "out-kitti" / "kitti" / "frame.txt"),
        "darknet": (tmp_path / "out-darknet", tmp_path / "out-darknet" / "darknet" / "frame.txt"),
        "openimages": (tmp_path / "out-openimages", tmp_path / "out-openimages" / "openimages.csv"),
        "coco": (tmp_path / "out-coco", tmp_path / "out-coco" / "annotations" / "instances.json"),
        "voc": (tmp_path / "out-voc", tmp_path / "out-voc" / "Annotations" / "frame.xml"),
    }
    for fmt, (dest, marker) in markers.items():
        report = export_project(project["id"], "detect", str(dest), fmt, False)
        assert report["ok"] is True, fmt
        assert report["bytesIdentical"] is True, fmt
        assert (root / "data.yaml").read_bytes() == before["yaml"]
        assert (root / "labels" / "frame.txt").read_bytes() == before["label"]
        assert marker.is_file(), fmt
    coco = json.loads(markers["coco"][1].read_text(encoding="utf-8"))
    pose = next(row for row in coco["annotations"] if "keypoints" in row)
    assert pose["num_keypoints"] == 1
    xml = markers["voc"][1].read_text(encoding="utf-8")
    assert "<polygon>" in xml
    assert "alpha" in markers["kitti"][1].read_text(encoding="utf-8")
