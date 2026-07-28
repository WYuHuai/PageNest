$ErrorActionPreference = "Stop"

$repository = Split-Path -Parent $PSScriptRoot
$localPython = Join-Path $repository "local-server\.venv\Scripts\python.exe"
$python = if (Test-Path -LiteralPath $localPython) { $localPython } else { "python" }

Push-Location $repository
try {
    & $python "scripts\package_release.py"
    if ($LASTEXITCODE -ne 0) {
        throw "Release packaging failed with exit code $LASTEXITCODE"
    }
}
finally {
    Pop-Location
}
