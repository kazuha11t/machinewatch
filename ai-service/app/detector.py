"""Per-device anomaly detection, health scoring and failure forecasting for machine telemetry.

Each device gets its own model because "normal" differs between machines: a pump running at
45 °C and a compressor running at 70 °C are both healthy. The first ``baseline_size`` readings
are treated as the device's normal operating envelope, an Isolation Forest is fitted on them,
and every later reading is scored against it.
"""

from __future__ import annotations

import logging
import math
import threading
from collections import deque
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import joblib
import numpy as np
from sklearn.ensemble import IsolationForest

log = logging.getLogger(__name__)

FEATURES = ("temperature", "vibration", "current")
#: ISO 10816-3 zone C/D boundary (mm/s RMS) for medium-sized machines on rigid foundations.
VIBRATION_LIMIT_MM_S = 7.1
#: Normalised score at which a reading counts as anomalous (the learned contamination boundary).
ANOMALY_THRESHOLD = 0.5
HEALTHY_MIN = 75.0
WARNING_MIN = 45.0
#: Drift (in baseline standard deviations) that costs no health, and drift at which the drift penalty is maximal.
DRIFT_FREE_SIGMA = 3.0
DRIFT_FULL_SIGMA = 40.0
STATE_VERSION = 2


@dataclass(frozen=True)
class Reading:
    ts: int
    temperature: float | None = None
    vibration: float | None = None
    current: float | None = None

    def vector(self) -> list[float]:
        values = (getattr(self, name) for name in FEATURES)
        return [math.nan if value is None else float(value) for value in values]


@dataclass(frozen=True)
class ScoreResult:
    status: str  # "learning" | "ready"
    progress: float
    scores: list[float | None]
    anomalies: list[bool]
    health_score: float | None
    health_status: str | None
    hours_to_limit: float | None


def health_status(score: float) -> str:
    if score >= HEALTHY_MIN:
        return "healthy"
    if score >= WARNING_MIN:
        return "warning"
    return "critical"


def health_score(recent_scores: list[float], recent_drift: list[float], hours_to_limit: float | None) -> float:
    """Scores machine health from 0 to 100.

    The Isolation Forest anomaly rate reacts early but saturates as soon as readings leave the baseline, so on its own
    a slightly unusual machine would look as bad as a failing one. The drift term measures *how far* readings have moved
    (in baseline standard deviations) and scales with severity, so early deviation reads "warning" and only substantial
    drift reads "critical". An imminent limit breach costs extra.
    """
    if not recent_scores:
        return 100.0
    anomaly_rate = float((np.asarray(recent_scores, dtype=float) >= ANOMALY_THRESHOLD).mean())
    drift = float(np.mean(recent_drift)) if recent_drift else 0.0
    drift_penalty = float(np.clip((drift - DRIFT_FREE_SIGMA) / (DRIFT_FULL_SIGMA - DRIFT_FREE_SIGMA), 0.0, 1.0))
    penalty = 0.35 * anomaly_rate + 0.65 * drift_penalty
    if hours_to_limit is None:
        trend_penalty = 0.0
    elif hours_to_limit < 1:
        trend_penalty = 25.0
    elif hours_to_limit < 8:
        trend_penalty = 15.0
    elif hours_to_limit < 48:
        trend_penalty = 8.0
    else:
        trend_penalty = 0.0
    return float(np.clip(100.0 * (1.0 - penalty) - trend_penalty, 0.0, 100.0))


