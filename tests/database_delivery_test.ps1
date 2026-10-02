param(
    [string]$OutputPath = (Join-Path ([System.IO.Path]::GetTempPath()) ("heavyhaul_database_delivery_test_{0}.zip" -f ([guid]::NewGuid().ToString("N"))))
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$deliveryScript = Join-Path $projectRoot "scripts\create_safe_delivery.ps1"
$maxBytes = 10MB

function Assert-True([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw $Message }
}

try {
    & $deliveryScript -OutputPath $OutputPath
    Assert-True ($LASTEXITCODE -eq 0 -or $null -eq $LASTEXITCODE) "Delivery script failed with exit code $LASTEXITCODE"
    Assert-True (Test-Path -LiteralPath $OutputPath -PathType Leaf) "Delivery ZIP was not created at the requested output path"

    $archive = [System.IO.Compression.ZipFile]::OpenRead($OutputPath)
    try {
        $entries = @($archive.Entries | ForEach-Object { $_.FullName.Replace('\', '/') })
        $required = @(
            ".env.example",
            "README.md",
            "package.json",
            "pnpm-lock.yaml",
            "db/migrations/001_baseline_schema.sql",
            "db/migrations/002_dictionary_seed.sql",
            "db/migrations/003_analysis_views.sql",
            "db/migrations/004_case_import_and_evaluation_framework.sql",
            "db/migrations/005_migration_registry.sql",
            "db/migrations/006_b13_staging_quality_corrections.sql",
            "scripts/check_migrations.js",
            "scripts/create_safe_delivery.ps1",
            "scripts/rebuild_verify_001_to_006.js",
            "tests/migration_checksum_test.js",
            "tests/b13_extract_test.py",
            "tests/b13_staging_import_test.js",
            "tests/b13_quality_test.js",
            "tests/b13_quality_comparison_test.js",
            "tests/database_delivery_test.ps1"
        )
        foreach ($name in $required) {
            Assert-True ($entries -contains $name) "Required database delivery entry is missing: $name"
        }

        $badEntries = @($entries | Where-Object {
            $parts = $_ -split '/'
            $leaf = $parts[-1]
            $extension = [System.IO.Path]::GetExtension($leaf).ToLowerInvariant()
            ($parts | Where-Object { $_ -in @("backup", "node_modules", "pgdata", "staging_output", "staging_output_v2", "reports", "__pycache__") }).Count -gt 0 -or
            $leaf -eq ".env" -or
            $extension -in @(".dump", ".log", ".pyc", ".xlsx", ".xls", ".docx", ".pdf", ".zip")
        })
        Assert-True ($badEntries.Count -eq 0) "Unsafe or case-derived entries found: $($badEntries -join ', ')"
    } finally {
        $archive.Dispose()
    }

    $size = (Get-Item -LiteralPath $OutputPath).Length
    Assert-True ($size -lt $maxBytes) "Delivery ZIP is $size bytes; maximum is $maxBytes bytes"
    Write-Output (@{ test = "database_delivery_test"; status = "passed"; archive = $OutputPath; bytes = $size; entries = $entries.Count } | ConvertTo-Json -Compress)
} finally {
    Remove-Item -LiteralPath $OutputPath -Force -ErrorAction SilentlyContinue
}
