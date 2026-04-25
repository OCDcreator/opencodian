#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import signal
import subprocess
import sys
import time
from pathlib import Path
from typing import Sequence


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run opencode implementation passes with a streamed log and a hard timeout."
    )
    parser.add_argument(
        "--dir",
        default=".",
        help="Repository directory to pass through to `opencode run --dir`.",
    )
    parser.add_argument(
        "--log-path",
        required=True,
        help="Combined stdout/stderr transcript path.",
    )
    parser.add_argument(
        "--timeout-seconds",
        type=int,
        default=3600,
        help="Hard timeout for the opencode subprocess. Defaults to 3600 seconds.",
    )
    parser.add_argument(
        "--agent",
        default="build",
        help="OpenCode agent to use for the implementation pass.",
    )
    parser.add_argument("--model", default="", help="Optional provider/model override.")
    parser.add_argument("--variant", default="", help="Optional model variant override.")
    parser.add_argument(
        "--message-file",
        default="",
        help="Read the implementation brief from this file.",
    )
    parser.add_argument(
        "--file",
        action="append",
        default=[],
        help="Optional attachment path to pass through to `opencode run -f`.",
    )
    parser.add_argument(
        "message",
        nargs="*",
        help="Fallback inline message when --message-file is not supplied.",
    )
    return parser.parse_args()


def resolve_message(args: argparse.Namespace) -> str:
    if args.message_file:
        return Path(args.message_file).read_text(encoding="utf-8")
    inline_message = " ".join(args.message).strip()
    if inline_message:
        return inline_message
    raise SystemExit("Either --message-file or an inline message is required.")


def build_command(args: argparse.Namespace, message: str) -> list[str]:
    command = [
        "opencode",
        "run",
        "--pure",
        "--dangerously-skip-permissions",
        "--print-logs",
        "--dir",
        args.dir,
    ]
    if args.agent:
        command.extend(["--agent", args.agent])
    if args.model:
        command.extend(["--model", args.model])
    if args.variant:
        command.extend(["--variant", args.variant])
    for attachment in args.file:
        command.extend(["--file", attachment])
    command.append(message)
    return command


def terminate_process_tree(process: subprocess.Popen[bytes], *, grace_seconds: float) -> None:
    if process.poll() is not None:
        return

    if os.name == "nt":
        process.terminate()
    else:
        try:
            os.killpg(process.pid, signal.SIGTERM)
        except ProcessLookupError:
            return

    deadline = time.monotonic() + grace_seconds
    while time.monotonic() < deadline:
        if process.poll() is not None:
            return
        time.sleep(0.2)

    if process.poll() is not None:
        return

    if os.name == "nt":
        process.kill()
        return

    try:
        os.killpg(process.pid, signal.SIGKILL)
    except ProcessLookupError:
        return


def stream_command(
    command: Sequence[str],
    *,
    log_path: Path,
    timeout_seconds: int,
) -> int:
    popen_kwargs: dict[str, object] = {
        "stdout": subprocess.PIPE,
        "stderr": subprocess.STDOUT,
        "stdin": subprocess.DEVNULL,
        "cwd": os.getcwd(),
    }
    if os.name != "nt":
        popen_kwargs["preexec_fn"] = os.setsid

    with log_path.open("w", encoding="utf-8", newline="\n") as log_handle:
        log_handle.write(f"[runner] timeout_seconds={timeout_seconds}\n")
        log_handle.write(f"[runner] command={' '.join(command)}\n")
        log_handle.flush()

        process = subprocess.Popen(command, **popen_kwargs)
        start = time.monotonic()

        assert process.stdout is not None
        while True:
            if process.poll() is not None:
                break
            if timeout_seconds > 0 and time.monotonic() - start >= timeout_seconds:
                timeout_message = (
                    f"[runner] timeout after {timeout_seconds} seconds; terminating opencode subprocess"
                )
                print(timeout_message, flush=True)
                log_handle.write(timeout_message + "\n")
                log_handle.flush()
                terminate_process_tree(process, grace_seconds=10.0)
                return 124

            line = process.stdout.readline()
            if not line:
                time.sleep(0.1)
                continue
            decoded = line.decode("utf-8", errors="replace")
            sys.stdout.write(decoded)
            sys.stdout.flush()
            log_handle.write(decoded)
            log_handle.flush()

        while True:
            tail = process.stdout.readline()
            if not tail:
                break
            decoded = tail.decode("utf-8", errors="replace")
            sys.stdout.write(decoded)
            sys.stdout.flush()
            log_handle.write(decoded)
            log_handle.flush()

        return int(process.returncode or 0)


def main() -> int:
    args = parse_args()
    message = resolve_message(args)
    log_path = Path(args.log_path)
    log_path.parent.mkdir(parents=True, exist_ok=True)
    command = build_command(args, message)
    return stream_command(command, log_path=log_path, timeout_seconds=max(0, args.timeout_seconds))


if __name__ == "__main__":
    raise SystemExit(main())