def estimate_hours_to_limit(
    history: list[tuple[int, float]],
    limit: float = VIBRATION_LIMIT_MM_S,
    min_points: int = 60,
    min_r2: float = 0.5,
    horizon_hours: float = 24 * 30,
) -> float | None:
    """Projects when vibration crosses ``limit`` from a linear trend, as seen with progressive bearing wear.

    Returns ``None`` when there is no clear upward trend (R² below ``min_r2``), so healthy noise
    never produces a misleading countdown.
    """
    if len(history) < min_points:
        return None
    hours = np.array([ts for ts, _ in history], dtype=float) / 3_600_000.0
    hours -= hours[0]
    if hours[-1] <= 0:
        return None
    values = np.array([value for _, value in history], dtype=float)

    slope, intercept = np.polyfit(hours, values, 1)
    fitted = slope * hours + intercept
    total = float(((values - values.mean()) ** 2).sum())
    r2 = 1.0 - float(((values - fitted) ** 2).sum()) / total if total > 0 else 0.0

    level = float(fitted[-1])
    if level >= limit:
        return 0.0
    if slope <= 0 or r2 < min_r2:
        return None
    remaining = (limit - level) / slope
    return float(remaining) if remaining <= horizon_hours else None


class DeviceModel:
    """Learns one device's normal operating envelope, then scores new readings against it."""

    def __init__(self, device_id: str, baseline_size: int = 300, contamination: float = 0.01) -> None:
        self.device_id = device_id
        self.baseline_size = baseline_size
        self.contamination = contamination
        self.lock = threading.Lock()
        self._baseline: list[list[float]] = []
        self._model: IsolationForest | None = None
        self._columns: list[int] = []
        self._fill = np.empty(0)
        self._mean = np.empty(0)
        self._scale = np.empty(0)
        self._normal_score = 0.0
        self._boundary_score = 0.0
        self._recent: deque[float] = deque(maxlen=60)
        self._recent_drift: deque[float] = deque(maxlen=60)
        self._vibration: deque[tuple[int, float]] = deque(maxlen=600)

    @property
    def ready(self) -> bool:
        return self._model is not None

    @property
    def features(self) -> list[str]:
        return [FEATURES[index] for index in self._columns]

    @property
    def progress(self) -> float:
        return 1.0 if self.ready else min(len(self._baseline) / self.baseline_size, 0.99)

    def process(self, readings: list[Reading]) -> ScoreResult:
        for reading in readings:
            if reading.vibration is not None:
                self._vibration.append((reading.ts, reading.vibration))
        vectors = [reading.vector() for reading in readings]

        if not self.ready:
            self._baseline.extend(vectors)
            if len(self._baseline) < self.baseline_size or not self._fit():
                count = len(readings)
                return ScoreResult("learning", self.progress, [None] * count, [False] * count, None, None, None)

        x = self._prepare(np.asarray(vectors, dtype=float))
        scores = self._score(x)
        self._recent.extend(scores)
        self._recent_drift.extend(self._drift(x))
        hours = estimate_hours_to_limit(list(self._vibration))
        health = health_score(list(self._recent), list(self._recent_drift), hours)
        return ScoreResult(
            status="ready",
            progress=1.0,
            scores=[round(score, 4) for score in scores],
            anomalies=[score >= ANOMALY_THRESHOLD for score in scores],
            health_score=round(health, 1),
            health_status=health_status(health),
            hours_to_limit=None if hours is None else round(hours, 2),
        )

    def _fit(self) -> bool:
        data = np.asarray(self._baseline, dtype=float)
        coverage = (~np.isnan(data)).mean(axis=0)
        columns = [index for index, share in enumerate(coverage) if share >= 0.9]
        if not columns:
            log.warning("device %s reports none of %s; restarting baseline", self.device_id, FEATURES)
            self._baseline.clear()
            return False

        x = data[:, columns]
        fill = np.nanmean(x, axis=0)
        x = np.where(np.isnan(x), fill, x)
        model = IsolationForest(n_estimators=200, contamination=self.contamination, random_state=42)
        model.fit(x)

        mean = x.mean(axis=0)
        # Floor the scale at 2% of the level so a near-constant signal does not turn tiny changes into huge drift.
        scale = np.maximum(x.std(axis=0), np.maximum(0.02 * np.abs(mean), 1e-3))

        self._model = model
        self._columns = columns
        self._fill = fill
        self._mean = mean
        self._scale = scale
        self._normal_score = float(np.median(model.score_samples(x)))
        self._boundary_score = min(float(model.offset_), self._normal_score - 1e-3)
        self._baseline.clear()
        log.info("device %s: model trained on %d readings using %s", self.device_id, len(x), self.features)
        return True

    def _prepare(self, vectors: np.ndarray) -> np.ndarray:
        """Selects the trained feature columns and fills missing sensor values with the baseline mean."""
        x = vectors[:, self._columns]
        return np.where(np.isnan(x), self._fill, x)

    def _drift(self, x: np.ndarray) -> list[float]:
        """Largest per-feature distance from the baseline mean, in baseline standard deviations."""
        return (np.abs(x - self._mean) / self._scale).max(axis=1).tolist()

    def _score(self, x: np.ndarray) -> list[float]:
        assert self._model is not None
        raw = self._model.score_samples(x)
        # 0 at the typical baseline reading, 0.5 at the learned anomaly boundary, 1 at twice that distance.
        span = self._normal_score - self._boundary_score
        return np.clip((self._normal_score - raw) / span * ANOMALY_THRESHOLD, 0.0, 1.0).tolist()

    def export_state(self) -> dict[str, Any]:
        return {
            "version": STATE_VERSION,
            "model": self._model,
            "columns": self._columns,
            "fill": self._fill,
            "mean": self._mean,
            "scale": self._scale,
            "normal_score": self._normal_score,
            "boundary_score": self._boundary_score,
        }

    @classmethod
    def from_state(cls, device_id: str, state: dict[str, Any], baseline_size: int, contamination: float) -> DeviceModel:
        device = cls(device_id, baseline_size, contamination)
        device._model = state["model"]
        device._columns = list(state["columns"])
        device._fill = state["fill"]
        device._mean = state["mean"]
        device._scale = state["scale"]
        device._normal_score = float(state["normal_score"])
        device._boundary_score = float(state["boundary_score"])
        return device


