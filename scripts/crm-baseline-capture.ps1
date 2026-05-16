param(
  [string]$BaseUrl = "http://localhost:4001",
  [string]$Email = "demo@agenzia.com",
  [string]$Password = "demo123"
)

$ErrorActionPreference = "Stop"

function Write-JsonFile {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)]$Data
  )
  $json = $Data | ConvertTo-Json -Depth 20
  Set-Content -LiteralPath $Path -Value $json -Encoding UTF8
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$outDir = Join-Path -Path "tmp" -ChildPath "baseline-$timestamp"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$loginBody = @{
  email = $Email
  password = $Password
} | ConvertTo-Json

try {
  $loginRes = Invoke-RestMethod -Method POST -Uri "$BaseUrl/api/auth/login" -Body $loginBody -ContentType "application/json"
} catch {
  Write-Error "Login failed on $BaseUrl/api/auth/login. $_"
  exit 1
}

if (-not $loginRes.success -or -not $loginRes.token) {
  Write-Error "Login response does not contain success/token."
  exit 1
}

$headers = @{
  Authorization = "Bearer $($loginRes.token)"
}

$endpoints = @(
  "/api/appointments",
  "/api/activities",
  "/api/activities/types",
  "/api/agent-zones",
  "/api/geo/locations",
  "/api/geo/pescara-caps"
)

foreach ($endpoint in $endpoints) {
  $safeName = ($endpoint.TrimStart("/") -replace "[^a-zA-Z0-9\-_]", "_")
  $target = Join-Path -Path $outDir -ChildPath "$safeName.json"
  try {
    $res = Invoke-RestMethod -Method GET -Uri "$BaseUrl$endpoint" -Headers $headers
    Write-JsonFile -Path $target -Data $res
  } catch {
    Write-JsonFile -Path $target -Data @{ success = $false; endpoint = $endpoint; error = "$_" }
  }
}

$meta = @{
  capturedAt = (Get-Date).ToString("o")
  baseUrl = $BaseUrl
  email = $Email
  files = (Get-ChildItem -Path $outDir -File | Select-Object -ExpandProperty Name)
}
Write-JsonFile -Path (Join-Path -Path $outDir -ChildPath "_meta.json") -Data $meta

Write-Host "Baseline capture completed: $outDir"
