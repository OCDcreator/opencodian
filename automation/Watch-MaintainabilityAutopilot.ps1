[CmdletBinding()]
param(
    [string]$RuntimePath = "automation/runtime",
    [int]$Tail = 20,
    [int]$RefreshSeconds = 2
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-WatchPath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$PathValue
    )

    $repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
    if ([System.IO.Path]::IsPathRooted($PathValue)) {
        return [System.IO.Path]::GetFullPath($PathValue)
    }

    return [System.IO.Path]::GetFullPath((Join-Path $repoRoot $PathValue))
}

function Get-LatestRoundDirectory {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RuntimeDirectory
    )

    return Get-ChildItem -Path $RuntimeDirectory -Directory -Filter "round-*" -ErrorAction SilentlyContinue |
        Sort-Object Name |
        Select-Object -Last 1
}

function Show-StateSummary {
    param(
        [Parameter(Mandatory = $true)]
        [string]$StatePathValue
    )

    if (-not (Test-Path $StatePathValue)) {
        Write-Host "[watch] state file not created yet: $StatePathValue"
        return
    }

    $state = Get-Content -Path $StatePathValue -Raw -Encoding UTF8 | ConvertFrom-Json
    Write-Host ("[watch] status={0} round={1} failures={2} next_phase={3}" -f $state.status, $state.current_round, $state.consecutive_failures, $state.next_phase_number)
    if ($state.last_phase_doc) {
        Write-Host "[watch] last phase doc: $($state.last_phase_doc)"
    }
    if ($state.last_next_focus) {
        Write-Host "[watch] next focus: $($state.last_next_focus)"
    }
}

$runtimeDirectory = Resolve-WatchPath -PathValue $RuntimePath
$statePath = Join-Path $runtimeDirectory "maintainability-state.json"
$lastProgressPath = $null
$lastLineCount = 0
$shownInitialState = $false

Write-Host "[watch] runtime: $runtimeDirectory"

while ($true) {
    if (-not $shownInitialState) {
        Show-StateSummary -StatePathValue $statePath
        $shownInitialState = $true
    }

    $latestRoundDirectory = Get-LatestRoundDirectory -RuntimeDirectory $runtimeDirectory
    if ($null -ne $latestRoundDirectory) {
        $progressPath = Join-Path $latestRoundDirectory.FullName "progress.log"
        if ($progressPath -ne $lastProgressPath) {
            $lastProgressPath = $progressPath
            $lastLineCount = 0
            Write-Host ""
            Write-Host "[watch] now watching $progressPath"
            if (Test-Path $progressPath) {
                $existingLines = @(Get-Content -Path $progressPath)
                if ($existingLines.Count -gt 0) {
                    $startIndex = [Math]::Max(0, $existingLines.Count - $Tail)
                    $existingLines[$startIndex..($existingLines.Count - 1)] | ForEach-Object { Write-Host $_ }
                    $lastLineCount = $existingLines.Count
                }
            }
        }

        if ($lastProgressPath -and (Test-Path $lastProgressPath)) {
            $currentLines = @(Get-Content -Path $lastProgressPath)
            if ($currentLines.Count -gt $lastLineCount) {
                $currentLines[$lastLineCount..($currentLines.Count - 1)] | ForEach-Object { Write-Host $_ }
                $lastLineCount = $currentLines.Count
            }
        }
    }

    Start-Sleep -Seconds $RefreshSeconds
}
