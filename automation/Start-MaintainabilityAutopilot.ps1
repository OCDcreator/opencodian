[CmdletBinding()]
param(
    [string]$ConfigPath = "automation/maintainability-config.json",
    [string]$StatePath = "automation/runtime/maintainability-state.json",
    [int]$MaxRoundsThisRun = 0,
    [switch]$SingleRound,
    [switch]$DryRun,
    [switch]$NoBranchGuard,
    [switch]$AllowDirtyWorktree
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-AutopilotInfo {
    param([string]$Message)
    Write-Host "[autopilot] $Message"
}

function Write-AutopilotProgress {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ProgressLogPath,
        [Parameter(Mandatory = $true)]
        [string]$Message,
        [string]$Channel = "codex"
    )

    $line = "[{0}] [{1}] {2}" -f (Get-Date).ToString("HH:mm:ss"), $Channel, $Message
    [System.IO.File]::AppendAllText($ProgressLogPath, $line + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))
    Write-Host $line
}

function Get-CompactText {
    param(
        [string]$Text,
        [int]$MaxLength = 180
    )

    if ([string]::IsNullOrWhiteSpace($Text)) {
        return ""
    }

    $singleLine = ($Text -replace '\s+', ' ').Trim()
    if ($singleLine.Length -le $MaxLength) {
        return $singleLine
    }

    return $singleLine.Substring(0, $MaxLength - 3) + "..."
}

function Get-CodexItemSummary {
    param(
        [Parameter(Mandatory = $true)]
        $Item,
        [Parameter(Mandatory = $true)]
        [string]$EventType
    )

    $itemType = Get-CleanString -Value $Item.type
    switch ($itemType) {
        "agent_message" {
            if ($EventType -eq "item.completed") {
                $messageText = Get-CompactText -Text ([string]$Item.text) -MaxLength 220
                if (-not [string]::IsNullOrWhiteSpace($messageText)) {
                    return "Agent: $messageText"
                }
            }
        }
        "command_execution" {
            $commandText = Get-CompactText -Text ([string]$Item.command) -MaxLength 200
            if ($EventType -eq "item.started") {
                return "Running command: $commandText"
            }

            $exitCode = if ($null -eq $Item.exit_code) { "?" } else { [string]$Item.exit_code }
            return "Command finished (exit $exitCode): $commandText"
        }
        default {
            if (-not [string]::IsNullOrWhiteSpace($itemType)) {
                return "{0}: {1}" -f $EventType, $itemType
            }
        }
    }

    return $null
}

function Get-CodexEventSummary {
    param(
        [Parameter(Mandatory = $true)]
        [string]$JsonLine
    )

    $eventRecord = $null
    try {
        $eventRecord = $JsonLine | ConvertFrom-Json -ErrorAction Stop
    }
    catch {
        return "Raw output: $(Get-CompactText -Text $JsonLine -MaxLength 220)"
    }

    $eventType = Get-CleanString -Value $eventRecord.type
    switch ($eventType) {
        "thread.started" {
            return "Session started: $($eventRecord.thread_id)"
        }
        "turn.started" {
            return "Turn started"
        }
        "turn.completed" {
            if ($null -ne $eventRecord.usage) {
                return "Turn completed (input $($eventRecord.usage.input_tokens), output $($eventRecord.usage.output_tokens))"
            }

            return "Turn completed"
        }
        "item.started" {
            return Get-CodexItemSummary -Item $eventRecord.item -EventType $eventType
        }
        "item.completed" {
            return Get-CodexItemSummary -Item $eventRecord.item -EventType $eventType
        }
        default {
            if (-not [string]::IsNullOrWhiteSpace($eventType)) {
                return "Event: $eventType"
            }
        }
    }

    return $null
}

function Resolve-RepoPath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$PathValue
    )

    if ([System.IO.Path]::IsPathRooted($PathValue)) {
        return [System.IO.Path]::GetFullPath($PathValue)
    }

    return [System.IO.Path]::GetFullPath((Join-Path $script:RepoRoot $PathValue))
}

function Read-JsonFile {
    param(
        [Parameter(Mandatory = $true)]
        [string]$PathValue
    )

    return Get-Content -Path $PathValue -Raw -Encoding UTF8 | ConvertFrom-Json
}

