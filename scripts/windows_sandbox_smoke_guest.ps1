param(
    [Parameter(Mandatory = $true)]
    [string]$BundleRoot,
    [string]$ExpectedExtensionIds = ""
)

$ErrorActionPreference = "Stop"
$bundle = [IO.Path]::GetFullPath($BundleRoot)
$manifest = Get-Content -Raw -Encoding UTF8 (
    Join-Path $bundle "release-manifest.json"
) | ConvertFrom-Json
$version = [string]$manifest.release
$installer = Join-Path $bundle "release\v$version\PageNest-Setup-$version.exe"
$checksumFile = "$installer.sha256"
$smokeScript = Join-Path $bundle "scripts\smoke_windows_installer.ps1"
$desktop = [Environment]::GetFolderPath([Environment+SpecialFolder]::Desktop)
$resultFile = Join-Path $desktop "PageNest-Sandbox-Smoke-Result.txt"

$lines = [Collections.Generic.List[string]]::new()
function Add-Result([string]$Message) {
    $lines.Add($Message)
    Write-Output $Message
}

$exitCode = 1
try {
    Add-Result "PageNest clean Windows Sandbox smoke"
    Add-Result "Started: $([DateTimeOffset]::Now.ToString('u'))"
    Add-Result "Windows: $([Environment]::OSVersion.VersionString)"
    $systemPython = Get-Command python.exe -ErrorAction SilentlyContinue
    $pythonDescription = if ($systemPython) { $systemPython.Source } else { "not found" }
    Add-Result "System Python before install: $pythonDescription"

    foreach ($required in @($installer, $checksumFile, $smokeScript)) {
        if (-not (Test-Path -LiteralPath $required -PathType Leaf)) {
            throw "Required bundle file is missing: $required"
        }
    }
    $expectedHash = (Get-Content -Raw -Encoding UTF8 $checksumFile).Split(
        [char[]]" `t`r`n",
        [StringSplitOptions]::RemoveEmptyEntries
    )[0]
    $actualHash = (Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualHash -ne $expectedHash) {
        throw "Installer SHA-256 mismatch"
    }
    Add-Result "Installer SHA-256: verified"

    $smokeOutput = & $smokeScript `
        -Installer $installer `
        -ExpectedExtensionIds $ExpectedExtensionIds `
        -KeepTemporaryFiles
    foreach ($line in $smokeOutput) {
        Add-Result ([string]$line)
    }
    Add-Result "RESULT: PASS"
    $exitCode = 0
}
catch {
    Add-Result "RESULT: FAIL"
    Add-Result $_.Exception.Message
    Add-Result $_.ScriptStackTrace
}
finally {
    [IO.File]::WriteAllLines(
        $resultFile,
        $lines,
        [Text.UTF8Encoding]::new($false)
    )
    Start-Process -FilePath notepad.exe -ArgumentList "`"$resultFile`""
}

exit $exitCode