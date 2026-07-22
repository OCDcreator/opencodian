"""Run graphify update while tolerating sandboxed macOS semaphore probes."""

from __future__ import annotations

import os
import runpy
import sys


def install_sysconf_compatibility() -> None:
    """Expose an indeterminate semaphore limit when the host denies sysconf."""

    try:
        os.sysconf("SC_SEM_NSEMS_MAX")
    except PermissionError:
        original_sysconf = os.sysconf

        def sysconf_with_semaphore_fallback(name: str | int) -> int:
            if name == "SC_SEM_NSEMS_MAX":
                return -1
            return original_sysconf(name)

        os.sysconf = sysconf_with_semaphore_fallback


def main() -> None:
    install_sysconf_compatibility()
    sys.argv = ["graphify", "update", *sys.argv[1:]]
    runpy.run_module("graphify", run_name="__main__")


if __name__ == "__main__":
    main()