function Write-JsonFile {
    param(
        [Parameter(Mandatory = $true)]
        $Value,
        [Parameter(Mandatory = $true)]
        [string]$PathValue
    )

    $directoryPath = Split-Path -Path $PathValue -Parent
    if ($directoryPath -and -not (Test-Path $directoryPath)) {
        New-Item -ItemType Directory -Force -Path $directoryPath | Out-Null
    }

    $Value | ConvertTo-Json -Depth 100 | Set-Content -Path $PathValue -Encoding UTF8
}

function Invoke-Git {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Args
    )

    $nativePrefExists = $null -ne (Get-Variable -Name PSNativeCommandUseErrorActionPreference -Scope Global -ErrorAction SilentlyContinue)
    if ($nativePrefExists) {
        $previousNativePref = $global:PSNativeCommandUseErrorActionPreference
        $global:PSNativeCommandUseErrorActionPreference = $false
    }

    try {
        $output = & git -C $script:RepoRoot @Args 2>&1
    }
    finally {
        if ($nativePrefExists) {
            $global:PSNativeCommandUseErrorActionPreference = $previousNativePref
        }
    }

    if ($LASTEXITCODE -ne 0) {
        throw "git $($Args -join ' ') failed: $($output | Out-String)"
    }

    return ($output | Out-String).Trim()
}

function Get-OptionalGitOutput {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Args
    )

    $nativePrefExists = $null -ne (Get-Variable -Name PSNativeCommandUseErrorActionPreference -Scope Global -ErrorAction SilentlyContinue)
    if ($nativePrefExists) {
        $previousNativePref = $global:PSNativeCommandUseErrorActionPreference
        $global:PSNativeCommandUseErrorActionPreference = $false
    }

    try {
        $output = & git -C $script:RepoRoot @Args 2>&1
    }
    finally {
        if ($nativePrefExists) {
            $global:PSNativeCommandUseErrorActionPreference = $previousNativePref
        }
    }

    if ($LASTEXITCODE -ne 0) {
        return $null
    }

    return ($output | Out-String).Trim()
}

function Get-CleanString {
    param($Value)

    if ($null -eq $Value) {
        return ""
    }

    return ([string]$Value).Trim()
}

function New-State {
    param(
        [Parameter(Mandatory = $true)]
        $Config
    )

    $timestamp = (Get-Date).ToString("s")
    return [pscustomobject]@{
        status                 = "active"
        current_round          = 0
        consecutive_failures   = 0
        next_phase_number      = [int]$Config.next_phase_number
        last_phase_doc         = [string]$Config.starting_phase_doc
        last_commit_sha        = $null
        last_summary           = $null
        last_next_focus        = [string]$Config.focus_hint
        last_result            = $null
        last_blocking_reason   = $null
        started_at             = $timestamp
        updated_at             = $timestamp
    }
}

function Save-State {
    param(
        [Parameter(Mandatory = $true)]
        $State,
        [Parameter(Mandatory = $true)]
        [string]$PathValue
    )

    $State.updated_at = (Get-Date).ToString("s")
    Write-JsonFile -Value $State -PathValue $PathValue
}

function Resume-StateIfThresholdAllows {
    param(
        [Parameter(Mandatory = $true)]
        $State,
        [Parameter(Mandatory = $true)]
        $Config,
        [Parameter(Mandatory = $true)]
        [string]$StatePathValue
    )

    $previousStatus = Get-CleanString -Value $State.status
    $shouldResume = $false

    switch ($previousStatus) {
        "stopped_max_rounds" {
            $shouldResume = [int]$State.current_round -lt [int]$Config.max_rounds
        }
        "stopped_failures" {
            $shouldResume = [int]$State.consecutive_failures -lt [int]$Config.max_consecutive_failures
        }
    }

    if (-not $shouldResume) {
        return $State
    }

    $State.status = "active"
    Save-State -State $State -PathValue $StatePathValue
    Write-AutopilotInfo "State status '$previousStatus' is resumable with current config; resuming."
    return $State
}

function Append-HistoryEntry {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RuntimeDirectory,
        [Parameter(Mandatory = $true)]
        $Entry
    )

    $historyPath = Join-Path $RuntimeDirectory "history.jsonl"
    $Entry | ConvertTo-Json -Depth 30 -Compress | Add-Content -Path $historyPath -Encoding UTF8
}

