# Regenerate local junctions (Windows) if missing after clone

# .agent -> .agents
if (!(Test-Path .agent)) {
  cmd /c "mklink /J .agent .agents"
}

# Cursor discovers .cursor/skills/*
New-Item -ItemType Directory -Force -Path .cursor\skills | Out-Null
Get-ChildItem .agents\skills -Directory | ForEach-Object {
  $dest = Join-Path ".cursor\skills" $_.Name
  if (Test-Path $dest) { Remove-Item $dest -Force -Recurse -ErrorAction SilentlyContinue }
  cmd /c "mklink /J `"$dest`" `"$($_.FullName)`""
}

Write-Host "Linked .agent and .cursor/skills -> .agents/skills"
