param(
    [string]$OutputPath = ""
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path -LiteralPath (Split-Path -Parent $PSScriptRoot)).Path
if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $OutputPath = Join-Path $root ("heavyhaul_database_only_{0}.zip" -f (Get-Date -Format "yyyyMMdd_HHmmss"))
} else {
    $OutputPath = [System.IO.Path]::GetFullPath($OutputPath)
}

$outputParent = Split-Path -Parent $OutputPath
New-Item -ItemType Directory -Path $outputParent -Force | Out-Null
if (Test-Path -LiteralPath $OutputPath) {
    throw "Refusing to overwrite existing delivery ZIP: $OutputPath"
}

$temp = Join-Path ([System.IO.Path]::GetTempPath()) ("heavyhaul_database_delivery_{0}" -f ([guid]::NewGuid().ToString("N")))
$excludedDirectories = @(".git", "audit", "backup", "node_modules", "pgdata", "staging_output", "staging_output_v2", "reports", "__pycache__")
$excludedExtensions = @(".dump", ".log", ".pyc", ".xlsx", ".xls", ".docx", ".pdf", ".zip")

function Get-RelativeEntry([string]$fullName) {
    return $fullName.Substring($root.Length + 1).Replace('\', '/')
}

try {
    New-Item -ItemType Directory -Path $temp -Force | Out-Null
    $files = Get-ChildItem -LiteralPath $root -Recurse -File -Force | Where-Object {
        $relative = Get-RelativeEntry $_.FullName
        $parts = $relative -split '/'
        $leaf = $parts[-1]
        $extension = [System.IO.Path]::GetExtension($leaf).ToLowerInvariant()
        $_.FullName -ne $OutputPath -and
        ($parts | Where-Object { $excludedDirectories -contains $_ }).Count -eq 0 -and
        $leaf -ne ".env" -and
        $leaf -ne "local-db-password.txt" -and
        $extension -notin $excludedExtensions
    }

    foreach ($file in $files) {
        $relative = Get-RelativeEntry $file.FullName
        $target = Join-Path $temp ($relative -replace '/', '\')
        New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
        Copy-Item -LiteralPath $file.FullName -Destination $target
    }

    Compress-Archive -Path (Join-Path $temp '*') -DestinationPath $OutputPath -CompressionLevel Optimal
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [System.IO.Compression.ZipFile]::OpenRead($OutputPath)
    try {
        $entries = @($archive.Entries | ForEach-Object { $_.FullName.Replace('\', '/') })
        $bad = @($entries | Where-Object {
            $parts = $_ -split '/'
            $leaf = $parts[-1]
            $extension = [System.IO.Path]::GetExtension($leaf).ToLowerInvariant()
            ($parts | Where-Object { $excludedDirectories -contains $_ }).Count -gt 0 -or
            $leaf -eq ".env" -or
            $extension -in $excludedExtensions
        })
        if ($bad.Count -gt 0) {
            throw "Unsafe entries found in delivery ZIP: $($bad -join ', ')"
        }
        $size = (Get-Item -LiteralPath $OutputPath).Length
        Write-Output (@{ archive = $OutputPath; bytes = $size; entries = $entries.Count } | ConvertTo-Json -Compress)
    } finally {
        $archive.Dispose()
    }
} finally {
    Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue
}
