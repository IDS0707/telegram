Add-Type -AssemblyName System.Drawing

function New-Brush([string]$hex) {
  New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml($hex))
}

$iconPath = Join-Path $PWD 'assets\icon.png'
$adaptivePath = Join-Path $PWD 'assets\adaptive-icon.png'
$splashPath = Join-Path $PWD 'assets\splash.png'

$icon = New-Object System.Drawing.Bitmap 1024, 1024
$g = [System.Drawing.Graphics]::FromImage($icon)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$rect = New-Object System.Drawing.Rectangle 0, 0, 1024, 1024
$bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, ([System.Drawing.ColorTranslator]::FromHtml('#0F7BDC')), ([System.Drawing.ColorTranslator]::FromHtml('#37B4FF')), 45
$g.FillRectangle($bg, $rect)
$shadowBrush = New-Brush '#1A4F8B'
$g.FillEllipse($shadowBrush, 182, 182, 664, 664)
$circleBrush = New-Brush '#FFFFFF'
$g.FillEllipse($circleBrush, 160, 160, 664, 664)
$font = New-Object System.Drawing.Font 'Segoe UI', 360, ([System.Drawing.FontStyle]::Bold)
$stringBrush = New-Brush '#0F7BDC'
$sf = New-Object System.Drawing.StringFormat
$sf.Alignment = [System.Drawing.StringAlignment]::Center
$sf.LineAlignment = [System.Drawing.StringAlignment]::Center
$g.DrawString('B', $font, $stringBrush, (New-Object System.Drawing.RectangleF 160, 110, 664, 620), $sf)
$smallFont = New-Object System.Drawing.Font 'Segoe UI', 64, ([System.Drawing.FontStyle]::Bold)
$smallBrush = New-Brush '#EAF6FF'
$g.DrawString('Babuchat', $smallFont, $smallBrush, (New-Object System.Drawing.RectangleF 0, 842, 1024, 100), $sf)
$icon.Save($iconPath, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $icon.Dispose(); $bg.Dispose(); $shadowBrush.Dispose(); $circleBrush.Dispose(); $stringBrush.Dispose(); $smallBrush.Dispose(); $font.Dispose(); $smallFont.Dispose(); $sf.Dispose()

$adaptive = New-Object System.Drawing.Bitmap 1024, 1024
$g2 = [System.Drawing.Graphics]::FromImage($adaptive)
$g2.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g2.Clear([System.Drawing.ColorTranslator]::FromHtml('#0088CC'))
$ringBrush = New-Brush '#FFFFFF'
$innerBrush = New-Brush '#0F7BDC'
$g2.FillEllipse($ringBrush, 176, 176, 672, 672)
$g2.FillEllipse($innerBrush, 236, 236, 552, 552)
$font2 = New-Object System.Drawing.Font 'Segoe UI', 320, ([System.Drawing.FontStyle]::Bold)
$textBrush2 = New-Brush '#FFFFFF'
$sf2 = New-Object System.Drawing.StringFormat
$sf2.Alignment = [System.Drawing.StringAlignment]::Center
$sf2.LineAlignment = [System.Drawing.StringAlignment]::Center
$g2.DrawString('B', $font2, $textBrush2, (New-Object System.Drawing.RectangleF 236, 190, 552, 520), $sf2)
$adaptive.Save($adaptivePath, [System.Drawing.Imaging.ImageFormat]::Png)
$g2.Dispose(); $adaptive.Dispose(); $ringBrush.Dispose(); $innerBrush.Dispose(); $font2.Dispose(); $textBrush2.Dispose(); $sf2.Dispose()

$splash = New-Object System.Drawing.Bitmap 1242, 2436
$g3 = [System.Drawing.Graphics]::FromImage($splash)
$g3.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$rect3 = New-Object System.Drawing.Rectangle 0, 0, 1242, 2436
$bg3 = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect3, ([System.Drawing.ColorTranslator]::FromHtml('#EAF7FF')), ([System.Drawing.ColorTranslator]::FromHtml('#C8ECFF')), 90
$g3.FillRectangle($bg3, $rect3)
$mainBrush = New-Brush '#0088CC'
$accentBrush = New-Brush '#FFFFFF'
$g3.FillEllipse($mainBrush, 321, 700, 600, 600)
$g3.FillEllipse($accentBrush, 381, 760, 480, 480)
$font3 = New-Object System.Drawing.Font 'Segoe UI', 250, ([System.Drawing.FontStyle]::Bold)
$textBrush3 = New-Brush '#0088CC'
$sf3 = New-Object System.Drawing.StringFormat
$sf3.Alignment = [System.Drawing.StringAlignment]::Center
$sf3.LineAlignment = [System.Drawing.StringAlignment]::Center
$g3.DrawString('B', $font3, $textBrush3, (New-Object System.Drawing.RectangleF 381, 720, 480, 420), $sf3)
$titleFont = New-Object System.Drawing.Font 'Segoe UI', 96, ([System.Drawing.FontStyle]::Bold)
$subtitleFont = New-Object System.Drawing.Font 'Segoe UI', 32, ([System.Drawing.FontStyle]::Regular)
$titleBrush = New-Brush '#0B3552'
$subtitleBrush = New-Brush '#4B6B80'
$g3.DrawString('Babuchat', $titleFont, $titleBrush, (New-Object System.Drawing.RectangleF 0, 1410, 1242, 120), $sf3)
$g3.DrawString('fast chats, clear calls', $subtitleFont, $subtitleBrush, (New-Object System.Drawing.RectangleF 0, 1550, 1242, 80), $sf3)
$splash.Save($splashPath, [System.Drawing.Imaging.ImageFormat]::Png)
$g3.Dispose(); $splash.Dispose(); $bg3.Dispose(); $mainBrush.Dispose(); $accentBrush.Dispose(); $font3.Dispose(); $textBrush3.Dispose(); $sf3.Dispose(); $titleFont.Dispose(); $subtitleFont.Dispose(); $titleBrush.Dispose(); $subtitleBrush.Dispose()

Write-Output 'ASSETS_REGENERATED'
