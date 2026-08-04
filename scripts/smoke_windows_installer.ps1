param(
    [string]$Installer = "",
    [string]$ExpectedExtensionIds = "",
    [switch]$KeepTemporaryFiles
)

$ErrorActionPreference = "Stop"
$repository = Split-Path -Parent $PSScriptRoot
$version = (Get-Content -Raw -Encoding UTF8 (Join-Path $repository "release-manifest.json") | ConvertFrom-Json).release
if (-not $Installer) {
    $Installer = Join-Path $repository "release\v$version\PageNest-Setup-$version.exe"
}
$installerPath = [IO.Path]::GetFullPath($Installer)
if (-not (Test-Path -LiteralPath $installerPath -PathType Leaf)) {
    throw "Installer is missing: $installerPath"
}
if ($ExpectedExtensionIds -and $ExpectedExtensionIds -notmatch '^[a-p]{32}(,[a-p]{32})*$') {
    throw "ExpectedExtensionIds must contain valid Chromium extension IDs"
}

$tempParent = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$workspace = Join-Path $tempParent "pagenest-installer-smoke-$([guid]::NewGuid().ToString('N'))"
$installRoot = Join-Path $workspace "app"
$vaultName = [string]([char]0x4E2D) + [char]0x6587 + [char]0x77E5 + [char]0x8BC6 + [char]0x5E93
$vault = Join-Path $workspace $vaultName
$setupLog = Join-Path $workspace "setup.log"
New-Item -ItemType Directory -Path (Join-Path $vault ".obsidian") -Force | Out-Null

