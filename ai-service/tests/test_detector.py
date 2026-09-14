import numpy as np
import pytest

from app.detector import (
    DeviceModel,
    ModelRegistry,
    Reading,
    estimate_hours_to_limit,
    health_score,
    health_status,
)

BASELINE = 300


def healthy(rng: np.random.Generator, start_ts: int, count: int) -> list[Reading]:
    return [
        Reading(
            ts=start_ts + i * 1000,
            temperature=float(rng.normal(65, 0.4)),
            vibration=float(rng.normal(2.2, 0.12)),
            current=float(rng.normal(15, 0.25)),
        )
        for i in range(count)
    ]


def train(model: DeviceModel, rng: np.random.Generator) -> int:
    ts = 0
    for _ in range(BASELINE // 10):
        result = model.process(healthy(rng, ts, 10))
        ts += 10_000
    assert result.status == "ready"
    return ts


def test_reports_learning_progress_until_baseline_is_complete():
    rng = np.random.default_rng(1)
    model = DeviceModel("m1", baseline_size=BASELINE)
    result = model.process(healthy(rng, 0, 150))
    assert result.status == "learning"
    assert result.progress == pytest.approx(0.5)
    assert result.scores == [None] * 150
    assert result.health_score is None


def test_healthy_machine_stays_healthy():
    rng = np.random.default_rng(2)
    model = DeviceModel("m1", baseline_size=BASELINE)
    ts = train(model, rng)
    result = None
    for _ in range(12):
        result = model.process(healthy(rng, ts, 5))
        ts += 5000
    assert result.health_status == "healthy"
    assert result.health_score > 80
    assert result.hours_to_limit is None


def test_worn_bearing_is_flagged_as_critical():
    rng = np.random.default_rng(3)
    model = DeviceModel("m1", baseline_size=BASELINE)
    ts = train(model, rng)
    worn = [Reading(ts=ts + i * 1000, temperature=78.0, vibration=6.5 + i * 0.01, current=17.0) for i in range(60)]
    result = model.process(worn)
    assert all(result.anomalies)
    assert min(result.scores) > 0.5
    assert result.health_status == "critical"


def test_missing_sensor_is_ignored_when_training():
    rng = np.random.default_rng(4)
    model = DeviceModel("esp32", baseline_size=BASELINE)
    readings = [Reading(ts=r.ts, temperature=r.temperature, vibration=r.vibration) for r in healthy(rng, 0, BASELINE)]
    result = model.process(readings)
    assert result.status == "ready"
    assert model.features == ["temperature", "vibration"]


def test_trend_projection():
    # Vibration rising 1 mm/s per hour from 3.0: limit of 7.1 is ~4.1 h away at the end of a 0.5 h window.
    history = [(int(i * 30_000), 3.0 + (i * 30 / 3600)) for i in range(61)]
    assert estimate_hours_to_limit(history) == pytest.approx(3.6, abs=0.05)

    rng = np.random.default_rng(5)
    noisy_flat = [(i * 1000, float(rng.normal(2.2, 0.15))) for i in range(200)]
    assert estimate_hours_to_limit(noisy_flat) is None
    assert estimate_hours_to_limit([(i * 1000, 8.0) for i in range(100)]) == 0.0


def test_health_score_penalises_imminent_limit():
    assert health_score([0.1] * 60, [1.0] * 60, None) > health_score([0.1] * 60, [1.0] * 60, 0.5)
    assert health_score([], [], None) == 100.0


def test_health_scales_with_drift_instead_of_saturating():
    flagged = [0.9] * 60  # every reading outside the learned envelope
    assert health_status(health_score([0.1] * 60, [1.0] * 60, None)) == "healthy"
    assert health_status(health_score(flagged, [10.0] * 60, None)) == "warning"
    assert health_status(health_score(flagged, [45.0] * 60, None)) == "critical"


def test_registry_persists_trained_models(tmp_path):
    rng = np.random.default_rng(6)
    registry = ModelRegistry(tmp_path, baseline_size=BASELINE)
    registry.score("pump-01", healthy(rng, 0, BASELINE))
    assert (tmp_path / "pump-01.joblib").exists()

    reloaded = ModelRegistry(tmp_path, baseline_size=BASELINE)
    assert reloaded.score("pump-01", healthy(rng, 400_000, 5)).status == "ready"

    assert reloaded.delete("pump-01") is True
    assert not (tmp_path / "pump-01.joblib").exists()
    assert reloaded.score("pump-01", healthy(rng, 500_000, 5)).status == "learning"
