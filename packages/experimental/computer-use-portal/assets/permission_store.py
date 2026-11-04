"""Private, versioned portal restore-token storage; invalid state fails closed."""
import json
import os
import stat
import tempfile


def load_token(path):
    """Read an owner-only token without following a symbolic link."""
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    except FileNotFoundError:
        return None
    with os.fdopen(fd) as source:
        info = os.fstat(source.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
            raise ValueError("Desktop token must be an owner-only regular file; repair its permissions before restart.")
        value = json.loads(source.read(65537))
    if not isinstance(value, dict) or value.get("version") != 1 or not isinstance(value.get("token"), str) or not value["token"]:
        raise ValueError("Invalid desktop token state; restore the file or explicitly reset desktop authorization.")
    return value["token"]


def save_token(path, token):
    """Atomically replace a single-use token and sync the file and directory."""
    directory = os.path.dirname(path)
    os.makedirs(directory, mode=0o700, exist_ok=True)
    info = os.lstat(directory)
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
        raise ValueError("Desktop token directory must be owned by this user with mode 0700.")
    fd, temporary = tempfile.mkstemp(dir=directory)
    try:
        with os.fdopen(fd, "w") as output:
            json.dump({"version": 1, "token": token}, output)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
        directory_fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
