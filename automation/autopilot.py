#!/usr/bin/env python
from __future__ import annotations

import argparse
import json
import os
import signal
import shutil
import socket
import subprocess
import sys
import threading
import time
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CONFIG_PATH = "automation/maintainability-config.json"
DEFAULT_STATE_PATH = "automation/runtime/maintainability-state.json"
DEFAULT_RUNTIME_PATH = "automation/runtime"
DEFAULT_PROFILE_NAME = "windows"
LOCK_FILENAME = "autopilot.lock.json"
SCHEMA_REQUIRED_TYPES: dict[str, tuple[type, ...]] = {
    "string": (str,),
    "boolean": (bool,),
    "array": (list,),
    "object": (dict,),
    "null": (type(None),),
}


class AutopilotError(RuntimeError):
    pass


@dataclass
class CommandResult:
    stdout: str
    stderr: str
    returncode: int


def now_timestamp() -> str:
    return datetime.now().isoformat(timespec="seconds")


def clean_string(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def compact_text(text: str | None, max_length: int = 180) -> str:
    if not text or not text.strip():
        return ""
    single_line = " ".join(text.split())
    if len(single_line) <= max_length:
        return single_line
    return f"{single_line[: max_length - 3]}..."


def resolve_repo_path(path_value: str) -> Path:
    path = Path(path_value)
    if path.is_absolute():
        return path.resolve()
    return (REPO_ROOT / path).resolve()


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def read_json(path: Path) -> Any:
    return json.loads(read_text(path))


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def append_jsonl(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8", newline="\n") as handle:
        handle.write(json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n")


def info(message: str) -> None:
    print(f"[autopilot] {message}")


def progress(progress_log_path: Path, message: str, channel: str = "codex") -> None:
    line = f"[{datetime.now().strftime('%H:%M:%S')}] [{channel}] {message}"
    progress_log_path.parent.mkdir(parents=True, exist_ok=True)
    with progress_log_path.open("a", encoding="utf-8", newline="\n") as handle:
        handle.write(line + "\n")
    print(line)


def render_template(template_text: str, tokens: dict[str, Any]) -> str:
    rendered = template_text
    for token_key, token_value in tokens.items():
        rendered = rendered.replace(f"{{{{{token_key}}}}}", clean_string(token_value))
    return rendered


def run_command(
    args: list[str],
    *,
    check: bool = True,
    cwd: Path = REPO_ROOT,
) -> CommandResult:
    process = subprocess.run(
        args,
        cwd=str(cwd),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    result = CommandResult(
        stdout=process.stdout.strip(),
        stderr=process.stderr.strip(),
        returncode=process.returncode,
    )
    if check and process.returncode != 0:
        combined = "\n".join(part for part in (result.stdout, result.stderr) if part)
        raise AutopilotError(f"{' '.join(args)} failed: {combined}")
    return result


def run_git(args: list[str], *, check: bool = True) -> CommandResult:
    return run_command(["git", "-C", str(REPO_ROOT), *args], check=check)


def run_git_no_capture(args: list[str], *, check: bool = True) -> int:
    process = subprocess.run(["git", "-C", str(REPO_ROOT), *args], check=False)
    if check and process.returncode != 0:
        raise AutopilotError(f"git {' '.join(args)} failed with exit code {process.returncode}")
    return int(process.returncode)


def new_state(config: dict[str, Any]) -> dict[str, Any]:
    timestamp = now_timestamp()
    return {
        "status": "active",
        "current_round": 0,
        "consecutive_failures": 0,
        "next_phase_number": int(config["next_phase_number"]),
        "last_phase_doc": str(config["starting_phase_doc"]),
        "last_commit_sha": None,
        "last_summary": None,
        "last_next_focus": str(config["focus_hint"]),
        "last_result": None,
        "last_blocking_reason": None,
        "started_at": timestamp,
        "updated_at": timestamp,
    }


def save_state(state: dict[str, Any], state_path: Path) -> None:
    state["updated_at"] = now_timestamp()
    write_json(state_path, state)


def resume_state_if_threshold_allows(
    state: dict[str, Any],
    config: dict[str, Any],
    state_path: Path,
) -> dict[str, Any]:
    previous_status = clean_string(state.get("status"))
    should_resume = False
    if previous_status == "stopped_max_rounds":
        should_resume = int(state["current_round"]) < int(config["max_rounds"])
    elif previous_status == "stopped_failures":
        should_resume = int(state["consecutive_failures"]) < int(config["max_consecutive_failures"])

    if not should_resume:
        return state

    state["status"] = "active"
    save_state(state, state_path)
    info(f"State status '{previous_status}' is resumable with current config; resuming.")
    return state


def append_history_entry(runtime_directory: Path, entry: dict[str, Any]) -> None:
    append_jsonl(runtime_directory / "history.jsonl", entry)


def test_branch_allowed(branch_name: str, allowed_prefixes: list[str]) -> bool:
    return any(branch_name.lower().startswith(prefix.lower()) for prefix in allowed_prefixes)


def is_working_tree_dirty() -> bool:
    return bool(run_git(["status", "--porcelain"]).stdout.strip())


def reset_worktree_to_head(head_sha: str) -> None:
    run_git(["reset", "--hard", head_sha])
    run_git(["clean", "-fd"])


def get_commit_files(commit_sha: str) -> list[str]:
    output = run_git(["diff-tree", "--no-commit-id", "--name-only", "-r", commit_sha]).stdout
    if not output:
        return []
    return [line for line in output.splitlines() if line.strip()]


def test_build_required(files: list[str]) -> bool:
    for file_path in files:
        normalized = file_path.replace("\\", "/")
        if normalized.startswith(("src/", "assets/", "scripts/")):
            return True
        if normalized in {"styles.css", "manifest.json", "package.json", "esbuild.config.mjs"}:
            return True
        if normalized.endswith((".ts", ".tsx", ".js", ".mjs", ".cjs", ".css")) and not normalized.startswith(
            ("tests/", "docs/", "automation/")
        ):
            return True
    return False


def test_deployed_build_id(plugin_directory: str, build_id: str) -> bool:
    deployed_main_path = Path(plugin_directory) / "main.js"
    if not deployed_main_path.exists():
        return False
    return build_id in deployed_main_path.read_text(encoding="utf-8", errors="replace")


def pid_exists(pid: int) -> bool:
    if pid <= 0:
        return False
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def load_profile(profile_name: str, profile_path_override: str | None) -> tuple[str, Path, dict[str, Any]]:
    if profile_path_override:
        profile_path = resolve_repo_path(profile_path_override)
        profile_key = profile_name
    else:
        profile_key = profile_name
        profile_path = resolve_repo_path(f"automation/profiles/{profile_name}.json")
    if not profile_path.exists():
        raise AutopilotError(f"Profile '{profile_key}' was not found at {profile_path}.")
    return profile_key, profile_path, read_json(profile_path)


def load_config(config_path_value: str, profile_name: str, profile_path_override: str | None) -> tuple[dict[str, Any], Path, Path]:
    config_path = resolve_repo_path(config_path_value)
    if not config_path.exists():
        raise AutopilotError(f"Config file not found: {config_path}")
    base_config = read_json(config_path)
    _, profile_path, profile_config = load_profile(profile_name, profile_path_override)
    merged_config = dict(base_config)
    merged_config.update(profile_config)
    merged_config["profile_name"] = profile_name
    return merged_config, config_path, profile_path


def read_lock(lock_path: Path) -> dict[str, Any] | None:
    if not lock_path.exists():
        return None
    try:
        return read_json(lock_path)
    except json.JSONDecodeError:
        return {"invalid": True, "raw_path": str(lock_path)}


def acquire_lock(
    runtime_directory: Path,
    *,
    branch: str,
    head_sha: str,
    profile_name: str,
    force_lock: bool,
) -> dict[str, Any]:
    lock_path = runtime_directory / LOCK_FILENAME
    existing_lock = read_lock(lock_path)
    hostname = socket.gethostname()
    current_pid = os.getpid()

    if existing_lock:
        existing_host = clean_string(existing_lock.get("hostname"))
        existing_pid_raw = existing_lock.get("pid")
        try:
            existing_pid = int(existing_pid_raw)
        except (TypeError, ValueError):
            existing_pid = -1

        if existing_host and existing_host != hostname:
            if not force_lock:
                raise AutopilotError(
                    f"Lock file is owned by host '{existing_host}' (pid {existing_pid}). "
                    "Stop the other machine first or rerun with --force-lock."
                )
            info(f"Overriding lock owned by host '{existing_host}' (pid {existing_pid}).")
        elif existing_pid > 0 and existing_pid != current_pid and pid_exists(existing_pid):
            if not force_lock:
                raise AutopilotError(
                    f"Another autopilot is already running on this host (pid {existing_pid}). "
                    "Stop it first or rerun with --force-lock."
                )
            info(f"Overriding running local lock owned by pid {existing_pid}.")
        elif existing_lock.get("invalid"):
            info(f"Replacing unreadable lock file at {lock_path}.")
        else:
            info("Replacing stale lock file.")

    lock_data = {
        "hostname": hostname,
        "pid": current_pid,
        "started_at": now_timestamp(),
        "branch": branch,
        "head": head_sha,
        "profile": profile_name,
    }
    write_json(lock_path, lock_data)
    return lock_data


def release_lock(runtime_directory: Path, lock_data: dict[str, Any] | None) -> None:
    if not lock_data:
        return
    lock_path = runtime_directory / LOCK_FILENAME
    if not lock_path.exists():
        return
    try:
        current_lock = read_json(lock_path)
    except json.JSONDecodeError:
        lock_path.unlink(missing_ok=True)
        return
    if (
        clean_string(current_lock.get("hostname")) == clean_string(lock_data.get("hostname"))
        and int(current_lock.get("pid", -1)) == int(lock_data.get("pid", -2))
    ):
        lock_path.unlink(missing_ok=True)


@contextmanager
def autopilot_lock(
    runtime_directory: Path,
    *,
    branch: str,
    head_sha: str,
    profile_name: str,
    force_lock: bool,
) -> Any:
    lock_data = acquire_lock(
        runtime_directory,
        branch=branch,
        head_sha=head_sha,
        profile_name=profile_name,
        force_lock=force_lock,
    )
    try:
        yield lock_data
    finally:
        release_lock(runtime_directory, lock_data)


def get_codex_item_summary(item: dict[str, Any], event_type: str) -> str | None:
    item_type = clean_string(item.get("type"))
    if item_type == "agent_message" and event_type == "item.completed":
        message_text = compact_text(clean_string(item.get("text")), max_length=220)
        if message_text:
            return f"Agent: {message_text}"

    if item_type == "command_execution":
        command_text = compact_text(clean_string(item.get("command")), max_length=200)
        if event_type == "item.started":
            return f"Running command: {command_text}"
        exit_code = item.get("exit_code")
        exit_code_text = "?" if exit_code is None else str(exit_code)
        return f"Command finished (exit {exit_code_text}): {command_text}"

    if item_type:
        return f"{event_type}: {item_type}"
    return None


def get_codex_event_summary(json_line: str) -> str | None:
    try:
        event_record = json.loads(json_line)
    except json.JSONDecodeError:
        return f"Raw output: {compact_text(json_line, max_length=220)}"

    event_type = clean_string(event_record.get("type"))
    if event_type == "thread.started":
        return f"Session started: {event_record.get('thread_id')}"
    if event_type == "turn.started":
        return "Turn started"
    if event_type == "turn.completed":
        usage = event_record.get("usage") or {}
        if usage:
            return f"Turn completed (input {usage.get('input_tokens')}, output {usage.get('output_tokens')})"
        return "Turn completed"
    if event_type in {"item.started", "item.completed"}:
        item = event_record.get("item")
        if isinstance(item, dict):
            return get_codex_item_summary(item, event_type)
    if event_type:
        return f"Event: {event_type}"
    return None


def validate_schema_value(name: str, value: Any, property_schema: dict[str, Any]) -> str | None:
    allowed_types = property_schema.get("type")
    if allowed_types:
        type_names = [allowed_types] if isinstance(allowed_types, str) else list(allowed_types)
        allowed_python_types = tuple(
            python_type
            for type_name in type_names
            for python_type in SCHEMA_REQUIRED_TYPES.get(type_name, ())
        )
        if allowed_python_types and not isinstance(value, allowed_python_types):
            return f"{name} has invalid type."

    enum_values = property_schema.get("enum")
    if enum_values and value not in enum_values:
        return f"{name} must be one of: {', '.join(map(str, enum_values))}."

    min_length = property_schema.get("minLength")
    if isinstance(min_length, int) and isinstance(value, str) and len(value) < min_length:
        return f"{name} must be at least {min_length} characters."

    if property_schema.get("type") == "array" and isinstance(value, list):
        item_schema = property_schema.get("items")
        if isinstance(item_schema, dict):
            for index, item in enumerate(value):
                item_error = validate_schema_value(f"{name}[{index}]", item, item_schema)
                if item_error:
                    return item_error

    return None


def validate_result_shape(result: Any, schema: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    if not isinstance(result, dict):
        return ["Agent output must be a JSON object."]

    required_fields = schema.get("required", [])
    for field_name in required_fields:
        if field_name not in result:
            errors.append(f"Agent output is missing required field '{field_name}'.")

    if schema.get("additionalProperties") is False:
        allowed_fields = set((schema.get("properties") or {}).keys())
        for field_name in result.keys():
            if field_name not in allowed_fields:
                errors.append(f"Agent output includes unexpected field '{field_name}'.")

    for field_name, property_schema in (schema.get("properties") or {}).items():
        if field_name not in result:
            continue
        field_error = validate_schema_value(field_name, result[field_name], property_schema)
        if field_error:
            errors.append(field_error)

    return errors


def invoke_codex_round(
    *,
    prompt_path: Path,
    schema_path: Path,
    assistant_output_path: Path,
    events_log_path: Path,
    progress_log_path: Path,
    config: dict[str, Any],
) -> int:
    prompt_text = prompt_path.read_bytes()
    codex_executable = shutil.which("codex.cmd") or shutil.which("codex") or "codex"
    codex_args = [
        codex_executable,
        "exec",
        "-C",
        str(REPO_ROOT),
        "--dangerously-bypass-approvals-and-sandbox",
        "--json",
        "--color",
        "never",
        "--output-schema",
        str(schema_path),
        "-o",
        str(assistant_output_path),
    ]

    model_name = clean_string(config.get("codex_model"))
    if model_name:
        codex_args.extend(["-m", model_name])

    test_vault_directory = clean_string(config.get("test_vault_plugin_dir"))
    if test_vault_directory:
        codex_args.extend(["--add-dir", test_vault_directory])

    codex_args.append("-")

    stderr_log_path = events_log_path.with_suffix(".stderr.log")
    for log_path in (events_log_path, progress_log_path, stderr_log_path):
        if log_path.exists():
            log_path.unlink()
        log_path.parent.mkdir(parents=True, exist_ok=True)
        log_path.write_text("", encoding="utf-8")

    process = subprocess.Popen(
        codex_args,
        cwd=str(REPO_ROOT),
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=False,
    )

    if not process.stdin or not process.stdout or not process.stderr:
        raise AutopilotError("Failed to start codex subprocess with redirected pipes.")

    def stdout_worker() -> None:
        with events_log_path.open("a", encoding="utf-8", newline="\n") as events_handle:
            while True:
                stdout_line = process.stdout.readline()
                if not stdout_line:
                    break
                decoded_line = stdout_line.decode("utf-8", errors="replace").rstrip("\r\n")
                events_handle.write(decoded_line + "\n")
                events_handle.flush()
                summary = get_codex_event_summary(decoded_line)
                if summary:
                    progress(progress_log_path, summary)

    def stderr_worker() -> None:
        with stderr_log_path.open("a", encoding="utf-8", newline="\n") as stderr_handle:
            while True:
                stderr_line = process.stderr.readline()
                if not stderr_line:
                    break
                decoded_line = stderr_line.decode("utf-8", errors="replace").rstrip("\r\n")
                stderr_handle.write(decoded_line + "\n")
                stderr_handle.flush()
                if decoded_line.strip():
                    progress(progress_log_path, compact_text(decoded_line, max_length=220), channel="stderr")

    stdout_thread = threading.Thread(target=stdout_worker, daemon=True)
    stderr_thread = threading.Thread(target=stderr_worker, daemon=True)
    stdout_thread.start()
    stderr_thread.start()

    process.stdin.write(prompt_text)
    process.stdin.flush()
    process.stdin.close()

    return_code = process.wait()
    stdout_thread.join()
    stderr_thread.join()
    return return_code


def build_history_entry(
    *,
    attempt_number: int,
    phase_number: int,
    result: dict[str, Any] | None,
    failure_reason: str | None,
) -> dict[str, Any]:
    return {
        "timestamp": now_timestamp(),
        "round": attempt_number,
        "phase_number": phase_number,
        "status": "failure" if failure_reason else clean_string(result.get("status") if result else ""),
        "phase_doc": result.get("phase_doc_path") if result else None,
        "commit_sha": result.get("commit_sha") if result else None,
        "summary": result.get("summary") if result else None,
        "next_focus": result.get("next_focus") if result else None,
        "blocking_reason": failure_reason if failure_reason else None,
    }


def validate_round_result(
    *,
    result: dict[str, Any],
    schema: dict[str, Any],
    phase_doc_relative_path: str,
    config: dict[str, Any],
    ending_head: str,
    working_tree_dirty: bool,
) -> str | None:
    validation_errors = validate_result_shape(result, schema)

    if validation_errors:
        return " ".join(validation_errors)

    status = clean_string(result.get("status"))
    if status == "success":
        phase_doc_path_from_result = clean_string(result.get("phase_doc_path"))
        if not phase_doc_path_from_result:
            validation_errors.append("success result is missing phase_doc_path.")
        elif phase_doc_path_from_result != phase_doc_relative_path:
            validation_errors.append(
                f"success result phase_doc_path '{phase_doc_path_from_result}' does not match expected '{phase_doc_relative_path}'."
            )
        elif not resolve_repo_path(phase_doc_path_from_result).exists():
            validation_errors.append(f"phase doc '{phase_doc_path_from_result}' does not exist.")

        commit_sha = clean_string(result.get("commit_sha"))
        if not commit_sha:
            validation_errors.append("success result is missing commit_sha.")

        commit_message = clean_string(result.get("commit_message"))
        if not commit_message:
            validation_errors.append("success result is missing commit_message.")

        if commit_sha and ending_head != commit_sha:
            validation_errors.append(f"HEAD '{ending_head}' does not match commit_sha '{commit_sha}'.")

        if commit_sha:
            actual_commit_message = run_git(["log", "-1", "--pretty=%s", commit_sha]).stdout
            if actual_commit_message != commit_message:
                validation_errors.append(
                    f"Actual commit message '{actual_commit_message}' does not match reported '{commit_message}'."
                )

            commit_prefix = f"{clean_string(config.get('commit_prefix'))}:"
            if commit_prefix != ":" and not actual_commit_message.lower().startswith(commit_prefix.lower()):
                validation_errors.append(f"Commit message must start with '{commit_prefix}'.")

            validated_commit_files = get_commit_files(commit_sha)
            if test_build_required(validated_commit_files) and not bool(result.get("build_ran")):
                validation_errors.append("This round changed build-relevant files but reported build_ran=false.")

        build_id = clean_string(result.get("build_id"))
        if bool(result.get("build_ran")) and not build_id:
            validation_errors.append("build_ran=true requires a non-empty build_id.")

        if bool(result.get("build_ran")) and bool(config.get("deploy_after_build")) and not bool(result.get("deploy_ran")):
            validation_errors.append("build_ran=true requires deploy_ran=true for this repo.")

        if bool(result.get("deploy_ran")) and not bool(result.get("deploy_verified")):
            validation_errors.append("deploy_ran=true requires deploy_verified=true.")

        if bool(result.get("deploy_ran")) and build_id and not test_deployed_build_id(
            str(config.get("test_vault_plugin_dir")),
            build_id,
        ):
            validation_errors.append(f"Deployed Test Vault main.js does not contain BUILD_ID '{build_id}'.")

        if working_tree_dirty:
            validation_errors.append("Working tree is dirty after success commit.")

    elif status == "failure":
        blocking_reason = clean_string(result.get("blocking_reason"))
        if not blocking_reason:
            validation_errors.append("Agent reported failure without blocking_reason.")
        else:
            return blocking_reason
    elif status == "goal_complete":
        if working_tree_dirty:
            validation_errors.append("goal_complete returned with a dirty working tree.")
        else:
            goal_commit_sha = clean_string(result.get("commit_sha"))
            if goal_commit_sha and goal_commit_sha != ending_head:
                validation_errors.append(
                    f"goal_complete reported commit_sha '{goal_commit_sha}' but HEAD is '{ending_head}'."
                )
    else:
        validation_errors.append(f"Unknown agent status '{status}'.")

    return " ".join(validation_errors) if validation_errors else None


def get_current_branch() -> str:
    return run_git(["branch", "--show-current"]).stdout


def get_head_sha() -> str:
    return run_git(["rev-parse", "HEAD"]).stdout


def ensure_commands_available(command_names: list[str]) -> list[str]:
    missing: list[str] = []
    for command_name in command_names:
        if shutil.which(command_name) is None:
            missing.append(command_name)
    return missing


def run_start(args: argparse.Namespace) -> int:
    config, _, _ = load_config(args.config_path, args.profile, args.profile_path)
    state_path = resolve_repo_path(args.state_path)
    runtime_directory = state_path.parent
    runtime_directory.mkdir(parents=True, exist_ok=True)

    template_path = resolve_repo_path(str(config["prompt_template"]))
    schema_path = resolve_repo_path(str(config["result_schema"]))
    schema = read_json(schema_path)

    missing_commands = ensure_commands_available(["git", "codex"])
    if missing_commands:
        raise AutopilotError(f"Required command(s) not found in PATH: {', '.join(missing_commands)}")

    state = read_json(state_path) if state_path.exists() else new_state(config)
    if not state_path.exists():
        save_state(state, state_path)
    state = resume_state_if_threshold_allows(state, config, state_path)

    current_branch = get_current_branch()
    if not args.no_branch_guard and not test_branch_allowed(current_branch, list(config.get("allowed_branch_prefixes", []))):
        raise AutopilotError(
            "Refusing to run on branch "
            f"'{current_branch}'. Use a dedicated worktree branch with one of these prefixes: "
            f"{', '.join(config.get('allowed_branch_prefixes', []))}."
        )

    if not args.allow_dirty_worktree and is_working_tree_dirty():
        raise AutopilotError("Working tree must be clean before unattended execution.")

    rounds_executed = 0
    template_text = read_text(template_path)
    head_sha = get_head_sha()

    with autopilot_lock(
        runtime_directory,
        branch=current_branch,
        head_sha=head_sha,
        profile_name=args.profile,
        force_lock=args.force_lock,
    ):
        while True:
            if args.single_round and rounds_executed >= 1:
                info("Single round requested; stopping.")
                break

            if args.max_rounds_this_run > 0 and rounds_executed >= args.max_rounds_this_run:
                info(f"Reached MaxRoundsThisRun={args.max_rounds_this_run}; stopping.")
                break

            if clean_string(state.get("status")) != "active":
                info(f"State status is '{state.get('status')}'; stopping.")
                break

            if int(state["current_round"]) >= int(config["max_rounds"]):
                state["status"] = "stopped_max_rounds"
                save_state(state, state_path)
                info(f"Reached max_rounds={config['max_rounds']}; stopping.")
                break

            if int(state["consecutive_failures"]) >= int(config["max_consecutive_failures"]):
                state["status"] = "stopped_failures"
                save_state(state, state_path)
                info(f"Reached max_consecutive_failures={config['max_consecutive_failures']}; stopping.")
                break

            attempt_number = int(state["current_round"]) + 1
            phase_number = int(state["next_phase_number"])
            phase_doc_relative_path = f"{config['phase_doc_prefix']}{phase_number}.md"
            round_directory = runtime_directory / f"round-{attempt_number:03d}"
            round_directory.mkdir(parents=True, exist_ok=True)

            prompt_path = round_directory / "prompt.md"
            assistant_output_path = round_directory / "assistant-output.json"
            events_log_path = round_directory / "events.jsonl"
            progress_log_path = round_directory / "progress.log"

            rendered_prompt = render_template(
                template_text,
                {
                    "objective": config["objective"],
                    "round_attempt": attempt_number,
                    "next_phase_number": phase_number,
                    "next_phase_doc": phase_doc_relative_path,
                    "current_branch": current_branch,
                    "last_phase_doc": clean_string(state.get("last_phase_doc")),
                    "last_commit_sha": clean_string(state.get("last_commit_sha")),
                    "last_summary": clean_string(state.get("last_summary")),
                    "focus_hint": clean_string(state.get("last_next_focus")),
                    "test_command": config["test_command"],
                    "build_command": config["build_command"],
                    "test_vault_plugin_dir": config.get("test_vault_plugin_dir", ""),
                    "commit_prefix": config["commit_prefix"],
                    "platform_note": config.get("platform_note", ""),
                },
            )
            prompt_path.write_bytes(rendered_prompt.encode("utf-8"))

            if args.dry_run:
                info(f"Dry run complete. Prompt written to {prompt_path}")
                break

            starting_head = get_head_sha()
            info(f"Starting round {attempt_number} (phase {phase_number}).")
            codex_exit_code = invoke_codex_round(
                prompt_path=prompt_path,
                schema_path=schema_path,
                assistant_output_path=assistant_output_path,
                events_log_path=events_log_path,
                progress_log_path=progress_log_path,
                config=config,
            )
            rounds_executed += 1

            result: dict[str, Any] | None = None
            parse_error: str | None = None
            stderr_log_path = events_log_path.with_suffix(".stderr.log")
            if assistant_output_path.exists():
                try:
                    parsed_result = read_json(assistant_output_path)
                    if isinstance(parsed_result, dict):
                        result = parsed_result
                    else:
                        parse_error = "Agent output JSON was not an object."
                except json.JSONDecodeError as exc:
                    parse_error = str(exc)

            ending_head = get_head_sha()
            working_tree_dirty = is_working_tree_dirty()
            failure_reason: str | None = None

            if codex_exit_code != 0:
                stderr_text = stderr_log_path.read_text(encoding="utf-8", errors="replace") if stderr_log_path.exists() else ""
                if "input is not valid UTF-8" in stderr_text:
                    failure_reason = "codex exec could not read the round prompt as UTF-8."
                else:
                    failure_reason = f"codex exec exited with code {codex_exit_code}."
            elif result is None:
                failure_reason = (
                    f"Could not parse agent output JSON: {parse_error}"
                    if parse_error
                    else "Agent output JSON was not created."
                )

            if not failure_reason and result is not None:
                failure_reason = validate_round_result(
                    result=result,
                    schema=schema,
                    phase_doc_relative_path=phase_doc_relative_path,
                    config=config,
                    ending_head=ending_head,
                    working_tree_dirty=working_tree_dirty,
                )

            state["current_round"] = int(state["current_round"]) + 1
            history_entry = build_history_entry(
                attempt_number=attempt_number,
                phase_number=phase_number,
                result=result,
                failure_reason=failure_reason,
            )

            if failure_reason:
                info(f"Round {attempt_number} failed: {failure_reason}")
                if ending_head != starting_head or working_tree_dirty:
                    info(f"Reverting worktree to {starting_head}")
                    reset_worktree_to_head(starting_head)

                state["consecutive_failures"] = int(state["consecutive_failures"]) + 1
                state["last_result"] = "failure"
                state["last_blocking_reason"] = failure_reason
                if result and clean_string(result.get("next_focus")):
                    state["last_next_focus"] = result.get("next_focus")
                append_history_entry(runtime_directory, history_entry)
                save_state(state, state_path)

                if failure_reason == "codex exec could not read the round prompt as UTF-8.":
                    state["status"] = "stopped_infra_error"
                    save_state(state, state_path)
                    info("Stopping after infrastructure error: prompt encoding.")
                    break

                continue

            assert result is not None
            state["consecutive_failures"] = 0
            state["last_result"] = result["status"]
            state["last_blocking_reason"] = None
            state["last_summary"] = result["summary"]

            if clean_string(result.get("next_focus")):
                state["last_next_focus"] = result["next_focus"]
            if clean_string(result.get("phase_doc_path")):
                state["last_phase_doc"] = result["phase_doc_path"]
            if clean_string(result.get("commit_sha")):
                state["last_commit_sha"] = result["commit_sha"]

            if result["status"] == "success":
                state["next_phase_number"] = int(state["next_phase_number"]) + 1
                info(f"Round {attempt_number} succeeded with commit {result['commit_sha']}.")
            elif result["status"] == "goal_complete":
                state["status"] = "complete"
                info("Maintainability objective reported complete.")

            append_history_entry(runtime_directory, history_entry)
            save_state(state, state_path)

    return 0


def print_state_summary(state: dict[str, Any], *, runtime_directory: Path | None = None) -> None:
    print(
        "[status] "
        f"status={state.get('status')} round={state.get('current_round')} "
        f"failures={state.get('consecutive_failures')} next_phase={state.get('next_phase_number')}"
    )
    if state.get("last_phase_doc"):
        print(f"[status] last phase doc: {state.get('last_phase_doc')}")
    if state.get("last_next_focus"):
        print(f"[status] next focus: {state.get('last_next_focus')}")
    if state.get("last_commit_sha"):
        print(f"[status] last commit: {state.get('last_commit_sha')}")
    if runtime_directory:
        lock_path = runtime_directory / LOCK_FILENAME
        lock_data = read_lock(lock_path)
        if lock_data:
            print(
                "[status] lock: "
                f"host={lock_data.get('hostname')} pid={lock_data.get('pid')} "
                f"profile={lock_data.get('profile')} started_at={lock_data.get('started_at')}"
            )
        else:
            print("[status] lock: none")


def run_status(args: argparse.Namespace) -> int:
    state_path = resolve_repo_path(args.state_path)
    if not state_path.exists():
        print(f"[status] state file not found: {state_path}")
        return 1
    state = read_json(state_path)
    print_state_summary(state, runtime_directory=state_path.parent)
    return 0


def latest_round_directory(runtime_directory: Path) -> Path | None:
    round_directories = sorted(path for path in runtime_directory.glob("round-*") if path.is_dir())
    return round_directories[-1] if round_directories else None


def stop_process(pid: int, *, graceful_timeout_seconds: int = 30) -> None:
    if pid <= 0:
        return
    if not pid_exists(pid):
        info(f"Process {pid} already exited.")
        return

    info(f"Stopping process {pid}.")
    if os.name == "nt":
        try:
            os.kill(pid, signal.SIGTERM)
        except OSError:
            pass
        deadline = time.time() + graceful_timeout_seconds
        while time.time() < deadline:
            if not pid_exists(pid):
                info(f"Process {pid} stopped cleanly.")
                return
            time.sleep(1)

        taskkill_result = subprocess.run(
            ["taskkill", "/PID", str(pid), "/T", "/F"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
        )
        if taskkill_result.returncode != 0 and pid_exists(pid):
            combined = "\n".join(part for part in (taskkill_result.stdout, taskkill_result.stderr) if part.strip())
            raise AutopilotError(f"Failed to force-stop pid {pid}: {combined}")
    else:
        os.kill(pid, signal.SIGTERM)
        deadline = time.time() + graceful_timeout_seconds
        while time.time() < deadline:
            if not pid_exists(pid):
                info(f"Process {pid} stopped cleanly.")
                return
            time.sleep(1)

        os.kill(pid, signal.SIGKILL)
        deadline = time.time() + 10
        while time.time() < deadline:
            if not pid_exists(pid):
                info(f"Process {pid} force-stopped.")
                return
            time.sleep(1)

    if pid_exists(pid):
        raise AutopilotError(f"Failed to stop pid {pid}.")


def remove_stale_lock(runtime_directory: Path, *, expected_pid: int | None = None) -> None:
    lock_path = runtime_directory / LOCK_FILENAME
    lock_data = read_lock(lock_path)
    if not lock_data:
        return

    lock_pid_raw = lock_data.get("pid")
    try:
        lock_pid = int(lock_pid_raw)
    except (TypeError, ValueError):
        lock_pid = -1

    if expected_pid is not None and lock_pid not in (-1, expected_pid):
        return

    if lock_pid > 0 and pid_exists(lock_pid):
        raise AutopilotError(f"Refusing to remove active lock owned by pid {lock_pid}.")

    lock_path.unlink(missing_ok=True)
    info(f"Removed stale lock file at {lock_path}.")


def build_restart_start_args(args: argparse.Namespace) -> list[str]:
    restart_profile = clean_string(args.restart_profile) or clean_string(args.profile) or DEFAULT_PROFILE_NAME
    restart_config_path = clean_string(args.restart_config_path) or clean_string(args.config_path) or DEFAULT_CONFIG_PATH
    restart_state_path = clean_string(args.restart_state_path) or clean_string(args.state_path) or DEFAULT_STATE_PATH
    restart_profile_path = clean_string(args.restart_profile_path) or clean_string(args.profile_path)

    start_args = [
        sys.executable,
        str(resolve_repo_path("automation/autopilot.py")),
        "start",
        "--profile",
        restart_profile,
        "--config-path",
        restart_config_path,
        "--state-path",
        restart_state_path,
    ]
    if restart_profile_path:
        start_args.extend(["--profile-path", restart_profile_path])
    return start_args


def spawn_background_autopilot(command_args: list[str], *, output_path: Path, pid_path: Path | None = None) -> int:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_handle = output_path.open("ab")
    popen_kwargs: dict[str, Any] = {
        "args": command_args,
        "cwd": str(REPO_ROOT),
        "stdin": subprocess.DEVNULL,
        "stdout": output_handle,
        "stderr": subprocess.STDOUT,
    }

    if os.name == "nt":
        detached_process = getattr(subprocess, "DETACHED_PROCESS", 0)
        new_process_group = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
        popen_kwargs["creationflags"] = detached_process | new_process_group
    else:
        popen_kwargs["start_new_session"] = True

    try:
        process = subprocess.Popen(**popen_kwargs)
    finally:
        output_handle.close()

    if pid_path:
        pid_path.parent.mkdir(parents=True, exist_ok=True)
        pid_path.write_text(f"{process.pid}\n", encoding="utf-8")
    return int(process.pid)


def run_watch(args: argparse.Namespace) -> int:
    runtime_directory = resolve_repo_path(args.runtime_path)
    state_path = runtime_directory / "maintainability-state.json"
    last_progress_path: Path | None = None
    last_line_count = 0
    shown_initial_state = False

    print(f"[watch] runtime: {runtime_directory}")
    while True:
        if not shown_initial_state:
            if state_path.exists():
                print_state_summary(read_json(state_path))
            else:
                print(f"[watch] state file not created yet: {state_path}")
            shown_initial_state = True

        newest_round_directory = latest_round_directory(runtime_directory)
        if newest_round_directory is not None:
            progress_path = newest_round_directory / "progress.log"
            if progress_path != last_progress_path:
                last_progress_path = progress_path
                last_line_count = 0
                print()
                print(f"[watch] now watching {progress_path}")
                if progress_path.exists():
                    existing_lines = progress_path.read_text(encoding="utf-8", errors="replace").splitlines()
                    if existing_lines:
                        tail_lines = existing_lines[-args.tail :]
                        for line in tail_lines:
                            print(line)
                        last_line_count = len(existing_lines)

            if last_progress_path and last_progress_path.exists():
                current_lines = last_progress_path.read_text(encoding="utf-8", errors="replace").splitlines()
                if len(current_lines) > last_line_count:
                    for line in current_lines[last_line_count:]:
                        print(line)
                    last_line_count = len(current_lines)

        if args.once:
            break
        time.sleep(args.refresh_seconds)
    return 0


def run_restart_after_next_commit(args: argparse.Namespace) -> int:
    state_path = resolve_repo_path(args.state_path)
    runtime_directory = state_path.parent
    if not state_path.exists():
        raise AutopilotError(f"State file not found: {state_path}")

    state = read_json(state_path)
    target_commit_sha = clean_string(state.get("last_commit_sha"))
    if not target_commit_sha:
        raise AutopilotError("State file does not have last_commit_sha; nothing to watch yet.")

    lock_path = runtime_directory / LOCK_FILENAME
    lock_data = read_lock(lock_path)
    current_pid = -1
    if lock_data:
        try:
            current_pid = int(lock_data.get("pid", -1))
        except (TypeError, ValueError):
            current_pid = -1

    info(
        "Watching for the next successful commit after "
        f"{target_commit_sha} (current pid {current_pid if current_pid > 0 else 'unknown'})."
    )

    refresh_seconds = max(1, int(args.refresh_seconds))
    while True:
        time.sleep(refresh_seconds)
        state = read_json(state_path)
        latest_commit_sha = clean_string(state.get("last_commit_sha"))
        current_round = state.get("current_round")
        current_status = clean_string(state.get("status"))

        if latest_commit_sha and latest_commit_sha != target_commit_sha:
            info(
                "Detected new commit "
                f"{latest_commit_sha} at round {current_round} with status {current_status or '<empty>'}."
            )
            break

        if current_status and current_status != "active" and args.stop_if_status_changes:
            raise AutopilotError(f"State changed to '{current_status}' before a new commit was detected.")

    if current_pid > 0:
        stop_process(current_pid, graceful_timeout_seconds=max(1, int(args.stop_timeout_seconds)))
    else:
        info("No active pid was captured from the lock file; skipping process stop step.")

    remove_stale_lock(runtime_directory, expected_pid=current_pid if current_pid > 0 else None)

    if args.hard_reset:
        run_git_no_capture(["reset", "--hard", "HEAD"], check=True)

    restart_args = build_restart_start_args(args)
    restart_output_path = resolve_repo_path(args.restart_output_path)
    restart_pid_path = resolve_repo_path(args.restart_pid_path) if clean_string(args.restart_pid_path) else None
    new_pid = spawn_background_autopilot(restart_args, output_path=restart_output_path, pid_path=restart_pid_path)
    info(f"Started replacement autopilot pid {new_pid}.")
    return 0


def run_doctor(args: argparse.Namespace) -> int:
    config, config_path, profile_path = load_config(args.config_path, args.profile, args.profile_path)
    failures = 0

    print(f"[doctor] repo: {REPO_ROOT}")
    print(f"[doctor] config: {config_path}")
    print(f"[doctor] profile: {profile_path}")

    for command_name in ("git", "node", "npm", "codex"):
        resolved = shutil.which(command_name)
        if resolved:
            print(f"[doctor] ok   command {command_name}: {resolved}")
        else:
            print(f"[doctor] fail command {command_name}: not found in PATH")
            failures += 1

    test_vault_plugin_dir = clean_string(config.get("test_vault_plugin_dir"))
    if test_vault_plugin_dir and Path(test_vault_plugin_dir).exists():
        print(f"[doctor] ok   test vault path: {test_vault_plugin_dir}")
    else:
        print(f"[doctor] fail test vault path: {test_vault_plugin_dir or '<empty>'}")
        failures += 1

    branch_name = get_current_branch()
    allowed_prefixes = list(config.get("allowed_branch_prefixes", []))
    if test_branch_allowed(branch_name, allowed_prefixes):
        print(f"[doctor] ok   branch '{branch_name}' matches allowed prefixes")
    else:
        print(f"[doctor] fail branch '{branch_name}' does not match allowed prefixes: {', '.join(allowed_prefixes)}")
        failures += 1

    if is_working_tree_dirty():
        print("[doctor] fail working tree is dirty")
        failures += 1
    else:
        print("[doctor] ok   working tree is clean")

    runtime_directory = resolve_repo_path(args.runtime_path)
    print(f"[doctor] info runtime directory: {runtime_directory}")
    lock_path = runtime_directory / LOCK_FILENAME
    lock_data = read_lock(lock_path)
    if lock_data:
        print(
            "[doctor] warn lock present: "
            f"host={lock_data.get('hostname')} pid={lock_data.get('pid')} profile={lock_data.get('profile')}"
        )
    else:
        print("[doctor] ok   no autopilot lock present")

    return 1 if failures else 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Cross-platform maintainability autopilot.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    start_parser = subparsers.add_parser("start", help="Run unattended maintainability rounds.")
    start_parser.add_argument("--profile", default=DEFAULT_PROFILE_NAME, help="Profile name under automation/profiles.")
    start_parser.add_argument("--profile-path", help="Explicit profile JSON path.")
    start_parser.add_argument("--config-path", default=DEFAULT_CONFIG_PATH, help="Base config JSON path.")
    start_parser.add_argument("--state-path", default=DEFAULT_STATE_PATH, help="State JSON path.")
    start_parser.add_argument("--max-rounds-this-run", type=int, default=0, help="Limit rounds for this process only.")
    start_parser.add_argument("--single-round", action="store_true", help="Run exactly one unattended round.")
    start_parser.add_argument("--dry-run", action="store_true", help="Render the next prompt only.")
    start_parser.add_argument("--no-branch-guard", action="store_true", help="Skip allowed-branch validation.")
    start_parser.add_argument("--allow-dirty-worktree", action="store_true", help="Skip clean-worktree validation.")
    start_parser.add_argument("--force-lock", action="store_true", help="Override an existing autopilot lock.")
    start_parser.set_defaults(handler=run_start)

    watch_parser = subparsers.add_parser("watch", help="Watch the latest round progress log.")
    watch_parser.add_argument("--runtime-path", default=DEFAULT_RUNTIME_PATH, help="Runtime directory path.")
    watch_parser.add_argument("--tail", type=int, default=20, help="How many lines to show when switching logs.")
    watch_parser.add_argument("--refresh-seconds", type=int, default=2, help="Polling interval.")
    watch_parser.add_argument("--once", action="store_true", help="Print current status once and exit.")
    watch_parser.set_defaults(handler=run_watch)

    status_parser = subparsers.add_parser("status", help="Show current autopilot state.")
    status_parser.add_argument("--state-path", default=DEFAULT_STATE_PATH, help="State JSON path.")
    status_parser.set_defaults(handler=run_status)

    doctor_parser = subparsers.add_parser("doctor", help="Check environment and profile readiness.")
    doctor_parser.add_argument("--profile", default=DEFAULT_PROFILE_NAME, help="Profile name under automation/profiles.")
    doctor_parser.add_argument("--profile-path", help="Explicit profile JSON path.")
    doctor_parser.add_argument("--config-path", default=DEFAULT_CONFIG_PATH, help="Base config JSON path.")
    doctor_parser.add_argument("--runtime-path", default=DEFAULT_RUNTIME_PATH, help="Runtime directory path.")
    doctor_parser.set_defaults(handler=run_doctor)

    restart_parser = subparsers.add_parser(
        "restart-after-next-commit",
        help="Wait for the next successful commit, then restart autopilot with replacement settings.",
    )
    restart_parser.add_argument("--profile", default=DEFAULT_PROFILE_NAME, help="Current profile name under automation/profiles.")
    restart_parser.add_argument("--profile-path", help="Current explicit profile JSON path.")
    restart_parser.add_argument("--config-path", default=DEFAULT_CONFIG_PATH, help="Current base config JSON path.")
    restart_parser.add_argument("--state-path", default=DEFAULT_STATE_PATH, help="State JSON path to watch.")
    restart_parser.add_argument("--restart-profile", help="Profile name to use for the replacement start command.")
    restart_parser.add_argument("--restart-profile-path", help="Explicit profile JSON path for the replacement start command.")
    restart_parser.add_argument("--restart-config-path", help="Config JSON path for the replacement start command.")
    restart_parser.add_argument("--restart-state-path", help="State JSON path for the replacement start command.")
    restart_parser.add_argument(
        "--restart-output-path",
        default="automation/runtime/autopilot-restart.out",
        help="Where to write the replacement autopilot stdout/stderr stream.",
    )
    restart_parser.add_argument(
        "--restart-pid-path",
        default="automation/runtime/autopilot.pid",
        help="Where to write the replacement autopilot pid.",
    )
    restart_parser.add_argument("--refresh-seconds", type=int, default=5, help="Polling interval while waiting.")
    restart_parser.add_argument(
        "--stop-timeout-seconds",
        type=int,
        default=30,
        help="How long to wait for the current autopilot to stop before forcing it.",
    )
    restart_parser.add_argument(
        "--hard-reset",
        action="store_true",
        default=True,
        help="Run `git reset --hard HEAD` before launching the replacement process.",
    )
    restart_parser.add_argument(
        "--no-hard-reset",
        dest="hard_reset",
        action="store_false",
        help="Skip `git reset --hard HEAD` before relaunching.",
    )
    restart_parser.add_argument(
        "--stop-if-status-changes",
        action="store_true",
        help="Abort instead of waiting forever if the watched state leaves `active` before a new commit appears.",
    )
    restart_parser.set_defaults(handler=run_restart_after_next_commit)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        return int(args.handler(args))
    except KeyboardInterrupt:
        info("Interrupted.")
        return 130
    except AutopilotError as exc:
        print(f"[autopilot] ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
