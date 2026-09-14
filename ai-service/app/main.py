"""MachineWatch AI service: per-device anomaly detection and health scoring over HTTP."""

from __future__ import annotations

import logging
import os
from dataclasses import asdict
from pathlib import Path
from typing import Annotated

from fastapi import FastAPI, Path as PathParam
from pydantic import BaseModel, Field

from .detector import ModelRegistry, Reading

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"), format="%(asctime)s %(levelname)s %(name)s: %(message)s")

DEVICE_ID_PATTERN = r"^[A-Za-z0-9_-]{1,64}$"
DeviceId = Annotated[str, PathParam(pattern=DEVICE_ID_PATTERN)]


class ReadingIn(BaseModel):
    ts: int
    temperature: float | None = None
    vibration: float | None = None
    current: float | None = None


class ScoreRequest(BaseModel):
    device_id: str = Field(pattern=DEVICE_ID_PATTERN)
    readings: list[ReadingIn] = Field(min_length=1, max_length=1000)


class ScoreResponse(BaseModel):
    status: str
    progress: float
    scores: list[float | None]
    anomalies: list[bool]
    health_score: float | None
    health_status: str | None
    hours_to_limit: float | None


def create_app(registry: ModelRegistry | None = None) -> FastAPI:
    if registry is None:
        model_dir = os.getenv("MODEL_DIR", "./models")
        registry = ModelRegistry(
            model_dir=Path(model_dir) if model_dir else None,
            baseline_size=int(os.getenv("BASELINE_SIZE", "300")),
            contamination=float(os.getenv("CONTAMINATION", "0.01")),
        )

    app = FastAPI(
        title="MachineWatch AI Service",
        version="1.0.0",
        description="Learns each machine's normal behaviour and scores new telemetry for anomalies.",
    )

    @app.get("/health")
    def health() -> dict[str, object]:
        return {"status": "ok", "models": len(registry)}

    @app.post("/score", response_model=ScoreResponse)
    def score(request: ScoreRequest) -> ScoreResponse:
        readings = [Reading(**reading.model_dump()) for reading in request.readings]
        return ScoreResponse(**asdict(registry.score(request.device_id, readings)))

    @app.get("/models")
    def list_models() -> list[dict[str, object]]:
        return registry.summaries()

    @app.delete("/models/{device_id}")
    def delete_model(device_id: DeviceId) -> dict[str, bool]:
        return {"deleted": registry.delete(device_id)}

    return app


app = create_app()
