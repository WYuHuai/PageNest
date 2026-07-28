param(
    [string]$ReleaseDirectory = "",
    [int]$Port = 18765,
    [switch]$KeepWorkspace
)

$ErrorActionPreference = "Stop"
$repository = Split-Path -Parent $PSScriptRoot
$metadata = Get-Content -Raw -Encoding UTF8 (Join-Path $repository "release-manifest.json") |
    ConvertFrom-Json
if (-not $ReleaseDirectory) {
    $ReleaseDirectory = Join-Path $repository "release\v$($metadata.release)"
}
$releaseRoot = [System.IO.Path]::GetFullPath($ReleaseDirectory)
if (-not (Test-Path -LiteralPath $releaseRoot -PathType Container)) {
    throw "Release directory does not exist: $releaseRoot"
}

$extensionZip = Join-Path $releaseRoot "pagenest-browser-extension-v$($metadata.components.browser_extension).zip"
$viewerZip = Join-Path $releaseRoot "pagenest-obsidian-viewer-v$($metadata.components.obsidian_viewer).zip"
$serverZip = Join-Path $releaseRoot "pagenest-local-server-windows-v$($metadata.components.local_server).zip"
foreach ($archive in @($extensionZip, $viewerZip, $serverZip)) {
    if (-not (Test-Path -LiteralPath $archive -PathType Leaf)) {
        throw "Missing release archive: $archive"
    }
}

$listener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
if ($listener) {
    throw "Smoke-test port is already in use: $Port"
}

