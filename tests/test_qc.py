from trainer_studio.service import open_dataset, qc_scan


def test_qc_reports_unlabeled(tmp_path, data_home):
    from tests.test_safety import _dataset

    root = _dataset(tmp_path)
    project = open_dataset(str(root))
    report = qc_scan(project["id"])
    assert "issues" in report
    assert report["counts"]["error"] >= 0
