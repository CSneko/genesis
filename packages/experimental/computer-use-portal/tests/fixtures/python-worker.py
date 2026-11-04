#!/usr/bin/python3 -u
"""External worker fixture exercising Python output through managed pipes."""
import json
from pathlib import Path
import select
import sys

sys.path.insert(0, str(Path(__file__).parents[2] / "assets"))
from worker_io import emit, prepare_stdio

prepare_stdio()
emit({"ready": True})
while select.select([sys.stdin], [], [])[0]:
    line = sys.stdin.readline()
    if not line:
        break
    request = json.loads(line)
    emit({"id": request["id"], "result": {"payload": "x" * (512 * 1024)}})
