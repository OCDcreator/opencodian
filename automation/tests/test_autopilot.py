import unittest
import json
from pathlib import Path

from _autopilot.validation import (
    path_matches_any,
    test_command_budget_exceeded,
    test_deploy_required,
    test_full_test_required,
    test_runs_include_full_test,
    test_runs_include_targeted_tests,
)
from automation import autopilot


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


class RoundResultSchemaTests(unittest.TestCase):
    def test_round_result_schema_requires_every_property_for_codex_output(self) -> None:
        schema = json.loads(Path("automation/round-result.schema.json").read_text(encoding="utf-8"))
        property_names = set(schema.get("properties", {}).keys())
        required_names = set(schema.get("required", []))
        self.assertEqual(set(), property_names - required_names)


if __name__ == "__main__":
    unittest.main()