$localAppDataTemp = Join-Path (
    [Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)
) "Temp"
$temporaryParent = if (Test-Path -LiteralPath $localAppDataTemp -PathType Container) {
    [System.IO.Path]::GetFullPath($localAppDataTemp).TrimEnd("\")
}
else {
    [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd("\")
}
$workspace = Join-Path $temporaryParent "hermes-release-smoke-$([guid]::NewGuid().ToString('N'))"
$extensionRoot = Join-Path $workspace "extension"
$viewerRoot = Join-Path $workspace "viewer"
$serverRoot = Join-Path $workspace "server"
$vaultRoot = Join-Path $workspace "vault"
$serviceProcess = $null

try {
    New-Item -ItemType Directory -Path $extensionRoot, $viewerRoot, $serverRoot, $vaultRoot |
        Out-Null
    Expand-Archive -LiteralPath $extensionZip -DestinationPath $extensionRoot
    Expand-Archive -LiteralPath $viewerZip -DestinationPath $viewerRoot
    Expand-Archive -LiteralPath $serverZip -DestinationPath $serverRoot

    foreach ($required in @(
        (Join-Path $extensionRoot "manifest.json"),
        (Join-Path $extensionRoot "icons\icon128.png"),
        (Join-Path $viewerRoot "main.js"),
        (Join-Path $viewerRoot "manifest.json"),
        (Join-Path $viewerRoot "styles.css"),
        (Join-Path $viewerRoot "versions.json"),
        (Join-Path $serverRoot "local-server\requirements.txt"),
        (Join-Path $serverRoot "local-server\.env.example")
    )) {
        if (-not (Test-Path -LiteralPath $required -PathType Leaf)) {
            throw "Extracted package is missing: $required"
        }
    }

    $extensionManifest = Get-Content -Raw -Encoding UTF8 (Join-Path $extensionRoot "manifest.json") |
        ConvertFrom-Json
    $viewerManifest = Get-Content -Raw -Encoding UTF8 (Join-Path $viewerRoot "manifest.json") |
        ConvertFrom-Json
    if ($extensionManifest.version -ne $metadata.components.browser_extension) {
        throw "Extracted extension version mismatch"
    }
    if ($viewerManifest.version -ne $metadata.components.obsidian_viewer) {
        throw "Extracted viewer version mismatch"
    }

    $checksumFile = Join-Path $releaseRoot "SHA256SUMS.txt"
    $expectedChecksums = @{}
    foreach ($line in Get-Content -Encoding UTF8 $checksumFile) {
        if ($line -match "^([0-9a-f]{64})  (.+)$") {
            $expectedChecksums[$matches[2]] = $matches[1]
        }
    }
    foreach ($archive in @($extensionZip, $viewerZip, $serverZip)) {
        $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $archive).Hash.ToLowerInvariant()
        $name = Split-Path -Leaf $archive
        if ($expectedChecksums[$name] -ne $actual) {
            throw "SHA-256 mismatch: $name"
        }
    }

    $serviceDirectory = Join-Path $serverRoot "local-server"
    $environmentFile = Join-Path $serviceDirectory ".env"
    $token = [guid]::NewGuid().ToString("N")
    $environmentLines = @(
        "OBSIDIAN_VAULT_PATH=$($vaultRoot.Replace('\', '/'))",
        "LOCAL_COLLECTOR_TOKEN=$token",
        "ALLOW_LOCAL_NETWORK_DOWNLOADS=false",
        "HERMES_API_URL=",
        "HERMES_MODEL_NAME=",
        "HERMES_API_KEY="
    )
    [System.IO.File]::WriteAllLines(
        $environmentFile,
        $environmentLines,
        (New-Object System.Text.UTF8Encoding($false))
    )

    $systemPython = (Get-Command python -ErrorAction Stop).Source
    & $systemPython -m venv (Join-Path $serviceDirectory ".venv")
    if ($LASTEXITCODE -ne 0) {
        throw "Could not create clean smoke-test virtual environment"
    }
    $smokePython = Join-Path $serviceDirectory ".venv\Scripts\python.exe"
    & $smokePython -m pip install --disable-pip-version-check --retries 5 --timeout 60 --prefer-binary -r (
        Join-Path $serviceDirectory "requirements.txt"
    )
    if ($LASTEXITCODE -ne 0) {
        throw "Could not install runtime requirements in clean environment"
    }

    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = $smokePython
    $startInfo.Arguments = "-m uvicorn collector.main:app --host 127.0.0.1 --port $Port"
    $startInfo.WorkingDirectory = $serviceDirectory
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $serviceProcess = [System.Diagnostics.Process]::Start($startInfo)
    if (-not $serviceProcess) {
        throw "Could not start the clean local service"
    }

    $baseUrl = "http://127.0.0.1:$Port"
    $ready = $false
    foreach ($attempt in 1..30) {
        try {
            $status = Invoke-WebRequest -UseBasicParsing "$baseUrl/status" -TimeoutSec 1
            if ($status.StatusCode -eq 200) {
                $ready = $true
                break
            }
        }
        catch {
            Start-Sleep -Milliseconds 500
        }
    }
    if (-not $ready) {
        throw "Clean local service did not become ready"
    }

    $headers = @{ Authorization = "Bearer $token" }
    $health = Invoke-RestMethod -Uri "$baseUrl/api/health" -Headers $headers
    if (-not $health.ok -or -not $health.vault_configured) {
        throw "Authenticated health check failed"
    }

    $payload = @{
        capture_version = 12
        title = "Clean release smoke test"
        url = "https://example.test/hermes-release-smoke"
        canonical_url = "https://example.test/hermes-release-smoke"
        captured_at = "2026-07-28T00:00:00+08:00"
        extraction_method = "release-smoke"
        article_html = "<article><h1>Clean release smoke test</h1><p>Offline package verification content.</p><pre><code>print('hermes')</code></pre></article>"
        article_text = "Clean release smoke test. Offline package verification content."
        headings = @("Clean release smoke test")
        images = @()
        media = @()
        mode = "original"
        category = "auto"
        user_note = "Disposable clean-install verification"
    } | ConvertTo-Json -Depth 8
    $resultResponse = Invoke-WebRequest `
        -UseBasicParsing `
        -Method Post `
        -Uri "$baseUrl/api/collect" `
        -Headers $headers `
        -ContentType "application/json; charset=utf-8" `
        -Body ([Text.Encoding]::UTF8.GetBytes($payload))
    $resultJson = [Text.Encoding]::UTF8.GetString(
        $resultResponse.RawContentStream.ToArray()
    )
    $result = $resultJson | ConvertFrom-Json

    $page = [System.IO.Path]::GetFullPath($result.page_path)
    $vaultPrefix = [System.IO.Path]::GetFullPath($vaultRoot).TrimEnd("\") + "\"
    if (-not $page.StartsWith($vaultPrefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Smoke collection escaped the disposable vault"
    }
    $pageExists = Test-Path -LiteralPath $page -PathType Leaf
    if (-not $pageExists -or $result.single_file -ne $true) {
        throw (
            "Smoke collection result invalid: page_exists={0}, single_file={1}, page={2}" -f
            $pageExists, $result.single_file, $page
        )
    }
    $offlinePage = Get-Content -Raw -Encoding UTF8 $page
    if (
        $offlinePage -notmatch "Clean release smoke test" -or
        $offlinePage -notmatch "print\('hermes'\)" -or
        $offlinePage -notmatch "Disposable clean-install verification"
    ) {
        throw "Generated .pagenest page is missing expected offline content"
    }

    Write-Output "Windows release smoke passed"
    Write-Output "Extension: $($extensionManifest.version)"
    Write-Output "Local service: $($metadata.components.local_server)"
    Write-Output "Obsidian viewer: $($viewerManifest.version)"
    Write-Output "Generated page: $page"
}
finally {
    if ($serviceProcess -and -not $serviceProcess.HasExited) {
        Stop-Process -Id $serviceProcess.Id -Force
        $serviceProcess.WaitForExit()
    }
    if (-not $KeepWorkspace -and (Test-Path -LiteralPath $workspace)) {
        $resolvedWorkspace = [System.IO.Path]::GetFullPath($workspace)
        if ([System.IO.Path]::GetDirectoryName($resolvedWorkspace) -ne $temporaryParent) {
            throw "Refusing to remove unexpected smoke-test directory"
        }
        Remove-Item -LiteralPath $resolvedWorkspace -Recurse -Force
    }
    elseif ($KeepWorkspace) {
        Write-Output "Smoke workspace retained: $workspace"
    }
}