function Test-BranchAllowed {
    param(
        [Parameter(Mandatory = $true)]
        [string]$BranchName,
        [Parameter(Mandatory = $true)]
        [object[]]$AllowedPrefixes
    )

    foreach ($prefix in $AllowedPrefixes) {
        if ($BranchName.StartsWith([string]$prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
            return $true
        }
    }

    return $false
}

function Get-WorkingTreeDirty {
    $status = Invoke-Git -Args @("status", "--porcelain")
    return -not [string]::IsNullOrWhiteSpace($status)
}

function Render-Template {
    param(
        [Parameter(Mandatory = $true)]
        [string]$TemplateText,
        [Parameter(Mandatory = $true)]
        [hashtable]$Tokens
    )

    $rendered = $TemplateText
    foreach ($tokenKey in $Tokens.Keys) {
        $tokenValue = Get-CleanString -Value $Tokens[$tokenKey]
        $rendered = $rendered.Replace("{{${tokenKey}}}", $tokenValue)
    }

    return $rendered
}

function Reset-WorktreeToHead {
    param(
        [Parameter(Mandatory = $true)]
        [string]$HeadSha
    )

    Invoke-Git -Args @("reset", "--hard", $HeadSha) | Out-Null
    Invoke-Git -Args @("clean", "-fd") | Out-Null
}

function Get-CommitFiles {
    param(
        [Parameter(Mandatory = $true)]
        [string]$CommitSha
    )

    $output = Invoke-Git -Args @("diff-tree", "--no-commit-id", "--name-only", "-r", $CommitSha)
    if ([string]::IsNullOrWhiteSpace($output)) {
        return @()
    }

    return @($output -split "`r?`n" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
}

function Test-BuildRequired {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Files
    )

    foreach ($filePath in $Files) {
        if ($filePath -match "^(src/|assets/|styles\\.css$|manifest\\.json$|package\\.json$|esbuild\\.config\\.mjs$|scripts/)") {
            return $true
        }

        if ($filePath -match "\\.(ts|tsx|js|mjs|cjs|css)$" -and $filePath -notmatch "^(tests/|docs/|automation/)") {
            return $true
        }
    }

    return $false
}

function Test-DeployedBuildId {
    param(
        [Parameter(Mandatory = $true)]
        [string]$PluginDirectory,
        [Parameter(Mandatory = $true)]
        [string]$BuildId
    )

    $deployedMainPath = Join-Path $PluginDirectory "main.js"
    if (-not (Test-Path $deployedMainPath)) {
        return $false
    }

    return [bool](Select-String -Path $deployedMainPath -Pattern $BuildId -SimpleMatch -Quiet)
}

function Invoke-CodexRound {
    param(
        [Parameter(Mandatory = $true)]
        [string]$PromptPathValue,
        [Parameter(Mandatory = $true)]
        [string]$SchemaPathValue,
        [Parameter(Mandatory = $true)]
        [string]$AssistantOutputPath,
        [Parameter(Mandatory = $true)]
        [string]$EventsLogPath,
        [Parameter(Mandatory = $true)]
        [string]$ProgressLogPath,
        [Parameter(Mandatory = $true)]
        $Config
    )

    $promptText = Get-Content -Path $PromptPathValue -Raw -Encoding UTF8
    $codexCommand = Get-Command "codex.cmd" -ErrorAction SilentlyContinue
    $codexExecutable = if ($codexCommand) { $codexCommand.Source } else { "codex" }
    $codexArgs = @(
        "exec",
        "-C", $script:RepoRoot,
        "--dangerously-bypass-approvals-and-sandbox",
        "--json",
        "--color", "never",
        "--output-schema", $SchemaPathValue,
        "-o", $AssistantOutputPath
    )

    $modelName = Get-CleanString -Value $Config.codex_model
    if (-not [string]::IsNullOrWhiteSpace($modelName)) {
        $codexArgs += @("-m", $modelName)
    }

    $testVaultDirectory = Get-CleanString -Value $Config.test_vault_plugin_dir
    if (-not [string]::IsNullOrWhiteSpace($testVaultDirectory)) {
        $codexArgs += @("--add-dir", $testVaultDirectory)
    }

    $codexArgs += "-"

    $stderrLogPath = [System.IO.Path]::ChangeExtension($EventsLogPath, ".stderr.log")
    foreach ($logPath in @($EventsLogPath, $ProgressLogPath, $stderrLogPath)) {
        if (Test-Path $logPath) {
            Remove-Item -LiteralPath $logPath -Force
        }

        New-Item -ItemType File -Path $logPath -Force | Out-Null
    }

    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = $codexExecutable
    $startInfo.WorkingDirectory = $script:RepoRoot
    $startInfo.UseShellExecute = $false
    $startInfo.RedirectStandardInput = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
    foreach ($encodingProperty in @("StandardInputEncoding", "StandardOutputEncoding", "StandardErrorEncoding")) {
        $propertyInfo = $startInfo.GetType().GetProperty($encodingProperty)
        if ($null -ne $propertyInfo) {
            $propertyInfo.SetValue($startInfo, $utf8NoBom)
        }
    }
    $quotedArgs = foreach ($arg in $codexArgs) {
        $argText = [string]$arg
        if ($argText -match '[\s"]') {
            $escapedArg = $argText -replace '(\\*)"', '$1$1\"'
            $escapedArg = $escapedArg -replace '(\\+)$', '$1$1'
            '"' + $escapedArg + '"'
        }
        else {
            $argText
        }
    }
    $startInfo.Arguments = ($quotedArgs -join " ")

    $process = [System.Diagnostics.Process]::Start($startInfo)
    $stderrTask = $process.StandardError.ReadToEndAsync()
    $stdinBytes = $utf8NoBom.GetBytes($promptText)
    $process.StandardInput.BaseStream.Write($stdinBytes, 0, $stdinBytes.Length)
    $process.StandardInput.BaseStream.Flush()
    $process.StandardInput.Close()

    while (-not $process.StandardOutput.EndOfStream) {
        $stdoutLine = $process.StandardOutput.ReadLine()
        if ($null -eq $stdoutLine) {
            continue
        }

        Add-Content -Path $EventsLogPath -Value $stdoutLine -Encoding UTF8
        $summary = Get-CodexEventSummary -JsonLine $stdoutLine
        if (-not [string]::IsNullOrWhiteSpace($summary)) {
            Write-AutopilotProgress -ProgressLogPath $ProgressLogPath -Message $summary
        }
    }

    $process.WaitForExit()
    $stderr = $stderrTask.GetAwaiter().GetResult()

    if (-not [string]::IsNullOrWhiteSpace($stderr)) {
        Set-Content -Path $stderrLogPath -Value $stderr -Encoding UTF8
        foreach ($stderrLine in ($stderr -split "`r?`n")) {
            if (-not [string]::IsNullOrWhiteSpace($stderrLine)) {
                Write-AutopilotProgress -ProgressLogPath $ProgressLogPath -Message (Get-CompactText -Text $stderrLine -MaxLength 220) -Channel "stderr"
            }
        }
    }

    return $process.ExitCode
}

$script:RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$configFullPath = Resolve-RepoPath -PathValue $ConfigPath
$stateFullPath = Resolve-RepoPath -PathValue $StatePath
$config = Read-JsonFile -PathValue $configFullPath
$runtimeDirectory = Split-Path -Path $stateFullPath -Parent
$templatePath = Resolve-RepoPath -PathValue ([string]$config.prompt_template)
$schemaPath = Resolve-RepoPath -PathValue ([string]$config.result_schema)

if (-not (Get-Command codex -ErrorAction SilentlyContinue)) {
    throw "codex CLI was not found in PATH."
}

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw "git was not found in PATH."
}