class ModelRegistry:
    """Thread-safe collection of device models, persisted to disk once trained."""

    def __init__(self, model_dir: Path | None, baseline_size: int = 300, contamination: float = 0.01) -> None:
        self.model_dir = model_dir
        self.baseline_size = baseline_size
        self.contamination = contamination
        self._models: dict[str, DeviceModel] = {}
        self._lock = threading.Lock()
        if model_dir is not None:
            model_dir.mkdir(parents=True, exist_ok=True)

    def score(self, device_id: str, readings: list[Reading]) -> ScoreResult:
        model = self._get(device_id)
        with model.lock:
            was_ready = model.ready
            result = model.process(readings)
            if model.ready and not was_ready:
                self._save(model)
        return result

    def delete(self, device_id: str) -> bool:
        with self._lock:
            existed = self._models.pop(device_id, None) is not None
            path = self._path(device_id)
            if path is not None and path.exists():
                path.unlink()
                existed = True
        return existed

    def summaries(self) -> list[dict[str, Any]]:
        with self._lock:
            models = list(self._models.values())
        return [
            {"device_id": m.device_id, "ready": m.ready, "progress": round(m.progress, 3), "features": m.features}
            for m in models
        ]

    def __len__(self) -> int:
        return len(self._models)

    def _get(self, device_id: str) -> DeviceModel:
        with self._lock:
            model = self._models.get(device_id)
            if model is None:
                model = self._load(device_id) or DeviceModel(device_id, self.baseline_size, self.contamination)
                self._models[device_id] = model
            return model

    def _path(self, device_id: str) -> Path | None:
        return None if self.model_dir is None else self.model_dir / f"{device_id}.joblib"

    def _save(self, model: DeviceModel) -> None:
        path = self._path(model.device_id)
        if path is not None:
            joblib.dump(model.export_state(), path)

    def _load(self, device_id: str) -> DeviceModel | None:
        path = self._path(device_id)
        if path is None or not path.exists():
            return None
        try:
            state = joblib.load(path)
            if state.get("version") != STATE_VERSION:
                return None
            return DeviceModel.from_state(device_id, state, self.baseline_size, self.contamination)
        except Exception:  # a corrupt or incompatible file should only cost a retrain
            log.exception("could not load model for %s; it will be retrained", device_id)
            return None
