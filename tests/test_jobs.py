import time

from trainer_studio.jobs import get_job, register, start


def test_background_job_finishes(data_home):
    def runner(payload, progress, cancel):
        progress(1, "ok")
        return {"echo": payload.get("value")}

    register("fixture-job", runner)
    job = start("fixture-job", None, {"value": 7})
    current = job
    for _ in range(40):
        current = get_job(job["id"])
        if current["status"] in {"done", "failed", "cancelled"}:
            break
        time.sleep(0.05)
    assert current["status"] == "done"
    assert current["payload"]["result"]["echo"] == 7
