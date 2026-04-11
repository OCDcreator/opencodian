[CmdletBinding()]
param(
    [string]$WorktreePath = "..\\opencodian-autopilot",
    [string]$Branch = "autopilot/maintainability"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

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

$script:RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$resolvedWorktreePath = if ([System.IO.Path]::IsPathRooted($WorktreePath)) {
    [System.IO.Path]::GetFullPath($WorktreePath)
}
else {
    [System.IO.Path]::GetFullPath((Join-Path $script:RepoRoot $WorktreePath))
}

if (Test-Path $resolvedWorktreePath) {
    throw "Worktree path already exists: $resolvedWorktreePath"
}

& git -C $script:RepoRoot show-ref --verify --quiet "refs/heads/$Branch"
$branchExists = ($LASTEXITCODE -eq 0)

if ($branchExists) {
    Invoke-Git -Args @("worktree", "add", $resolvedWorktreePath, $Branch) | Out-Null
}
else {
    Invoke-Git -Args @("worktree", "add", "-b", $Branch, $resolvedWorktreePath, "HEAD") | Out-Null
}

Write-Host "Created worktree at $resolvedWorktreePath on branch $Branch"
Write-Host "Next: cd `"$resolvedWorktreePath`" and run .\\automation\\Start-MaintainabilityAutopilot.ps1"
