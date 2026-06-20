# Creates a simple placeholder application icon for electron-builder.
Add-Type -AssemblyName System.Drawing

$resourcesDir = Join-Path (Split-Path $PSScriptRoot -Parent) "resources"
New-Item -ItemType Directory -Force -Path $resourcesDir | Out-Null

$iconPath = Join-Path $resourcesDir "icon.png"
$bitmap = New-Object System.Drawing.Bitmap(256, 256)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([System.Drawing.Color]::FromArgb(9, 105, 218))

$font = New-Object System.Drawing.Font("Segoe UI", 72, [System.Drawing.FontStyle]::Bold)
$brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
$graphics.DrawString("TL", $font, $brush, 48, 78)

$bitmap.Save($iconPath, [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bitmap.Dispose()
$font.Dispose()
$brush.Dispose()

Write-Output "Created $iconPath"