$serviceProcess = $null
$primaryPortBlocker = $null
$candidateBlocker = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 8765)
try {
    $candidateBlocker.Start()
    $primaryPortBlocker = $candidateBlocker
}
catch {
    $candidateBlocker.Stop()
}
$previousPort = $env:PAGENEST_PORT
$previousConfig = $env:PAGENEST_CONFIG_FILE
$previousPath = $env:PATH
$previousPythonHome = $env:PYTHONHOME
$previousPythonPath = $env:PYTHONPATH
try {
    $setupArguments = @(
        '/VERYSILENT',
        '/SUPPRESSMSGBOXES',
        '/NORESTART',
        '/NOICONS',
        "/LOG=`"$setupLog`"",
        '/NOSTART=1',
        "/DIR=`"$installRoot`"",
        "/VAULT=`"$vault`""
    )
    $setup = Start-Process -FilePath $installerPath -ArgumentList $setupArguments -Wait -PassThru
    if ($setup.ExitCode -ne 0) {
        if (Test-Path -LiteralPath $setupLog) {
            Get-Content -LiteralPath $setupLog -Tail 80 | Write-Output
        }
        throw "Installer failed with exit code $($setup.ExitCode)"
    }

    $service = Join-Path $installRoot "Service\PageNestService.exe"
    $config = Join-Path $installRoot "Service\.env"
    $extensionConfig = Join-Path $installRoot "Extension\connection-config.js"
    $viewer = Join-Path $vault ".obsidian\plugins\pagenest-viewer"
    $required = @(
        $service,
        $config,
        $extensionConfig,
        (Join-Path $installRoot "Extension\manifest.json"),
        (Join-Path $viewer "main.js"),
        (Join-Path $viewer "manifest.json"),
        (Join-Path $viewer "styles.css"),
        (Join-Path $viewer "versions.json")
    )
    foreach ($path in $required) {
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
            throw "Installed file is missing: $path"
        }
    }

    $installedLogs = Get-ChildItem `
        -LiteralPath (Join-Path $installRoot "Service\logs") `
        -File `
        -Recurse `
        -ErrorAction SilentlyContinue
    if ($installedLogs) {
        throw "Installer shipped runtime logs"
    }
    $configText = [IO.File]::ReadAllText($config, [Text.Encoding]::UTF8)
    $tokenMatch = [regex]::Match($configText, '(?m)^LOCAL_COLLECTOR_TOKEN=([a-f0-9]{32})\r?$')
    if (-not $tokenMatch.Success) {
        throw "Installer did not generate a valid 32-character token"
    }
    $token = $tokenMatch.Groups[1].Value

    $reinstall = Start-Process -FilePath $installerPath -ArgumentList $setupArguments -Wait -PassThru
    if ($reinstall.ExitCode -ne 0) {
        throw "Installer upgrade simulation failed with exit code $($reinstall.ExitCode)"
    }
    $configText = [IO.File]::ReadAllText($config, [Text.Encoding]::UTF8)
    $reinstalledToken = [regex]::Match(
        $configText,
        '(?m)^LOCAL_COLLECTOR_TOKEN=([a-f0-9]{32})\r?$'
    )
    if (-not $reinstalledToken.Success -or $reinstalledToken.Groups[1].Value -ne $token) {
        throw "Installer changed the collector token during an upgrade"
    }

    $portMatch = [regex]::Match($configText, '(?m)^PAGENEST_PORT=(8765|18765|28765)\r?$')
    if (-not $portMatch.Success) {
        throw "Installer did not write a supported local service port"
    }
    $port = [int]$portMatch.Groups[1].Value
    if ($port -eq 8765) {
        throw "Installer did not avoid the occupied primary port"
    }
    $extensionIdsMatch = [regex]::Match(
        $configText,
        '(?m)^PAGENEST_EXTENSION_IDS=([^\r\n]*)\r?$'
    )
    if ($ExpectedExtensionIds -and (
        -not $extensionIdsMatch.Success -or
        $extensionIdsMatch.Groups[1].Value -ne $ExpectedExtensionIds
    )) {
        throw "Installer did not embed the expected store extension IDs"
    }
    $extensionConfigText = [IO.File]::ReadAllText($extensionConfig, [Text.Encoding]::UTF8)
    if (-not $extensionConfigText.Contains($token) -or
        -not $extensionConfigText.Contains("http://127.0.0.1:$port")) {
        throw "Installer did not preconfigure the selected port and token"
    }
    if ($configText -notmatch [regex]::Escape($vault.Replace("\", "/"))) {
        throw "Installer did not preserve the selected Unicode vault path"
    }

    $env:PAGENEST_PORT = $null
    $env:PAGENEST_CONFIG_FILE = $null
    $env:PATH = "$env:SystemRoot\System32;$env:SystemRoot"
    $env:PYTHONHOME = $null
    $env:PYTHONPATH = $null
    $start = [Diagnostics.ProcessStartInfo]::new()
    $start.FileName = $service
    $start.WorkingDirectory = Split-Path -Parent $service
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $serviceProcess = [Diagnostics.Process]::new()
    $serviceProcess.StartInfo = $start
    if (-not $serviceProcess.Start()) {
        throw "Installed standalone service did not start"
    }
    $env:PAGENEST_PORT = $previousPort
    $env:PAGENEST_CONFIG_FILE = $previousConfig
    $env:PATH = $previousPath
    $env:PYTHONHOME = $previousPythonHome
    $env:PYTHONPATH = $previousPythonPath

    $headers = @{ Authorization = "Bearer $token" }
    $baseUrl = "http://127.0.0.1:$port"
    $health = $null
    for ($attempt = 0; $attempt -lt 40; $attempt++) {
        if ($serviceProcess.HasExited) { break }
        try {
            $health = Invoke-RestMethod -Uri "$baseUrl/api/health" -Headers $headers -TimeoutSec 2
            if ($health.ok) { break }
        }
        catch {}
        Start-Sleep -Milliseconds 500
    }
    if (-not $health.ok -or -not $health.vault_configured) {
        $exitState = if ($serviceProcess.HasExited) { "exited=$($serviceProcess.ExitCode)" } else { "running" }
        throw "Installed service health check failed: process=$exitState, port=$port"
    }

    if ($ExpectedExtensionIds) {
        $trustedId = $ExpectedExtensionIds.Split(",")[0]
        $pair = Invoke-RestMethod `
            -Method Post `
            -Uri "$baseUrl/api/pair" `
            -ContentType "application/json" `
            -Body "{}" `
            -Headers @{ Origin = "chrome-extension://$trustedId" }
        if ($pair.token -ne $token) {
            throw "Trusted store extension did not receive the installed token"
        }
        $untrustedId = (("a" * 32) -join "")
        if ($ExpectedExtensionIds.Contains($untrustedId)) {
            $untrustedId = (("b" * 32) -join "")
        }
        $untrustedWasDenied = $false
        try {
            Invoke-WebRequest `
                -UseBasicParsing `
                -Method Post `
                -Uri "$baseUrl/api/pair" `
                -ContentType "application/json" `
                -Body "{}" `
                -Headers @{ Origin = "chrome-extension://$untrustedId" } |
                Out-Null
        }
        catch {
            $untrustedWasDenied = $_.Exception.Response.StatusCode.value__ -eq 403
        }
        if (-not $untrustedWasDenied) {
            throw "Untrusted extension origin was not rejected"
        }
    }

    $payload = @{
        title = "Installer smoke"
        url = "https://example.test/pagenest-installer"
        canonical_url = "https://example.test/pagenest-installer"
        captured_at = "2026-07-28T12:00:00+08:00"
        article_html = "<article><h1>Installer smoke</h1><p>Installed PageNest service works.</p></article>"
        article_text = "Installed PageNest service works."
        mode = "original"
        category = "auto"
    } | ConvertTo-Json
    $response = Invoke-WebRequest `
        -UseBasicParsing `
        -Method Post `
        -Uri "$baseUrl/api/collect" `
        -Headers $headers `
        -ContentType "application/json; charset=utf-8" `
        -Body ([Text.Encoding]::UTF8.GetBytes($payload)) `
        -TimeoutSec 30
    $result = [Text.Encoding]::UTF8.GetString($response.RawContentStream.ToArray()) | ConvertFrom-Json
    $savedPage = [string]$result.page_path
    if (-not $savedPage.EndsWith(".pagenest") -or -not (Test-Path -LiteralPath $savedPage -PathType Leaf)) {
        throw "Installed service did not create a .pagenest page"
    }

    $serviceProcess.Kill()
    $serviceProcess.WaitForExit()
    $serviceProcess = $null
    $uninstaller = Join-Path $installRoot "unins000.exe"
    $uninstall = Start-Process `
        -FilePath $uninstaller `
        -ArgumentList @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART') `
        -Wait `
        -PassThru
    if ($uninstall.ExitCode -ne 0) {
        throw "Uninstaller failed with exit code $($uninstall.ExitCode)"
    }
    if (-not (Test-Path -LiteralPath $savedPage -PathType Leaf)) {
        throw "Uninstall removed a user-created .pagenest page"
    }
    if ((Test-Path -LiteralPath $config) -or (Test-Path -LiteralPath (Join-Path $installRoot "连接设置.txt"))) {
        throw "Uninstall left connection secrets behind"
    }

    Write-Output "Windows installer smoke passed"
    Write-Output "Installer: $installerPath"
    Write-Output "Standalone service: passed"
    Write-Output "Bundled runtime without Python on PATH: passed"
    Write-Output "Unicode vault: passed"
    Write-Output "Viewer installation: passed"
    Write-Output "Extension preconfiguration: passed"
    Write-Output "Upgrade token preservation: passed"
    Write-Output "Occupied-port fallback: passed ($port)"
    if ($ExpectedExtensionIds) {
        Write-Output "Store extension pairing: passed"
    }
    Write-Output "Connection secrets removed after uninstall: passed"
    Write-Output "User page preserved after uninstall: passed"
}
finally {
    $env:PAGENEST_PORT = $previousPort
    $env:PAGENEST_CONFIG_FILE = $previousConfig
    $env:PATH = $previousPath
    $env:PYTHONHOME = $previousPythonHome
    $env:PYTHONPATH = $previousPythonPath
    if ($serviceProcess -and -not $serviceProcess.HasExited) {
        $serviceProcess.Kill()
        $serviceProcess.WaitForExit()
    }
    if ($primaryPortBlocker) {
        $primaryPortBlocker.Stop()
    }
    $resolved = [IO.Path]::GetFullPath($workspace)
    $expectedPrefix = $tempParent.TrimEnd("\") + "\pagenest-installer-smoke-"
    if (-not $resolved.StartsWith($expectedPrefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to remove unexpected installer smoke directory: $resolved"
    }
    if ($KeepTemporaryFiles) {
        Write-Output "InstallerSmokeTemp=$resolved"
    }
    elseif (Test-Path -LiteralPath $resolved) {
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
}
