#!/usr/bin/env bash
# ── SafeVision PPE — Linux deploy script ─────────────────────────────────────
# Run this on your Linux server after cloning the repository.
#
# Usage:
#   chmod +x deploy.sh
#   ./deploy.sh            # CPU mode (default)
#   ./deploy.sh --gpu      # GPU mode (requires NVIDIA Container Toolkit)
#   ./deploy.sh --reset    # Wipe all data and start fresh (first deploy)
#   ./deploy.sh --update   # Rebuild images and restart (code update)

set -euo pipefail

COMPOSE_CPU="docker compose -f docker-compose.yml"
COMPOSE_GPU="docker compose -f docker-compose.yml -f docker-compose.gpu.yml"
COMPOSE_CMD="$COMPOSE_CPU"

GPU=false
RESET=false
UPDATE=false

for arg in "$@"; do
  case $arg in
    --gpu)    GPU=true;    COMPOSE_CMD="$COMPOSE_GPU" ;;
    --reset)  RESET=true  ;;
    --update) UPDATE=true ;;
    *) echo "Unknown option: $arg"; exit 1 ;;
  esac
done

# ── Check prerequisites ──────────────────────────────────────────────────────
echo "=== SafeVision PPE Deploy ==="

if ! command -v docker &>/dev/null; then
  echo "ERROR: Docker not found. Install Docker Engine first:"
  echo "  https://docs.docker.com/engine/install/"
  exit 1
fi

if ! docker compose version &>/dev/null; then
  echo "ERROR: 'docker compose' plugin not found."
  echo "  Install: https://docs.docker.com/compose/install/"
  exit 1
fi

# ── .env setup ───────────────────────────────────────────────────────────────
if [ ! -f .env ]; then
  echo ""
  echo "No .env file found — creating from .env.example"
  cp .env.example .env
  SECRET=$(openssl rand -hex 32 2>/dev/null || cat /proc/sys/kernel/random/uuid | tr -d '-')
  sed -i "s/change-this-to-a-random-secret-in-production/$SECRET/" .env
  echo "  Generated PPE_SECRET_KEY automatically."
  echo "  Review .env if you want to change PORT or other settings."
fi

# ── Check models ──────────────────────────────────────────────────────────────
if [ ! -f models/best.pt ]; then
  echo ""
  echo "WARNING: models/best.pt not found!"
  echo "  The backend will start but YOLO detection will fail."
  echo "  Copy best.pt into the models/ directory before using the app."
fi

# ── Optional: reset all data ─────────────────────────────────────────────────
if $RESET; then
  echo ""
  echo "--- RESET: wiping all application data ---"
  $COMPOSE_CMD down -v 2>/dev/null || true
  echo "  Deleted Docker volumes."
  echo "  The setup wizard will run on first browser visit."
fi

# ── Stop old containers (for update) ─────────────────────────────────────────
if $UPDATE; then
  echo ""
  echo "--- UPDATE: rebuilding images ---"
  $COMPOSE_CMD down --remove-orphans
fi

# ── Build & start ─────────────────────────────────────────────────────────────
echo ""
echo "--- Building Docker images (this takes a while on first run) ---"
$COMPOSE_CMD build

echo ""
echo "--- Starting containers ---"
$COMPOSE_CMD up -d

echo ""
echo "=== Done! ==="
echo ""
$COMPOSE_CMD ps
echo ""
PORT_VAL=$(grep '^PORT=' .env 2>/dev/null | cut -d= -f2 || echo "80")
echo "  App: http://$(hostname -I | awk '{print $1}'):${PORT_VAL:-80}"
echo ""
echo "Useful commands:"
echo "  View logs:    docker compose logs -f"
echo "  Stop:         docker compose down"
echo "  Shell in API: docker compose exec backend bash"
echo "  Reset data:   ./deploy.sh --reset"
