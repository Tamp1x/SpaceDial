# scan-wallpapers.ps1
# Run this after adding files to Wallpapers/ folder
# Updates wallpapers.json with discovered files

$ext = @('.jpg','.jpeg','.png','.gif','.webp','.mp4','.webm','.ogg')
$folder = Join-Path $PSScriptRoot 'Wallpapers'
$outFile = Join-Path $PSScriptRoot 'wallpapers.json'

if (-not (Test-Path $folder)) {
    New-Item -ItemType Directory -Path $folder | Out-Null
    Write-Host "Created Wallpapers/ folder. Add images or videos there."
}

$files = Get-ChildItem -Path $folder -File | Where-Object { $_.Extension -in $ext } | Sort-Object Name
$wallpapers = @()

foreach ($f in $files) {
    $isVideo = $f.Extension -match '\.(mp4|webm|ogg)$'
    $wallpapers += @{
        name = $f.BaseName
        file = "Wallpapers/$($f.Name)"
        type = if ($isVideo) { 'video' } else { 'image' }
    }
}

$json = @{ wallpapers = $wallpapers } | ConvertTo-Json -Depth 3
[System.IO.File]::WriteAllText($outFile, $json)

Write-Host "Found $($wallpapers.Count) wallpapers in Wallpapers/"
$wallpapers | ForEach-Object { Write-Host "  - $($_.name) ($($_.type))" }
