param(
    [string]$OutputDirectory = "",
    [switch]$PrepareOnly,
    [switch]$KeepBundle
)

$ErrorActionPreference = "Stop"
$repository = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $repository "release-manifest.json"
$manifest = Get-Content -Raw -Encoding UTF8 $manifestPath | ConvertFrom-Json
$version = [string]$manifest.release
$installerName = "PageNest-Setup-$version.exe"
$installer = Join-Path $repository "release\v$version\$installerName"
$checksum = "$installer.sha256"
$guestScript = Join-Path $PSScriptRoot "windows_sandbox_smoke_guest.ps1"
$smokeScript = Join-Path $PSScriptRoot "smoke_windows_installer.ps1"

foreach ($required in @($manifestPath, $installer, $checksum, $guestScript, $smokeScript)) {
    if (-not (Test-Path -LiteralPath $required -PathType Leaf)) {
        throw "Sandbox smoke prerequisite is missing: $required"
    }
}

$sandboxExecutable = Join-Path $env:WINDIR "System32\WindowsSandbox.exe"
if (-not $PrepareOnly -and -not (Test-Path -LiteralPath $sandboxExecutable -PathType Leaf)) {
    throw (
        "Windows Sandbox is not enabled. Enable the optional Windows Sandbox " +
        "feature, restart Windows, then run this script again."
    )
}

$generatedBundle = -not $OutputDirectory
if ($generatedBundle) {
    $OutputDirectory = Join-Path (
        [IO.Path]::GetTempPath()
    ) "pagenest-sandbox-smoke-$([guid]::NewGuid().ToString('N'))"
}
$bundleRoot = [IO.Path]::GetFullPath($OutputDirectory)
if (Test-Path -LiteralPath $bundleRoot) {
    throw "Refusing to overwrite an existing sandbox bundle: $bundleRoot"
}

$bundleScripts = Join-Path $bundleRoot "scripts"
$bundleRelease = Join-Path $bundleRoot "release\v$version"
New-Item -ItemType Directory -Path $bundleScripts, $bundleRelease | Out-Null

$configuration = Join-Path $bundleRoot "PageNest-Sandbox-Smoke.wsb"
try {
    Copy-Item -LiteralPath $manifestPath -Destination $bundleRoot
    Copy-Item -LiteralPath $guestScript, $smokeScript -Destination $bundleScripts
    Copy-Item -LiteralPath $installer, $checksum -Destination $bundleRelease

    $sandboxRoot = "C:\PageNestSmoke"
    $extensionIds = @(
        $manifest.store_extension_ids.PSObject.Properties.Value |
            Where-Object { $_ }
    ) -join ","
    $command = (
        "powershell.exe -NoProfile -ExecutionPolicy Bypass " +
        "-File `"$sandboxRoot\scripts\windows_sandbox_smoke_guest.ps1`" " +
        "-BundleRoot `"$sandboxRoot`" -ExpectedExtensionIds `"$extensionIds`""
    )
    $escapedHost = [Security.SecurityElement]::Escape($bundleRoot)
    $escapedCommand = [Security.SecurityElement]::Escape($command)
    $xml = @"
<Configuration>
  <MappedFolders>
    <MappedFolder>
      <HostFolder>$escapedHost</HostFolder>
      <SandboxFolder>$sandboxRoot</SandboxFolder>
      <ReadOnly>true</ReadOnly>
    </MappedFolder>
  </MappedFolders>
  <Networking>Enable</Networking>
  <LogonCommand>
    <Command>$escapedCommand</Command>
  </LogonCommand>
</Configuration>
"@
    [IO.File]::WriteAllText(
        $configuration,
        $xml,
        [Text.UTF8Encoding]::new($false)
    )

    if ($PrepareOnly) {
        Write-Output "Sandbox bundle prepared: $bundleRoot"
        Write-Output "Configuration: $configuration"
        return
    }

    Write-Output "Starting Windows Sandbox with a read-only sanitized bundle."
    $process = Start-Process `
        -FilePath $sandboxExecutable `
        -ArgumentList "`"$configuration`"" `
        -PassThru
    $process.WaitForExit()
}
finally {
    $removeGeneratedBundle = -not $PrepareOnly -and -not $KeepBundle -and $generatedBundle
    if ($removeGeneratedBundle -and (Test-Path -LiteralPath $bundleRoot)) {
        $resolved = [IO.Path]::GetFullPath($bundleRoot)
        $expectedPrefix = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd("\") +
            "\pagenest-sandbox-smoke-"
        if (-not $resolved.StartsWith(
            $expectedPrefix,
            [StringComparison]::OrdinalIgnoreCase
        )) {
            throw "Refusing to remove an unexpected sandbox bundle: $resolved"
        }
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
}