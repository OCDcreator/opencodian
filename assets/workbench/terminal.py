"""JSONL bridge to a real POSIX pseudo terminal. Owns only its child session."""
import base64
import errno
import fcntl
import json
import os
import pty
import select
import signal
import struct
import sys
import termios
import time


def emit(value):
    sys.stdout.write(json.dumps(value) + "\n")
    sys.stdout.flush()


def main():
    cwd = os.path.realpath(sys.argv[1])
    if not os.path.isdir(cwd):
        raise ValueError("Terminal workspace is not a directory")
    shell = os.environ.get("SHELL", "/bin/sh")
    child, master = pty.fork()
    if child == 0:
        os.chdir(cwd)
        environment = dict(os.environ, TERM="xterm-256color", COLORTERM="truecolor")
        os.execvpe(shell, [shell, "-l"], environment)
    buffer = b""
    stopping = False

    def stop(_signal=None, _frame=None):
        nonlocal stopping
        stopping = True
        try:
            os.killpg(child, signal.SIGHUP)
        except ProcessLookupError:
            pass

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGHUP, stop)
    emit({"type": "ready", "pid": child})
    try:
        while not stopping:
            ready, _, _ = select.select([sys.stdin.buffer, master], [], [], 0.2)
            if master in ready:
                try:
                    data = os.read(master, 32768)
                except OSError as error:
                    if error.errno == errno.EIO:
                        break
                    raise
                if not data:
                    break
                emit({"type": "data", "data": base64.b64encode(data).decode("ascii")})
            if sys.stdin.buffer in ready:
                data = os.read(sys.stdin.fileno(), 32768)
                if not data:
                    break
                buffer += data
                if len(buffer) > 1024 * 1024:
                    raise ValueError("Terminal input frame is too large")
                while b"\n" in buffer:
                    line, buffer = buffer.split(b"\n", 1)
                    message = json.loads(line)
                    if message.get("type") == "input":
                        os.write(master, str(message.get("data", "")).encode("utf-8"))
                    elif message.get("type") == "resize":
                        columns = max(2, min(500, int(message["cols"])))
                        rows = max(2, min(300, int(message["rows"])))
                        fcntl.ioctl(master, termios.TIOCSWINSZ, struct.pack("HHHH", rows, columns, 0, 0))
                    elif message.get("type") == "close":
                        stop()
    finally:
        stop()
        os.close(master)
        status = 0
        reaped = False
        try:
            for _ in range(100):
                exited, status = os.waitpid(child, os.WNOHANG)
                if exited:
                    reaped = True
                    break
                time.sleep(0.01)
            if not reaped:
                os.killpg(child, signal.SIGKILL)
                _, status = os.waitpid(child, 0)
            emit({"type": "exit", "code": os.waitstatus_to_exitcode(status)})
        except (ProcessLookupError, ChildProcessError):
            emit({"type": "exit", "code": 0})


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        emit({"type": "error", "message": str(error)})
        sys.exit(1)
