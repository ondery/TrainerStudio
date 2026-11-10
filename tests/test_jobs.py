import threading
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


def test_cuda_jobs_wait_for_the_single_slot(data_home, monkeypatch):
    release = threading.Event()
    started = []

    def runner(payload, progress, cancel):
        started.append(payload["name"])
        if payload["name"] == "gpu":
            release.wait(2)
        return {"name": payload["name"]}

    register("cuda-slot", runner)
    monkeypatch.setattr("trainer_studio.jobs.holds_cuda", lambda payload: payload.get("device") == "cuda")
    gpu = start("cuda-slot", None, {"name": "gpu", "device": "cuda"})
    cpu = start("cuda-slot", None, {"name": "cpu", "device": "cpu"})
    waiting = start("cuda-slot", None, {"name": "next", "device": "cuda"})
    for _ in range(40):
        if "cpu" in started and get_job(cpu["id"])["status"] == "done":
            break
        time.sleep(0.05)
    assert get_job(gpu["id"])["status"] == "running"
    assert get_job(waiting["id"])["status"] == "queued"
    assert get_job(cpu["id"])["status"] == "done"
    release.set()
    for _ in range(40):
        if get_job(waiting["id"])["status"] == "done":
            break
        time.sleep(0.05)
    assert get_job(waiting["id"])["status"] == "done"
