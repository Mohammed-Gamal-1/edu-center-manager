$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js 22.13 or newer is required."
}

$username = Read-Host "Local admin username (leave blank to use the migrated username)"
$securePin = Read-Host "Local admin PIN (4 digits)" -AsSecureString
$pinPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePin)

try {
  $env:LOCAL_ADMIN_PIN = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pinPointer)
  if ($env:LOCAL_ADMIN_PIN -notmatch '^\d{4}$') { throw "PIN must contain exactly 4 digits." }

  if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot "node_modules"))) {
    npm install
    if ($LASTEXITCODE -ne 0) { throw "npm install failed." }
  }
  npm run build
  if ($LASTEXITCODE -ne 0) { throw "Application build failed." }
  if ([string]::IsNullOrWhiteSpace($username)) {
    npm run local:setup
  } else {
    npm run local:setup -- --username $username
  }
  if ($LASTEXITCODE -ne 0) { throw "Local admin setup failed." }

  Write-Host ""
  Write-Host "Setup finished. Double-click start-local-center.cmd to run the center."
} finally {
  $env:LOCAL_ADMIN_PIN = $null
  if ($pinPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pinPointer) }
}
