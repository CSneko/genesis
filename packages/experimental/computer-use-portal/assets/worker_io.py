"""Blocking JSON-line transport over the worker's inherited standard streams."""
import json
import os
import sys


def prepare_stdio():
    # Managed child sockets may be nonblocking. Python's unbuffered text writer
    # can silently short-write a large JSON line unless its descriptor blocks.
    for stream in (sys.stdin, sys.stdout, sys.stderr):
        os.set_blocking(stream.fileno(), True)


def emit(value):
    print(json.dumps(value, ensure_ascii=False), flush=True)
