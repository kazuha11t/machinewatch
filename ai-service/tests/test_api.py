from fastapi.testclient import TestClient

from app.detector import ModelRegistry
from app.main import create_app


def client() -> TestClient:
    return TestClient(create_app(ModelRegistry(model_dir=None, baseline_size=20)))


def readings(count: int, start: int = 0) -> list[dict]:
    return [{"ts": start + i * 1000, "temperature": 60 + (i % 3) * 0.1, "vibration": 2.0 + (i % 4) * 0.05, "current": 12.0} for i in range(count)]


def test_score_lifecycle():
    api = client()
    learning = api.post("/score", json={"device_id": "cmp-1", "readings": readings(10)}).json()
    assert learning["status"] == "learning"
    assert learning["progress"] == 0.5

    ready = api.post("/score", json={"device_id": "cmp-1", "readings": readings(10, 10_000)}).json()
    assert ready["status"] == "ready"
    assert len(ready["scores"]) == 10
    assert ready["health_status"] in {"healthy", "warning", "critical"}

    assert api.get("/models").json()[0]["ready"] is True
    assert api.delete("/models/cmp-1").json() == {"deleted": True}
    assert api.get("/health").json() == {"status": "ok", "models": 0}


def test_validation():
    api = client()
    assert api.post("/score", json={"device_id": "../etc", "readings": readings(1)}).status_code == 422
    assert api.post("/score", json={"device_id": "ok", "readings": []}).status_code == 422
    assert api.delete("/models/bad%20id").status_code == 422
