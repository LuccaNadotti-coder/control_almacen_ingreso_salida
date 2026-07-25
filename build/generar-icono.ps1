Add-Type -AssemblyName System.Drawing

$sizes = 16, 24, 32, 48, 64, 128, 256
$wine = [System.Drawing.Color]::FromArgb(255, 0x9B, 0x2E, 0x48)
$wineSoft = [System.Drawing.Color]::FromArgb(255, 0x3A, 0x1A, 0x24)
$text = [System.Drawing.Color]::White

$pngBytesBySize = @{}

foreach ($size in $sizes) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::Transparent)

  $radius = [Math]::Max(2, [int]($size * 0.18))
  $rect = New-Object System.Drawing.Rectangle 0, 0, $size, $size
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $radius * 2
  $path.AddArc($rect.X, $rect.Y, $d, $d, 180, 90)
  $path.AddArc($rect.Right - $d, $rect.Y, $d, $d, 270, 90)
  $path.AddArc($rect.Right - $d, $rect.Bottom - $d, $d, $d, 0, 90)
  $path.AddArc($rect.X, $rect.Bottom - $d, $d, $d, 90, 90)
  $path.CloseFigure()

  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $wine, $wineSoft, 45)
  $g.FillPath($brush, $path)

  $fontSize = [Math]::Max(6, [int]($size * 0.56))
  $font = New-Object System.Drawing.Font("Georgia", $fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $sf = New-Object System.Drawing.StringFormat
  $sf.Alignment = [System.Drawing.StringAlignment]::Center
  $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
  $textBrush = New-Object System.Drawing.SolidBrush($text)
  $offsetY = [int]($size * -0.02)
  $g.DrawString("S", $font, $textBrush, [float]($size / 2), [float]($size / 2 + $offsetY), $sf)

  $g.Dispose()

  if ($size -eq 256) {
    $bmp.Save("$PSScriptRoot\icon.png", [System.Drawing.Imaging.ImageFormat]::Png)
  }

  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $pngBytesBySize[$size] = $ms.ToArray()
  $ms.Dispose()
  $bmp.Dispose()
}

$icoPath = "$PSScriptRoot\icon.ico"
$fs = [System.IO.File]::Create($icoPath)
$bw = New-Object System.IO.BinaryWriter($fs)

$count = $sizes.Count
$bw.Write([UInt16]0)      # reserved
$bw.Write([UInt16]1)      # type: icon
$bw.Write([UInt16]$count) # image count

$headerSize = 6 + (16 * $count)
$offset = $headerSize

foreach ($size in $sizes) {
  $bytes = $pngBytesBySize[$size]
  $wByte = if ($size -ge 256) { 0 } else { $size }
  $hByte = if ($size -ge 256) { 0 } else { $size }
  $bw.Write([byte]$wByte)
  $bw.Write([byte]$hByte)
  $bw.Write([byte]0)       # color count
  $bw.Write([byte]0)       # reserved
  $bw.Write([UInt16]1)     # planes
  $bw.Write([UInt16]32)    # bit count
  $bw.Write([UInt32]$bytes.Length)
  $bw.Write([UInt32]$offset)
  $offset += $bytes.Length
}

foreach ($size in $sizes) {
  $bw.Write($pngBytesBySize[$size])
}

$bw.Flush()
$bw.Close()
$fs.Close()

Write-Output "OK: $icoPath"
