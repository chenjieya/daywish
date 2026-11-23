$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$root = Split-Path $PSScriptRoot -Parent
$image = New-Object System.Drawing.Bitmap 256,256
$graphics = [System.Drawing.Graphics]::FromImage($image)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([System.Drawing.Color]::Transparent)
$background = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255,47,83,74))
$sun = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255,248,216,156))
$pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255,248,216,156)),12
$graphics.FillEllipse($background,4,4,248,248)
$graphics.FillPie($sun,72,73,112,112,180,180)
$graphics.DrawLine($pen,57,141,199,141)
$graphics.DrawLine($pen,85,166,171,166)
$graphics.DrawLine($pen,128,41,128,57)
$graphics.DrawLine($pen,53,75,66,88)
$graphics.DrawLine($pen,190,88,203,75)
New-Item -ItemType Directory -Force (Join-Path $root 'public') | Out-Null
$image.Save((Join-Path $root 'public/icon.png'),[System.Drawing.Imaging.ImageFormat]::Png)
$pngBytes = [IO.File]::ReadAllBytes((Join-Path $root 'public/icon.png'))
$iconStream = [IO.File]::Create((Join-Path $root 'public/icon.ico'))
$writer = New-Object IO.BinaryWriter $iconStream
$writer.Write([UInt16]0)
$writer.Write([UInt16]1)
$writer.Write([UInt16]1)
$writer.Write([byte]0)
$writer.Write([byte]0)
$writer.Write([byte]0)
$writer.Write([byte]0)
$writer.Write([UInt16]1)
$writer.Write([UInt16]32)
$writer.Write([UInt32]$pngBytes.Length)
$writer.Write([UInt32]22)
$writer.Write($pngBytes)
$writer.Dispose()
$pen.Dispose()
$sun.Dispose()
$background.Dispose()
$graphics.Dispose()
$image.Dispose()
