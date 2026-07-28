param(
    [string]$OutputRoot = ""
)

$ErrorActionPreference = "Stop"
$repository = Split-Path -Parent $PSScriptRoot
$python = Join-Path $repository "local-server\.venv\Scripts\python.exe"
if (-not (Test-Path -LiteralPath $python -PathType Leaf)) {
    throw "Build environment is missing. Create local-server\.venv and install requirements-build.txt."
}

if (-not $OutputRoot) {
    $OutputRoot = Join-Path $repository "build\windows-service"
}
$workRoot = Join-Path $repository "build\pyinstaller"
$entryPoint = Join-Path $repository "local-server\run.py"
$sourceRoot = Join-Path $repository "local-server"
$icon = Join-Path $repository "installer\PageNest.ico"

& $python -m PyInstaller `
    --noconfirm `
    --onedir `
    --noconsole `
    --name PageNestService `
    --icon $icon `
    --distpath $OutputRoot `
    --workpath $workRoot `
    --specpath $workRoot `
    --paths $sourceRoot `
    --collect-all imageio_ffmpeg `
    --collect-submodules yt_dlp `
    --hidden-import uvicorn.logging `
    --hidden-import uvicorn.loops.auto `
    --hidden-import uvicorn.protocols.http.auto `
    --hidden-import uvicorn.protocols.websockets.auto `
    --hidden-import uvicorn.lifespan.on `
    $entryPoint
if ($LASTEXITCODE -ne 0) {
    throw "PyInstaller failed with exit code $LASTEXITCODE"
}

$executable = Join-Path $OutputRoot "PageNestService\PageNestService.exe"
if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) {
    throw "Expected service executable was not produced: $executable"
}
Write-Output $executable
