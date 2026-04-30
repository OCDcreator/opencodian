import unittest
import json
import tempfile
from pathlib import Path
from types import SimpleNamespace

from automation._autopilot.validation import (
    path_matches_any,
    test_command_budget_exceeded,
    test_deploy_required,
    test_full_test_required,
    test_runs_include_full_test,
    test_runs_include_targeted_tests,
)
from automation import autopilot
from automation._autopilot.bootstrap_runtime import BootstrapRuntimeSupport, run_bootstrap_and_daemonize


class AutopilotPolicyTests(unittest.TestCase):
    def test_path_matches_any_supports_files_and_directories(self) -> None:
        configured = ["src/main.ts", "src/core/", "assets/"]
        self.assertTrue(path_matches_any("src/main.ts", configured))
        self.assertTrue(path_matches_any("src/core/opencode/OpenCodeService.ts", configured))
        self.assertTrue(path_matches_any("assets/icon.png", configured))
        self.assertFalse(path_matches_any("src/features/chat/OpenCodianView.ts", configured))

    def test_full_test_required_for_cadence_or_risky_paths(self) -> None:
        config = {
            "full_test_cadence_rounds": 5,
            "full_test_required_paths": ["src/main.ts", "src/core/", "automation/"],
        }
        self.assertTrue(test_full_test_required(["src/features/chat/OpenCodianView.ts"], 10, config))
        self.assertTrue(test_full_test_required(["src/core/opencode/OpenCodeService.ts"], 1, config))
        self.assertFalse(test_full_test_required(["src/features/chat/OpenCodianView.ts"], 1, config))

    def test_deploy_required_only_for_targeted_paths(self) -> None:
        config = {
            "deploy_policy": "targeted",
            "deploy_required_paths": ["src/main.ts", "manifest.json", "styles.css", "assets/", "src/style/"],
        }
        self.assertTrue(test_deploy_required(["manifest.json"], config, clean_string=autopilot.clean_string))
        self.assertTrue(test_deploy_required(["src/style/theme.css"], config, clean_string=autopilot.clean_string))
        self.assertFalse(
            test_deploy_required(["src/features/chat/OpenCodianView.ts"], config, clean_string=autopilot.clean_string)
        )

    def test_command_budget_counts_occurrences(self) -> None:
        config = {
            "max_git_status_per_round": 2,
            "max_git_diff_stat_per_round": 1,
        }
        commands_run = [
            "git status --short",
            "git status --short && git rev-parse HEAD",
            "git diff --stat",
            "git diff --stat -- docs/a.md && git diff --stat -- docs/b.md",
        ]
        errors = test_command_budget_exceeded(commands_run, config)
        self.assertEqual(1, len(errors))

    def test_test_run_detection_distinguishes_targeted_and_full(self) -> None:
        config = {
            "test_command": "npm test",
            "full_test_command": "npm test",
            "targeted_test_prefixes": ["npm test --", "npm run test --"],
        }
        tests_run = [
            "npm test -- SessionTodoHostAdapter",
            "npm test",
        ]
        self.assertTrue(test_runs_include_targeted_tests(tests_run, config, clean_string=autopilot.clean_string))
        self.assertTrue(test_runs_include_full_test(tests_run, config, clean_string=autopilot.clean_string))


class RestartParserTests(unittest.TestCase):
    def test_restart_parser_accepts_sync_arguments(self) -> None:
        parser = autopilot.build_parser()
        args = parser.parse_args(
            [
                "restart-after-next-commit",
                "--restart-sync-ref",
                "origin/automation/maintainability-cutover",
                "--restart-sync-timeout-seconds",
                "60",
                "--restart-sync-refresh-seconds",
                "3",
            ]
        )
        self.assertEqual("origin/automation/maintainability-cutover", args.restart_sync_ref)
        self.assertEqual(60, args.restart_sync_timeout_seconds)
        self.assertEqual(3, args.restart_sync_refresh_seconds)


class BootstrapRuntimeTests(unittest.TestCase):
    def test_bootstrap_injects_fail_on_round_failure_default(self) -> None:
        captured: dict[str, object] = {}
        with tempfile.TemporaryDirectory() as tmpdir:
            repo_root = Path(tmpdir)
            state_path = repo_root / "automation/runtime/autopilot-state.json"
            state_path.parent.mkdir(parents=True, exist_ok=True)
            state_path.write_text(
                json.dumps({"status": "stopped_failures", "last_commit_sha": "abc123"}, ensure_ascii=False),
                encoding="utf-8",
            )

            def fake_run_start(namespace: object) -> int:
                captured["namespace"] = namespace
                return 0

            support = BootstrapRuntimeSupport(
                error_type=RuntimeError,
                clean_string=autopilot.clean_string,
                info=lambda *_args, **_kwargs: None,
                read_json=lambda path: json.loads(Path(path).read_text(encoding="utf-8")),
                resolve_repo_path=lambda relative: repo_root / relative,
                run_start=fake_run_start,
                spawn_background_autopilot=lambda *_args, **_kwargs: 999,
            )
            args = SimpleNamespace(
                profile="mac",
                profile_path="",
                config_path="automation/autopilot-config.json",
                state_path="automation/runtime/autopilot-state.json",
                no_branch_guard=False,
                allow_dirty_worktree=False,
                force_lock=False,
                daemon_output_path="automation/runtime/autopilot.out",
                daemon_pid_path="automation/runtime/autopilot.pid",
            )

            result = run_bootstrap_and_daemonize(args, support=support)

        self.assertEqual(0, result)
        namespace = captured["namespace"]
        self.assertFalse(getattr(namespace, "fail_on_round_failure"))
        self.assertTrue(getattr(namespace, "single_round"))
        self.assertEqual(0, getattr(namespace, "max_rounds_this_run"))
        self.assertFalse(getattr(namespace, "dry_run"))


class RoundResultSchemaTests(unittest.TestCase):
    def test_round_result_schema_requires_every_property_for_codex_output(self) -> None:
        schema = json.loads(Path("automation/round-result.schema.json").read_text(encoding="utf-8"))
        property_names = set(schema.get("properties", {}).keys())
        required_names = set(schema.get("required", []))
        self.assertEqual(set(), property_names - required_names)


if __name__ == "__main__":
    unittest.main()
