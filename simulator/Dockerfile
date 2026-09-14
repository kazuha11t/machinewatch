FROM python:3.11-slim

WORKDIR /app
ENV PYTHONUNBUFFERED=1

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY simulator.py .

RUN useradd --system --no-create-home sim
USER sim

ENTRYPOINT ["python", "simulator.py"]
