param(
    [string]$BundleRoot = "",
    [switch]$KeepTemporaryFiles
)

$ErrorActionPreference = "Stop"
$repository = Split-Path -Parent $PSScriptRoot
if (-not $BundleRoot) {
    $BundleRoot = Join-Path $repository "build\windows-service\PageNestService"
}
$bundle = [IO.Path]::GetFullPath($BundleRoot)
$executable = Join-Path $bundle "PageNestService.exe"
if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) {
    throw "Frozen service is missing: $executable"
}

$tempParent = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$workspace = Join-Path $tempParent "pagenest-frozen-smoke-$([guid]::NewGuid().ToString('N'))"
$vault = Join-Path $workspace "vault"
New-Item -ItemType Directory -Path $vault -Force | Out-Null

$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
$listener.Start()
$port = $listener.LocalEndpoint.Port
$listener.Stop()

$token = [guid]::NewGuid().ToString("N")
$config = Join-Path $workspace "service.env"
$vaultValue = $vault.Replace("\", "/")
[IO.File]::WriteAllText(
    $config,
    "OBSIDIAN_VAULT_PATH=`"$vaultValue`"`nLOCAL_COLLECTOR_TOKEN=$token`nALLOW_LOCAL_NETWORK_DOWNLOADS=false`n",
    [Text.UTF8Encoding]::new($false)
)

$start = [Diagnostics.ProcessStartInfo]::new()
$start.FileName = $executable
$start.WorkingDirectory = $bundle
$start.UseShellExecute = $false
$start.CreateNoWindow = $true
$process = [Diagnostics.Process]::new()
$process.StartInfo = $start
$previousConfig = $env:PAGENEST_CONFIG_FILE
$previousPort = $env:PAGENEST_PORT

try {
    $env:PAGENEST_CONFIG_FILE = $config
    $env:PAGENEST_PORT = [string]$port
    if (-not $process.Start()) {
        throw "Frozen service did not start"
    }
    $env:PAGENEST_CONFIG_FILE = $previousConfig
    $env:PAGENEST_PORT = $previousPort

    $headers = @{ Authorization = "Bearer $token" }
    $baseUrl = "http://127.0.0.1:$port"
    $health = $null
    for ($attempt = 0; $attempt -lt 40; $attempt++) {
        if ($process.HasExited) { break }
        try {
            $health = Invoke-RestMethod -Uri "$baseUrl/api/health" -Headers $headers -TimeoutSec 2
            if ($health.ok) { break }
        }
        catch {}
        Start-Sleep -Milliseconds 500
    }
    if (-not $health.ok) {
        throw "Frozen service health check failed; inspect $bundle\logs\service.log"
    }

    $payload = @{
        title = "Frozen runtime smoke"
        url = "https://example.test/pagenest"
        canonical_url = "https://example.test/pagenest"
        captured_at = "2026-07-28T12:00:00+08:00"
        article_html = "<article><h1>Frozen runtime smoke</h1><p>PageNest standalone service works.</p></article>"
        article_text = "PageNest standalone service works."
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
    $resultJson = [Text.Encoding]::UTF8.GetString($response.RawContentStream.ToArray())
    $result = $resultJson | ConvertFrom-Json
    $page = [string]$result.page_path
    if (-not $result.single_file -or -not $page.EndsWith(".pagenest") -or -not (Test-Path -LiteralPath $page -PathType Leaf)) {
        throw "Frozen result invalid: single_file=$($result.single_file), page=$page, suffix=$($page.EndsWith('.pagenest')), exists=$(Test-Path -LiteralPath $page -PathType Leaf)"
    }

    Write-Output "Frozen Windows service smoke passed"
    Write-Output "Executable: $executable"
    Write-Output "Generated page: $page"
}
finally {
    $env:PAGENEST_CONFIG_FILE = $previousConfig
    $env:PAGENEST_PORT = $previousPort
    if ($process -and -not $process.HasExited) {
        $process.Kill()
        $process.WaitForExit()
    }
    if (-not $KeepTemporaryFiles) {
        $resolved = [IO.Path]::GetFullPath($workspace)
        $expectedPrefix = $tempParent.TrimEnd("\") + "\pagenest-frozen-smoke-"
        if (-not $resolved.StartsWith($expectedPrefix, [StringComparison]::OrdinalIgnoreCase)) {
            throw "Refusing to remove unexpected smoke directory: $resolved"
        }
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
}