if (-not (Test-Path $runtimeDirectory)) {
    New-Item -ItemType Directory -Force -Path $runtimeDirectory | Out-Null
}

$state = if (Test-Path $stateFullPath) {
    Read-JsonFile -PathValue $stateFullPath
}
else {
    $initialState = New-State -Config $config
    Save-State -State $initialState -PathValue $stateFullPath
    $initialState
}

$state = Resume-StateIfThresholdAllows -State $state -Config $config -StatePathValue $stateFullPath

$currentBranch = Invoke-Git -Args @("branch", "--show-current")
if (-not $NoBranchGuard -and -not (Test-BranchAllowed -BranchName $currentBranch -AllowedPrefixes @($config.allowed_branch_prefixes))) {
    throw "Refusing to run on branch '$currentBranch'. Use a dedicated worktree branch with one of these prefixes: $(@($config.allowed_branch_prefixes) -join ', ')."
}

if (-not $AllowDirtyWorktree -and (Get-WorkingTreeDirty)) {
    throw "Working tree must be clean before unattended execution."
}

$roundsExecuted = 0
$templateText = Get-Content -Path $templatePath -Raw -Encoding UTF8

while ($true) {
    if ($SingleRound -and $roundsExecuted -ge 1) {
        Write-AutopilotInfo "Single round requested; stopping."
        break
    }

    if ($MaxRoundsThisRun -gt 0 -and $roundsExecuted -ge $MaxRoundsThisRun) {
        Write-AutopilotInfo "Reached MaxRoundsThisRun=$MaxRoundsThisRun; stopping."
        break
    }

    if ($state.status -ne "active") {
        Write-AutopilotInfo "State status is '$($state.status)'; stopping."
        break
    }

    if ([int]$state.current_round -ge [int]$config.max_rounds) {
        $state.status = "stopped_max_rounds"
        Save-State -State $state -PathValue $stateFullPath
        Write-AutopilotInfo "Reached max_rounds=$($config.max_rounds); stopping."
        break
    }

    if ([int]$state.consecutive_failures -ge [int]$config.max_consecutive_failures) {
        $state.status = "stopped_failures"
        Save-State -State $state -PathValue $stateFullPath
        Write-AutopilotInfo "Reached max_consecutive_failures=$($config.max_consecutive_failures); stopping."
        break
    }

    $attemptNumber = [int]$state.current_round + 1
    $phaseNumber = [int]$state.next_phase_number
    $phaseDocRelativePath = "{0}{1}.md" -f ([string]$config.phase_doc_prefix), $phaseNumber
    $roundDirectory = Join-Path $runtimeDirectory ("round-{0:D3}" -f $attemptNumber)
    New-Item -ItemType Directory -Force -Path $roundDirectory | Out-Null

    $promptPathValue = Join-Path $roundDirectory "prompt.md"
    $assistantOutputPath = Join-Path $roundDirectory "assistant-output.json"
    $eventsLogPath = Join-Path $roundDirectory "events.jsonl"
    $progressLogPath = Join-Path $roundDirectory "progress.log"
    $renderedPrompt = Render-Template -TemplateText $templateText -Tokens @{
        objective         = [string]$config.objective
        round_attempt     = $attemptNumber
        next_phase_number = $phaseNumber
        next_phase_doc    = $phaseDocRelativePath
        current_branch    = $currentBranch
        last_phase_doc    = Get-CleanString -Value $state.last_phase_doc
        last_commit_sha   = Get-CleanString -Value $state.last_commit_sha
        last_summary      = Get-CleanString -Value $state.last_summary
        focus_hint        = Get-CleanString -Value $state.last_next_focus
        test_command      = [string]$config.test_command
        build_command     = [string]$config.build_command
        test_vault_plugin_dir = [string]$config.test_vault_plugin_dir
        platform_note     = Get-CleanString -Value $config.platform_note
        commit_prefix     = [string]$config.commit_prefix
    }

    [System.IO.File]::WriteAllText($promptPathValue, $renderedPrompt, [System.Text.UTF8Encoding]::new($false))
    if ($DryRun) {
        Write-AutopilotInfo "Dry run complete. Prompt written to $promptPathValue"
        break
    }

    $startingHead = Invoke-Git -Args @("rev-parse", "HEAD")
    Write-AutopilotInfo "Starting round $attemptNumber (phase $phaseNumber)."
    $codexExitCode = Invoke-CodexRound -PromptPathValue $promptPathValue -SchemaPathValue $schemaPath -AssistantOutputPath $assistantOutputPath -EventsLogPath $eventsLogPath -ProgressLogPath $progressLogPath -Config $config
    $roundsExecuted++

    $stderrLogPath = [System.IO.Path]::ChangeExtension($eventsLogPath, ".stderr.log")
    $result = $null
    $parseError = $null
    if (Test-Path $assistantOutputPath) {
        try {
            $result = Read-JsonFile -PathValue $assistantOutputPath
        }
        catch {
            $parseError = $_.Exception.Message
        }
    }

    $endingHead = Invoke-Git -Args @("rev-parse", "HEAD")
    $workingTreeDirty = Get-WorkingTreeDirty
    $failureReason = $null

    if ($codexExitCode -ne 0) {
        $stderrText = if (Test-Path $stderrLogPath) {
            Get-Content -Path $stderrLogPath -Raw -Encoding UTF8
        }
        else {
            ""
        }

        if ($stderrText -match "input is not valid UTF-8") {
            $failureReason = "codex exec could not read the round prompt as UTF-8."
        }
        else {
            $failureReason = "codex exec exited with code $codexExitCode."
        }
    }
    elseif ($null -eq $result) {
        $failureReason = if ($parseError) {
            "Could not parse agent output JSON: $parseError"
        }
        else {
            "Agent output JSON was not created."
        }
    }

    $validatedCommitFiles = @()
    if (-not $failureReason) {
        switch ($result.status) {
            "success" {
                $validationErrors = [System.Collections.Generic.List[string]]::new()
                $phaseDocPathFromResult = Get-CleanString -Value $result.phase_doc_path
                if ([string]::IsNullOrWhiteSpace($phaseDocPathFromResult)) {
                    $validationErrors.Add("success result is missing phase_doc_path.")
                }
                elseif ($phaseDocPathFromResult -ne $phaseDocRelativePath) {
                    $validationErrors.Add("success result phase_doc_path '$phaseDocPathFromResult' does not match expected '$phaseDocRelativePath'.")
                }
                elseif (-not (Test-Path (Resolve-RepoPath -PathValue $phaseDocPathFromResult))) {
                    $validationErrors.Add("phase doc '$phaseDocPathFromResult' does not exist.")
                }

                $commitSha = Get-CleanString -Value $result.commit_sha
                if ([string]::IsNullOrWhiteSpace($commitSha)) {
                    $validationErrors.Add("success result is missing commit_sha.")
                }

                $commitMessage = Get-CleanString -Value $result.commit_message
                if ([string]::IsNullOrWhiteSpace($commitMessage)) {
                    $validationErrors.Add("success result is missing commit_message.")
                }

                if ($endingHead -ne $commitSha) {
                    $validationErrors.Add("HEAD '$endingHead' does not match commit_sha '$commitSha'.")
                }

                if (-not [string]::IsNullOrWhiteSpace($commitSha)) {
                    $actualCommitMessage = Invoke-Git -Args @("log", "-1", "--pretty=%s", $commitSha)
                    if ($actualCommitMessage -ne $commitMessage) {
                        $validationErrors.Add("Actual commit message '$actualCommitMessage' does not match reported '$commitMessage'.")
                    }

                    if (-not $actualCommitMessage.StartsWith("$([string]$config.commit_prefix):", [System.StringComparison]::OrdinalIgnoreCase)) {
                        $validationErrors.Add("Commit message must start with '$([string]$config.commit_prefix):'.")
                    }

                    $validatedCommitFiles = Get-CommitFiles -CommitSha $commitSha
                    if ((Test-BuildRequired -Files $validatedCommitFiles) -and -not $result.build_ran) {
                        $validationErrors.Add("This round changed build-relevant files but reported build_ran=false.")
                    }
                }

                if ($result.build_ran -and [string]::IsNullOrWhiteSpace((Get-CleanString -Value $result.build_id))) {
                    $validationErrors.Add("build_ran=true requires a non-empty build_id.")
                }

                if ($result.build_ran -and [bool]$config.deploy_after_build -and -not $result.deploy_ran) {
                    $validationErrors.Add("build_ran=true requires deploy_ran=true for this repo.")
                }

                if ($result.deploy_ran -and -not $result.deploy_verified) {
                    $validationErrors.Add("deploy_ran=true requires deploy_verified=true.")
                }

                $buildId = Get-CleanString -Value $result.build_id
                if ($result.deploy_ran -and -not [string]::IsNullOrWhiteSpace($buildId) -and -not (Test-DeployedBuildId -PluginDirectory ([string]$config.test_vault_plugin_dir) -BuildId $buildId)) {
                    $validationErrors.Add("Deployed Test Vault main.js does not contain BUILD_ID '$buildId'.")
                }

                if ($workingTreeDirty) {
                    $validationErrors.Add("Working tree is dirty after success commit.")
                }

                if ($validationErrors.Count -gt 0) {
                    $failureReason = ($validationErrors -join " ")
                }
            }
            "failure" {
                $failureReason = Get-CleanString -Value $result.blocking_reason
                if ([string]::IsNullOrWhiteSpace($failureReason)) {
                    $failureReason = "Agent reported failure without blocking_reason."
                }
            }
            "goal_complete" {
                if ($workingTreeDirty) {
                    $failureReason = "goal_complete returned with a dirty working tree."
                }
                else {
                    $goalCommitSha = Get-CleanString -Value $result.commit_sha
                    if (-not [string]::IsNullOrWhiteSpace($goalCommitSha) -and $goalCommitSha -ne $endingHead) {
                        $failureReason = "goal_complete reported commit_sha '$goalCommitSha' but HEAD is '$endingHead'."
                    }
                }
            }
            default {
                $failureReason = "Unknown agent status '$($result.status)'."
            }
        }
    }

    $state.current_round = [int]$state.current_round + 1
    $historyEntry = [pscustomobject]@{
        timestamp       = (Get-Date).ToString("s")
        round           = $attemptNumber
        phase_number    = $phaseNumber
        status          = if ($failureReason) { "failure" } else { [string]$result.status }
        phase_doc       = if ($result) { $result.phase_doc_path } else { $null }
        commit_sha      = if ($result) { $result.commit_sha } else { $null }
        summary         = if ($result) { $result.summary } else { $null }
        next_focus      = if ($result) { $result.next_focus } else { $null }
        blocking_reason = if ($failureReason) { $failureReason } else { $null }
    }

    if ($failureReason) {
        Write-AutopilotInfo "Round $attemptNumber failed: $failureReason"
        if ($endingHead -ne $startingHead -or $workingTreeDirty) {
            Write-AutopilotInfo "Reverting worktree to $startingHead"
            Reset-WorktreeToHead -HeadSha $startingHead
        }

        $state.consecutive_failures = [int]$state.consecutive_failures + 1
        $state.last_result = "failure"
        $state.last_blocking_reason = $failureReason
        if ($result -and -not [string]::IsNullOrWhiteSpace((Get-CleanString -Value $result.next_focus))) {
            $state.last_next_focus = [string]$result.next_focus
        }
        Append-HistoryEntry -RuntimeDirectory $runtimeDirectory -Entry $historyEntry
        Save-State -State $state -PathValue $stateFullPath

        if ($failureReason -eq "codex exec could not read the round prompt as UTF-8.") {
            $state.status = "stopped_infra_error"
            Save-State -State $state -PathValue $stateFullPath
            Write-AutopilotInfo "Stopping after infrastructure error: prompt encoding."
            break
        }

        continue
    }

    $state.consecutive_failures = 0
    $state.last_result = [string]$result.status
    $state.last_blocking_reason = $null
    $state.last_summary = [string]$result.summary
    if (-not [string]::IsNullOrWhiteSpace((Get-CleanString -Value $result.next_focus))) {
        $state.last_next_focus = [string]$result.next_focus
    }

    if (-not [string]::IsNullOrWhiteSpace((Get-CleanString -Value $result.phase_doc_path))) {
        $state.last_phase_doc = [string]$result.phase_doc_path
    }

    if (-not [string]::IsNullOrWhiteSpace((Get-CleanString -Value $result.commit_sha))) {
        $state.last_commit_sha = [string]$result.commit_sha
    }

    if ($result.status -eq "success") {
        $state.next_phase_number = [int]$state.next_phase_number + 1
        Write-AutopilotInfo "Round $attemptNumber succeeded with commit $($result.commit_sha)."
    }
    elseif ($result.status -eq "goal_complete") {
        $state.status = "complete"
        Write-AutopilotInfo "Maintainability objective reported complete."
    }

    Append-HistoryEntry -RuntimeDirectory $runtimeDirectory -Entry $historyEntry
    Save-State -State $state -PathValue $stateFullPath
}
