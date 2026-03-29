# ── SafeVision PPE — Backend (CPU) ─────────────────────────────────────────
# WORKDIR is /app/backend so that the model path
#   Path(__file__).parent.parent.parent / "models" / "best.pt"
# resolves to /app/models/best.pt (mounted as volume).

FROM python:3.11-slim

# System libraries required by opencv-headless and Pillow
RUN apt-get update && apt-get install -y --no-install-recommends \
        libglib2.0-0 \
        libgl1 \
        libsm6 \
        libxext6 \
        libxrender1 \
        fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend

# ── Install PyTorch CPU wheels first (heavy, cached as a separate layer) ──
RUN pip install --no-cache-dir \
    torch==2.2.2 \
    torchvision==0.17.2 \
    --index-url https://download.pytorch.org/whl/cpu

# ── Install remaining application dependencies ────────────────────────────
COPY requirements-docker.txt .
RUN pip install --no-cache-dir -r requirements-docker.txt

# ── Copy application source ───────────────────────────────────────────────
COPY . .

# Ensure data directories exist (will be overridden by bind mount in prod)
RUN mkdir -p data/clips data/snapshots

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
