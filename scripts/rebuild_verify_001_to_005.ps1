# Compatibility entry point; runs the current 001-006 isolated rebuild.
$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
& node (Join-Path $projectRoot "scripts/rebuild_verify_001_to_006.js") @args
exit $LASTEXITCODE
