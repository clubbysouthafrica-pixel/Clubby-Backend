# PowerShell script to build Lambda layer folders and install dependencies (Windows-friendly)
# Usage: .\scripts\build-layers.ps1
$ErrorActionPreference = "Stop"

$LAYER_BASE = "layer-code"
$LAYER_DIRS = @("jwt_code", "jwks-rsa_code", "axios_code")

foreach ($layer in $LAYER_DIRS) {
    Write-Host "Setting up layer: $layer"

    $layerPath = Join-Path -Path $LAYER_BASE -ChildPath (Join-Path $layer "nodejs")

    # ensure directory exists
    if (-not (Test-Path $layerPath)) {
        New-Item -ItemType Directory -Path $layerPath -Force | Out-Null
    }

    $packageJsonPath = Join-Path $layerPath "package.json"

    if (-not (Test-Path $packageJsonPath)) {
        # create default package.json
        $pkg = @{
            name = $layer
            version = "1.0.0"
            description = "$layer Lambda Layer"
            dependencies = @{}
        }
        $pkg | ConvertTo-Json -Depth 5 | Out-File -FilePath $packageJsonPath -Encoding UTF8

        Write-Host "Created default package.json for $layer. Please add the required dependencies."
        continue
    }

    Write-Host "Installing dependencies in $layerPath..."
    # remove node_modules if exists
    $nodeModules = Join-Path $layerPath "node_modules"
    if (Test-Path $nodeModules) {
        Remove-Item -Recurse -Force -Path $nodeModules
    }

    Push-Location $layerPath
    try {
        # npm install --omit=dev
        $psi = New-Object System.Diagnostics.ProcessStartInfo
        $psi.FileName = "npm"
        $psi.Arguments = "install --omit=dev"
        $psi.RedirectStandardOutput = $false
        $psi.RedirectStandardError = $false
        $psi.UseShellExecute = $true
        $proc = [System.Diagnostics.Process]::Start($psi)
        $proc.WaitForExit()
        if ($proc.ExitCode -ne 0) {
            throw "npm install failed with exit code $($proc.ExitCode)"
        }
    } finally {
        Pop-Location
    }
}

Write-Host "✅ All layers set up."
