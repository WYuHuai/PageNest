param(
    [switch]$SkipServiceBuild
)

$ErrorActionPreference = "Stop"
$repository = Split-Path -Parent $PSScriptRoot
if (-not $SkipServiceBuild) {
    & (Join-Path $PSScriptRoot "build_windows_service.ps1")
    if ($LASTEXITCODE -ne 0) { throw "Windows service build failed" }
}

$manifest = Get-Content -Raw -Encoding UTF8 (Join-Path $repository "release-manifest.json") | ConvertFrom-Json
$version = [string]$manifest.release
$compilerCandidates = @(
    (Join-Path $env:LOCALAPPDATA "Programs\Inno Setup 6\ISCC.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "Inno Setup 6\ISCC.exe"),
    (Join-Path $env:ProgramFiles "Inno Setup 6\ISCC.exe")
)
$compiler = $compilerCandidates | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) } | Select-Object -First 1
if (-not $compiler) {
    throw "Inno Setup 6 compiler was not found. Install JRSoftware.InnoSetup with winget."
}

& $compiler "/DAppVersion=$version" (Join-Path $repository "installer\PageNest.iss")
if ($LASTEXITCODE -ne 0) { throw "Inno Setup failed with exit code $LASTEXITCODE" }

$installer = Join-Path $repository "release\v$version\PageNest-Setup-$version.exe"
if (-not (Test-Path -LiteralPath $installer -PathType Leaf)) {
    throw "Expected installer was not produced: $installer"
}
$checksum = (Get-FileHash -Algorithm SHA256 -LiteralPath $installer).Hash.ToLowerInvariant()
$checksumFile = "$installer.sha256"
[IO.File]::WriteAllText(
    $checksumFile,
    "$checksum  $([IO.Path]::GetFileName($installer))`n",
    [Text.UTF8Encoding]::new($false)
)
Write-Output $installer
Write-Output $checksumFile
