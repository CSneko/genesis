#!/usr/bin/env bash
# Launch the CosyVoice2 text-to-speech WebUI with CPU inference.
#
# Installation lives in /home/n2/cosyvoice:
#   CosyVoice/  git checkout (CosyVoice2-0.5B weights in pretrained_models/)
#   venv/       Python 3.10 virtualenv with the CPU-only dependencies
#
# Examples:
#   ./start-cosyvoice.sh                     # http://<host>:50000
#   ./start-cosyvoice.sh --port 6006         # custom port
#   COSYVOICE_THREADS=6 ./start-cosyvoice.sh # limit CPU threads (default: all)
set -euo pipefail

INSTALL_ROOT="${COSYVOICE_HOME:-/home/n2/cosyvoice}"
REPO_DIR="$INSTALL_ROOT/CosyVoice"
VENV_DIR="$INSTALL_ROOT/venv"
MODEL_DIR="${COSYVOICE_MODEL_DIR:-$REPO_DIR/pretrained_models/CosyVoice2-0.5B}"
PORT="${COSYVOICE_PORT:-50000}"
THREADS="${COSYVOICE_THREADS:-$(nproc)}"

usage() {
    sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        -p|--port)      PORT="${2:?--port needs a value}"; shift 2 ;;
        -m|--model-dir) MODEL_DIR="${2:?--model-dir needs a value}"; shift 2 ;;
        -t|--threads)   THREADS="${2:?--threads needs a value}"; shift 2 ;;
        -h|--help)      usage; exit 0 ;;
        *) echo "unknown option: $1" >&2; usage >&2; exit 1 ;;
    esac
done

if [[ ! -x "$VENV_DIR/bin/python" ]]; then
    echo "error: Python venv not found at $VENV_DIR" >&2
    exit 1
fi
if [[ ! -f "$MODEL_DIR/cosyvoice2.yaml" ]]; then
    echo "error: CosyVoice2 model not found at $MODEL_DIR" >&2
    exit 1
fi

export PATH="$VENV_DIR/bin:$PATH"
export PYTHONUNBUFFERED=1
export TOKENIZERS_PARALLELISM=false
export GRADIO_ANALYTICS_ENABLED=False
export OMP_NUM_THREADS="$THREADS"
export MKL_NUM_THREADS="$THREADS"
# httpx (used by gradio) rejects the socks:// value of ALL_PROXY set by the
# system proxy; gradio only talks to localhost and api.gradio.app anyway.
unset ALL_PROXY all_proxy
export NO_PROXY="localhost,127.0.0.1,::1,0.0.0.0"
export no_proxy="$NO_PROXY"

echo "CosyVoice2 WebUI (CPU only)"
echo "  model : $MODEL_DIR"
echo "  port  : $PORT (all interfaces, also reachable from the LAN)"
echo "  threads: $THREADS"
echo "  open  : http://127.0.0.1:$PORT/"
echo "Press Ctrl+C to stop."

cd "$REPO_DIR"
exec "$VENV_DIR/bin/python" webui.py --port "$PORT" --model_dir "$MODEL_DIR"
