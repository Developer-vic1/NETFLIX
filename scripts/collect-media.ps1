# Technical asset preparation from verified public first-party pages.
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Path 'assets/posters','assets/backgrounds','assets/title-art' -Force | Out-Null
$catalogSources = @(
  @{ id='sintel'; name='Sintel'; slug='sintel'; uuid='0eb052d0-fd51-43e6-aa33-ecdbf77a5d40'; year=2010; type='movies' },
  @{ id='spring'; name='Spring'; slug='spring'; uuid='3d95fb3d-c866-42c8-9db1-fe82f48ccb95'; year=2019; type='movies' },
  @{ id='big-buck-bunny'; name='Big Buck Bunny'; slug='big-buck-bunny'; uuid='bf1f3fb5-b119-4f9f-9930-8e20e892b898'; year=2008; type='movies' },
  @{ id='tears-of-steel'; name='Tears of Steel'; slug='tears-of-steel'; uuid='8533ea43-4271-4a57-9694-e9d0b35e1aa1'; year=2012; type='movies' },
  @{ id='elephants-dream'; name='Elephants Dream'; slug='elephants-dream'; uuid='cccc3e60-0291-4ecc-aa56-39b2e2c7d0d5'; year=2006; type='movies' },
  @{ id='caminandes-2'; name='Caminandes 2: Gran Dillama'; slug='caminandes-2'; uuid='fb70d459-48d2-4db5-adba-813c84f9200a'; year=2013; type='series' },
  @{ id='caminandes-3'; name='Caminandes 3: Llamigos'; slug='caminandes-3'; uuid='23f3ef79-15dc-44c5-aa45-cf92e78a4509'; year=2016; type='series' },
  @{ id='making-of-caminandes'; name='Making of Caminandes: Llamigos'; slug='caminandes-3'; uuid='515fa4ff-7038-42a3-9e1b-ef7154bd7398'; year=2016; type='documentaries' }
)
$catalog = @()
foreach ($filmSource in $catalogSources) {
  $sourcePage = 'https://studio.blender.org/films/' + $filmSource.slug + '/'
  $pageContent = (Invoke-WebRequest -Uri $sourcePage).Content
  $imageSource = [regex]::Match($pageContent,'<meta property="og:image" content="([^"]+)"').Groups[1].Value
  $detail = Invoke-RestMethod -Uri ('https://video.blender.org/api/v1/videos/'+$filmSource.uuid)
  $mediaFiles = @($detail.files)
  if (-not $mediaFiles.Count) { $mediaFiles = @($detail.streamingPlaylists | ForEach-Object { $_.files }) }
  $qualities = @($mediaFiles | Where-Object { $_.resolution.id -ge 240 -and $_.resolution.id -le 1080 } | Sort-Object { $_.resolution.id } | ForEach-Object {
    @{ quality=$_.resolution.label; url=$_.fileUrl; bytes=$_.size }
  })
  if (-not $qualities.Count) { throw ('No MP4 source for '+$filmSource.name) }
  $posterPath = 'assets/posters/'+$filmSource.id+'.webp'
  Invoke-WebRequest -Uri $imageSource -OutFile $posterPath
  $record = [ordered]@{ id=$filmSource.id; name=$filmSource.name; year=$filmSource.year; type=$filmSource.type; duration=$detail.duration; poster=$posterPath; source=$sourcePage; watchSource=$detail.url; imageSource=$imageSource; qualities=$qualities; descriptionKey=('film.'+$filmSource.id); isNew=($filmSource.year -ge 2016); creator='Blender Foundation / Blender Studio'; licenseSource='https://studio.blender.org/remixing/' }
  $catalog += $record
  if ($filmSource.id -eq 'sintel') {
    $heroImage = [regex]::Match($pageContent,'https://studio.blender.org/files/public/header/project/[^\s"''<>]+').Value
    Invoke-WebRequest -Uri $heroImage -OutFile 'assets/backgrounds/sintel.png'
    $titleArt = [regex]::Match($pageContent,'https://studio.blender.org/files/public/logo/[^\s"''<>]+').Value
    Invoke-WebRequest -Uri $titleArt -OutFile 'assets/title-art/sintel.png'
  }
  Write-Output ($filmSource.name+' : '+$qualities.Count+' playback sources')
}
$catalog | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath 'assets/catalog-sources.json' -Encoding utf8
$jsSource = 'export const titles = Object.freeze(' + ($catalog | ConvertTo-Json -Depth 10) + '.map(Object.freeze));'
[System.IO.File]::WriteAllText((Join-Path (Get-Location) 'js/data/titles.js'), $jsSource, [System.Text.UTF8Encoding]::new($false))
