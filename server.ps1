param(
    [int]$Port = 0,
    [switch]$NoBrowser,
    [string]$SaveRoot = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script:ScriptPath = if ($PSCommandPath) {
    $PSCommandPath
}
elseif ($MyInvocation.MyCommand -and $MyInvocation.MyCommand.PSObject.Properties['Path'] -and $MyInvocation.MyCommand.Path) {
    $MyInvocation.MyCommand.Path
}
else {
    Join-Path (Get-Location) 'server.ps1'
}

$script:RootDir = Split-Path -Parent $script:ScriptPath
$script:WebRoot = Join-Path $script:RootDir 'web'
$script:SaveRoot = if ([string]::IsNullOrWhiteSpace($SaveRoot)) {
    Join-Path $env:LOCALAPPDATA 'Icarus\Saved\PlayerData'
}
else {
    [System.IO.Path]::GetFullPath($SaveRoot)
}
$script:Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Write-Log {
    param([string]$Message)

    Write-Host ('[{0}] {1}' -f (Get-Date -Format 'HH:mm:ss'), $Message)
}

function Write-Utf8File {
    param(
        [string]$Path,
        [string]$Content
    )

    [System.IO.File]::WriteAllText($Path, $Content, $script:Utf8NoBom)
}

function Read-JsonFile {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        return $null
    }

    $content = [System.IO.File]::ReadAllText($Path)
    if ([string]::IsNullOrWhiteSpace($content)) {
        return $null
    }

    return $content | ConvertFrom-Json
}

function ConvertTo-JsonText {
    param([object]$Value)

    return ($Value | ConvertTo-Json -Depth 100)
}

function Assert-HttpMethod {
    param(
        [System.Net.HttpListenerRequest]$Request,
        [string]$Expected
    )

    if ($Request.HttpMethod -ne $Expected) {
        throw "Expected $Expected for $($Request.Url.AbsolutePath), got $($Request.HttpMethod)."
    }
}

function Get-RelativePath {
    param(
        [string]$BasePath,
        [string]$ChildPath
    )

    $baseFull = ([System.IO.Path]::GetFullPath($BasePath).TrimEnd('\')) + '\'
    $childFull = [System.IO.Path]::GetFullPath($ChildPath)

    if (-not $childFull.StartsWith($baseFull, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Path '$childFull' is not under '$baseFull'."
    }

    return $childFull.Substring($baseFull.Length).Replace('\', '/')
}

function Resolve-ChildPath {
    param(
        [string]$BasePath,
        [string]$RelativePath
    )

    if ([string]::IsNullOrWhiteSpace($RelativePath)) {
        throw 'A relative path is required.'
    }

    $candidate = [System.IO.Path]::GetFullPath((Join-Path $BasePath ($RelativePath.Replace('/', '\'))))
    $baseFull = ([System.IO.Path]::GetFullPath($BasePath).TrimEnd('\')) + '\'

    if (-not $candidate.StartsWith($baseFull, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Path '$RelativePath' escapes '$BasePath'."
    }

    return $candidate
}

function Get-AccountPath {
    param([string]$SteamId)

    if ([string]::IsNullOrWhiteSpace($SteamId) -or $SteamId -notmatch '^\d+$') {
        throw 'The account id must be a numeric Steam id.'
    }

    $accountPath = Join-Path $script:SaveRoot $SteamId
    if (-not (Test-Path -LiteralPath $accountPath -PathType Container)) {
        throw "No account folder was found for '$SteamId'."
    }

    return $accountPath
}

function Backup-File {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        return $null
    }

    $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $backupPath = "$Path.editorbackup_$timestamp"
    Copy-Item -LiteralPath $Path -Destination $backupPath -Force
    return [System.IO.Path]::GetFileName($backupPath)
}

function Test-BackupPath {
    param([string]$RelativePath)

    if ([string]::IsNullOrWhiteSpace($RelativePath)) {
        return $false
    }

    return ($RelativePath.Replace('\', '/') -match '\.editorbackup_\d{8}-\d{6}$')
}

function Read-StringifiedArrayFile {
    param(
        [string]$Path,
        [string]$RootProperty
    )

    $outer = Read-JsonFile -Path $Path
    if ($null -eq $outer) {
        return @()
    }

    $items = @($outer.$RootProperty)
    $result = @()

    foreach ($item in $items) {
        if ($null -eq $item) {
            continue
        }

        if ($item -is [string]) {
            $result += ($item | ConvertFrom-Json)
        }
        else {
            $result += $item
        }
    }

    return $result
}

function Write-StringifiedArrayFile {
    param(
        [string]$Path,
        [string]$RootProperty,
        [object[]]$Items
    )

    $payload = [ordered]@{}
    $payload[$RootProperty] = @()

    foreach ($item in @($Items)) {
        $payload[$RootProperty] += (ConvertTo-JsonText -Value $item)
    }

    $backup = Backup-File -Path $Path
    Write-Utf8File -Path $Path -Content (ConvertTo-JsonText -Value $payload)
    return $backup
}

function Read-Characters {
    param([string]$AccountPath)

    return @(Read-StringifiedArrayFile -Path (Join-Path $AccountPath 'Characters.json') -RootProperty 'Characters.json')
}

function Read-Profile {
    param([string]$AccountPath)

    return (Read-JsonFile -Path (Join-Path $AccountPath 'Profile.json'))
}

function Get-RowNameValue {
    param([object]$Value)

    if ($null -eq $Value) {
        return ''
    }

    if ($Value -is [string]) {
        if ($Value -match 'RowName="?([^",\)]+)"?') {
            return $Matches[1]
        }

        return $Value
    }

    if ($Value.PSObject.Properties['RowName']) {
        return [string]$Value.RowName
    }

    return [string]$Value
}

function Get-ItemDynamicValue {
    param(
        [object]$Item,
        [string]$PropertyType
    )

    foreach ($entry in @($Item.ItemDynamicData)) {
        if ($entry.PropertyType -eq $PropertyType) {
            return $entry.Value
        }
    }

    return $null
}

function Get-MetaInventorySummary {
    param([string]$AccountPath)

    $path = Join-Path $AccountPath 'MetaInventory.json'
    $json = Read-JsonFile -Path $path
    if ($null -eq $json) {
        return @()
    }

    $items = @()
    $index = 0

    foreach ($item in @($json.Items)) {
        $items += [pscustomobject]@{
            index        = $index
            rowName      = $item.ItemStaticData.RowName
            dataTable    = $item.ItemStaticData.DataTableName
            stack        = Get-ItemDynamicValue -Item $item -PropertyType 'ItemableStack'
            durability   = Get-ItemDynamicValue -Item $item -PropertyType 'Durability'
            databaseGuid = $item.DatabaseGUID
        }
        $index++
    }

    return $items
}

function Get-LoadoutSummary {
    param([string]$AccountPath)

    $path = Join-Path $AccountPath 'Loadout\Loadouts.json'
    $json = Read-JsonFile -Path $path
    if ($null -eq $json) {
        return @()
    }

    $summary = @()
    $index = 0

    foreach ($loadout in @($json.Loadouts)) {
        $associated = $loadout.AssociatedProspect
        $summary += [pscustomobject]@{
            index       = $index
            chrSlot     = $loadout.ChrSlot
            guid        = $loadout.Guid
            insured     = [bool]$loadout.bInsured
            settled     = [bool]$loadout.bSettled
            prospectId  = $associated.ProspectID
            prospectKey = $associated.ProspectDTKey
            difficulty  = $associated.Difficulty
            state       = $associated.ProspectState
            memberCount = @($associated.AssociatedMembers).Count
        }
        $index++
    }

    return $summary
}

function Get-AssociatedProspectSummary {
    param([string]$AccountPath)

    $files = Get-ChildItem -LiteralPath $AccountPath -File -Filter 'AssociatedProspects_Slot_*.json' -ErrorAction SilentlyContinue
    $summary = @()

    foreach ($file in @($files)) {
        $entries = @(Read-StringifiedArrayFile -Path $file.FullName -RootProperty $file.Name)
        foreach ($entry in $entries) {
            $summary += [pscustomobject]@{
                sourceFile   = $file.Name
                relativePath = $file.Name
                prospectId   = $entry.AssociatedProspect.ProspectID
                prospectKey  = $entry.AssociatedProspect.ProspectDTKey
                difficulty   = $entry.AssociatedProspect.Difficulty
                state        = $entry.AssociatedProspect.ProspectState
                memberCount  = @($entry.AssociatedProspect.AssociatedMembers).Count
                hostType     = $entry.HostedBy.LastHostType
            }
        }
    }

    return $summary
}

function Get-AccoladeSummary {
    param([string]$AccountPath)

    $path = Join-Path $AccountPath 'Accolades.json'
    $json = Read-JsonFile -Path $path
    if ($null -eq $json) {
        return [ordered]@{
            hasFile          = $false
            relativePath     = 'Accolades.json'
            completedCount   = 0
            trackerCount     = 0
            taskTrackerCount = 0
            recentCompleted  = @()
            topTrackers      = @()
        }
    }

    $completed = @($json.CompletedAccolades)
    $trackerProperties = @($json.PlayerTrackers.PSObject.Properties)
    $taskTrackerProperties = @($json.PlayerTaskListTrackers.PSObject.Properties)

    $recentCompleted = @(
        $completed |
            Select-Object -Last 8 |
            ForEach-Object {
                [pscustomobject]@{
                    rowName       = Get-RowNameValue -Value $_.Accolade
                    timeCompleted = $_.TimeCompleted
                    prospectId    = $_.ProspectID
                }
            }
    )

    $topTrackers = @(
        $trackerProperties |
            Where-Object { $_.Value -is [ValueType] } |
            Sort-Object { [double]$_.Value } -Descending |
            Select-Object -First 8 |
            ForEach-Object {
                [pscustomobject]@{
                    rowName = Get-RowNameValue -Value $_.Name
                    value   = $_.Value
                }
            }
    )

    return [ordered]@{
        hasFile          = $true
        relativePath     = 'Accolades.json'
        completedCount   = $completed.Count
        trackerCount     = $trackerProperties.Count
        taskTrackerCount = $taskTrackerProperties.Count
        recentCompleted  = $recentCompleted
        topTrackers      = $topTrackers
    }
}

function Get-BestiarySummary {
    param([string]$AccountPath)

    $path = Join-Path $AccountPath 'BestiaryData.json'
    $json = Read-JsonFile -Path $path
    if ($null -eq $json) {
        return [ordered]@{
            hasFile       = $false
            relativePath  = 'BestiaryData.json'
            creatureCount = 0
            fishCount     = 0
            totalPoints   = 0
            topCreatures  = @()
            topFish       = @()
        }
    }

    $creatures = @($json.BestiaryTracking)
    $fish = @($json.FishTracking)

    $totalPoints = 0
    foreach ($entry in $creatures) {
        $totalPoints += [int]$entry.NumPoints
    }
    foreach ($entry in $fish) {
        $totalPoints += [int]$entry.NumPoints
    }

    $topCreatures = @(
        $creatures |
            Sort-Object { [int]$_.NumPoints } -Descending |
            Select-Object -First 8 |
            ForEach-Object {
                [pscustomobject]@{
                    rowName = Get-RowNameValue -Value $_.BestiaryGroup
                    points  = [int]$_.NumPoints
                }
            }
    )

    $topFish = @(
        $fish |
            Sort-Object { [int]$_.NumPoints } -Descending |
            Select-Object -First 8 |
            ForEach-Object {
                [pscustomobject]@{
                    rowName = Get-RowNameValue -Value $_.BestiaryGroup
                    points  = [int]$_.NumPoints
                }
            }
    )

    return [ordered]@{
        hasFile       = $true
        relativePath  = 'BestiaryData.json'
        creatureCount = $creatures.Count
        fishCount     = $fish.Count
        totalPoints   = $totalPoints
        topCreatures  = $topCreatures
        topFish       = $topFish
    }
}

function Get-ProspectArchiveSummary {
    param([string]$AccountPath)

    $prospectsPath = Join-Path $AccountPath 'Prospects'
    if (-not (Test-Path -LiteralPath $prospectsPath -PathType Container)) {
        return [ordered]@{
            hasFolder     = $false
            relativePath  = 'Prospects'
            fileCount     = 0
            activeCount   = 0
            inactiveCount = 0
            missionCount  = 0
            entries       = @()
        }
    }

    $entries = @()
    $files = Get-ChildItem -LiteralPath $prospectsPath -File -Filter *.json -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending

    foreach ($file in @($files)) {
        $json = Read-JsonFile -Path $file.FullName
        if ($null -eq $json -or $null -eq $json.ProspectInfo) {
            continue
        }

        $info = $json.ProspectInfo
        $entries += [pscustomobject]@{
            sourceFile     = $file.Name
            relativePath   = Get-RelativePath -BasePath $AccountPath -ChildPath $file.FullName
            lastWriteTime  = $file.LastWriteTime.ToString('s')
            prospectId     = $info.ProspectID
            prospectKey    = $info.ProspectDTKey
            missionKey     = $info.FactionMissionDTKey
            state          = $info.ProspectState
            difficulty     = $info.Difficulty
            memberCount    = @($info.AssociatedMembers).Count
            claimedChar    = $info.ClaimedAccountCharacter
            insurance      = [bool]$info.Insurance
            noRespawns     = [bool]$info.NoRespawns
        }
    }

    $activeCount = @($entries | Where-Object { $_.state -eq 'Active' }).Count
    $missionCount = @(
        $entries |
            Where-Object { -not [string]::IsNullOrWhiteSpace($_.missionKey) } |
            Group-Object missionKey
    ).Count

    return [ordered]@{
        hasFolder     = $true
        relativePath  = 'Prospects'
        fileCount     = $entries.Count
        activeCount   = $activeCount
        inactiveCount = $entries.Count - $activeCount
        missionCount  = $missionCount
        entries       = $entries
    }
}

function Get-BackupFiles {
    param([string]$AccountPath)

    $files = Get-ChildItem -LiteralPath $AccountPath -Recurse -File -ErrorAction SilentlyContinue |
        Where-Object { Test-BackupPath -RelativePath $_.Name } |
        Sort-Object LastWriteTime -Descending

    $result = @()
    foreach ($file in $files) {
        $relativePath = Get-RelativePath -BasePath $AccountPath -ChildPath $file.FullName
        $sourceRelativePath = if ($relativePath -match '^(.*)\.editorbackup_\d{8}-\d{6}$') {
            $Matches[1]
        }
        else {
            $relativePath
        }

        $result += [pscustomobject]@{
            relativePath       = $relativePath
            sourceRelativePath = $sourceRelativePath
            name               = $file.Name
            size               = $file.Length
            lastWriteTime      = $file.LastWriteTime.ToString('s')
        }
    }

    return $result
}

function Remove-BackupFile {
    param(
        [string]$AccountPath,
        [string]$RelativePath
    )

    if (-not (Test-BackupPath -RelativePath $RelativePath)) {
        throw 'Only .editorbackup_* files created by this editor can be deleted here.'
    }

    $target = Resolve-ChildPath -BasePath $AccountPath -RelativePath $RelativePath
    if (-not (Test-Path -LiteralPath $target -PathType Leaf)) {
        throw "The backup file '$RelativePath' does not exist."
    }

    Remove-Item -LiteralPath $target -Force
}

function Get-JsonFiles {
    param([string]$AccountPath)

    $files = Get-ChildItem -LiteralPath $AccountPath -Recurse -File -Filter *.json -ErrorAction SilentlyContinue |
        Sort-Object FullName

    $result = @()
    foreach ($file in $files) {
        $result += [pscustomobject]@{
            relativePath  = Get-RelativePath -BasePath $AccountPath -ChildPath $file.FullName
            name          = $file.Name
            size          = $file.Length
            lastWriteTime = $file.LastWriteTime.ToString('s')
        }
    }

    return $result
}

function Get-Accounts {
    if (-not (Test-Path -LiteralPath $script:SaveRoot -PathType Container)) {
        return @()
    }

    $accounts = @()
    foreach ($dir in @(Get-ChildItem -LiteralPath $script:SaveRoot -Directory | Sort-Object Name)) {
        $characters = @(Read-Characters -AccountPath $dir.FullName)
        $accounts += [pscustomobject]@{
            steamId        = $dir.Name
            accountPath    = $dir.FullName
            characterCount = $characters.Count
            characterNames = @($characters | ForEach-Object { $_.CharacterName })
            hasProfile     = Test-Path -LiteralPath (Join-Path $dir.FullName 'Profile.json') -PathType Leaf
            hasInventory   = Test-Path -LiteralPath (Join-Path $dir.FullName 'MetaInventory.json') -PathType Leaf
        }
    }

    return $accounts
}

function Get-AccountBundle {
    param([string]$SteamId)

    $accountPath = Get-AccountPath -SteamId $SteamId

    return [ordered]@{
        saveRoot                  = $script:SaveRoot
        steamId                   = $SteamId
        accountPath               = $accountPath
        profile                   = Read-Profile -AccountPath $accountPath
        characters                = @(Read-Characters -AccountPath $accountPath)
        files                     = @(Get-JsonFiles -AccountPath $accountPath)
        metaInventorySummary      = @(Get-MetaInventorySummary -AccountPath $accountPath)
        loadoutSummary            = @(Get-LoadoutSummary -AccountPath $accountPath)
        associatedProspectSummary = @(Get-AssociatedProspectSummary -AccountPath $accountPath)
        accoladeSummary           = Get-AccoladeSummary -AccountPath $accountPath
        bestiarySummary           = Get-BestiarySummary -AccountPath $accountPath
        prospectArchiveSummary    = Get-ProspectArchiveSummary -AccountPath $accountPath
        backups                   = @(Get-BackupFiles -AccountPath $accountPath)
    }
}

function Read-RequestBody {
    param([System.Net.HttpListenerRequest]$Request)

    $reader = New-Object System.IO.StreamReader($Request.InputStream, $Request.ContentEncoding)
    try {
        return $reader.ReadToEnd()
    }
    finally {
        $reader.Close()
    }
}

function Read-RequestJson {
    param([System.Net.HttpListenerRequest]$Request)

    $body = Read-RequestBody -Request $Request
    if ([string]::IsNullOrWhiteSpace($body)) {
        throw 'The request body was empty.'
    }

    return ($body | ConvertFrom-Json)
}

function Send-Bytes {
    param(
        [System.Net.HttpListenerResponse]$Response,
        [int]$StatusCode,
        [byte[]]$Bytes,
        [string]$ContentType
    )

    $Response.StatusCode = $StatusCode
    $Response.ContentType = $ContentType
    $Response.ContentLength64 = $Bytes.Length
    $Response.OutputStream.Write($Bytes, 0, $Bytes.Length)
}

function Send-Json {
    param(
        [System.Net.HttpListenerResponse]$Response,
        [int]$StatusCode,
        [object]$Payload
    )

    $json = ConvertTo-JsonText -Value $Payload
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    Send-Bytes -Response $Response -StatusCode $StatusCode -Bytes $bytes -ContentType 'application/json; charset=utf-8'
}

function Send-Text {
    param(
        [System.Net.HttpListenerResponse]$Response,
        [int]$StatusCode,
        [string]$Text,
        [string]$ContentType = 'text/plain; charset=utf-8'
    )

    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Text)
    Send-Bytes -Response $Response -StatusCode $StatusCode -Bytes $bytes -ContentType $ContentType
}

function Send-Error {
    param(
        [System.Net.HttpListenerResponse]$Response,
        [int]$StatusCode,
        [string]$Message
    )

    Send-Json -Response $Response -StatusCode $StatusCode -Payload @{
        ok    = $false
        error = $Message
    }
}

function Get-StaticContentType {
    param([string]$Path)

    switch ([System.IO.Path]::GetExtension($Path).ToLowerInvariant()) {
        '.html' { return 'text/html; charset=utf-8' }
        '.css' { return 'text/css; charset=utf-8' }
        '.js' { return 'application/javascript; charset=utf-8' }
        '.json' { return 'application/json; charset=utf-8' }
        '.svg' { return 'image/svg+xml' }
        default { return 'application/octet-stream' }
    }
}

function Send-StaticFile {
    param(
        [System.Net.HttpListenerResponse]$Response,
        [string]$RequestPath
    )

    $relative = if ($RequestPath -eq '/') { 'index.html' } else { $RequestPath.TrimStart('/') }
    $target = Resolve-ChildPath -BasePath $script:WebRoot -RelativePath $relative

    if (-not (Test-Path -LiteralPath $target -PathType Leaf)) {
        throw [System.IO.FileNotFoundException]::new("Static file not found: $relative")
    }

    $bytes = [System.IO.File]::ReadAllBytes($target)
    Send-Bytes -Response $Response -StatusCode 200 -Bytes $bytes -ContentType (Get-StaticContentType -Path $target)
}

function Save-Profile {
    param(
        [string]$SteamId,
        [object]$Profile
    )

    $accountPath = Get-AccountPath -SteamId $SteamId
    $path = Join-Path $accountPath 'Profile.json'
    $backup = Backup-File -Path $path
    Write-Utf8File -Path $path -Content (ConvertTo-JsonText -Value $Profile)
    return $backup
}

function Save-Characters {
    param(
        [string]$SteamId,
        [object[]]$Characters
    )

    $accountPath = Get-AccountPath -SteamId $SteamId
    return (Write-StringifiedArrayFile -Path (Join-Path $accountPath 'Characters.json') -RootProperty 'Characters.json' -Items $Characters)
}

function Open-ExplorerTarget {
    param(
        [string]$SteamId,
        [string]$RelativePath
    )

    $accountPath = Get-AccountPath -SteamId $SteamId

    if ([string]::IsNullOrWhiteSpace($RelativePath)) {
        Start-Process explorer.exe -ArgumentList "`"$accountPath`""
        return
    }

    $target = Resolve-ChildPath -BasePath $accountPath -RelativePath $RelativePath
    if (Test-Path -LiteralPath $target -PathType Leaf) {
        Start-Process explorer.exe -ArgumentList "/select,`"$target`""
        return
    }

    if (Test-Path -LiteralPath $target -PathType Container) {
        Start-Process explorer.exe -ArgumentList "`"$target`""
        return
    }

    throw "The path '$RelativePath' does not exist."
}

function Get-AvailablePort {
    param(
        [int]$Start = 8765,
        [int]$End = 8799
    )

    for ($port = $Start; $port -le $End; $port++) {
        $tcp = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $port)
        try {
            $tcp.Start()
            $tcp.Stop()
            return $port
        }
        catch {
            continue
        }
    }

    throw 'No open localhost port was found for the editor.'
}

function Handle-ApiRequest {
    param([System.Net.HttpListenerContext]$Context)

    $request = $Context.Request
    $response = $Context.Response
    $path = $request.Url.AbsolutePath

    switch -Regex ($path) {
        '^/api/health/?$' {
            Assert-HttpMethod -Request $request -Expected 'GET'
            Send-Json -Response $response -StatusCode 200 -Payload @{
                ok = $true
            }
            return
        }

        '^/api/accounts/?$' {
            Assert-HttpMethod -Request $request -Expected 'GET'
            Send-Json -Response $response -StatusCode 200 -Payload @{
                ok       = $true
                saveRoot = $script:SaveRoot
                accounts = @(Get-Accounts)
            }
            return
        }

        '^/api/account/([^/]+)/?$' {
            Assert-HttpMethod -Request $request -Expected 'GET'
            $steamId = [System.Uri]::UnescapeDataString($Matches[1])
            Send-Json -Response $response -StatusCode 200 -Payload @{
                ok   = $true
                data = Get-AccountBundle -SteamId $steamId
            }
            return
        }

        '^/api/account/([^/]+)/profile/?$' {
            Assert-HttpMethod -Request $request -Expected 'POST'
            $steamId = [System.Uri]::UnescapeDataString($Matches[1])
            $body = Read-RequestJson -Request $request
            $backup = Save-Profile -SteamId $steamId -Profile $body.profile
            Send-Json -Response $response -StatusCode 200 -Payload @{
                ok     = $true
                backup = $backup
            }
            return
        }

        '^/api/account/([^/]+)/characters/?$' {
            Assert-HttpMethod -Request $request -Expected 'POST'
            $steamId = [System.Uri]::UnescapeDataString($Matches[1])
            $body = Read-RequestJson -Request $request
            $backup = Save-Characters -SteamId $steamId -Characters @($body.characters)
            Send-Json -Response $response -StatusCode 200 -Payload @{
                ok     = $true
                backup = $backup
            }
            return
        }

        '^/api/account/([^/]+)/backup/delete/?$' {
            Assert-HttpMethod -Request $request -Expected 'POST'
            $steamId = [System.Uri]::UnescapeDataString($Matches[1])
            $body = Read-RequestJson -Request $request
            $accountPath = Get-AccountPath -SteamId $steamId
            Remove-BackupFile -AccountPath $accountPath -RelativePath $body.relativePath
            Send-Json -Response $response -StatusCode 200 -Payload @{
                ok           = $true
                relativePath = $body.relativePath
            }
            return
        }

        '^/api/account/([^/]+)/backups/delete-all/?$' {
            Assert-HttpMethod -Request $request -Expected 'POST'
            $steamId = [System.Uri]::UnescapeDataString($Matches[1])
            $accountPath = Get-AccountPath -SteamId $steamId
            $backups = @(Get-BackupFiles -AccountPath $accountPath)

            foreach ($backup in $backups) {
                Remove-BackupFile -AccountPath $accountPath -RelativePath $backup.relativePath
            }

            Send-Json -Response $response -StatusCode 200 -Payload @{
                ok           = $true
                deletedCount = $backups.Count
            }
            return
        }

        '^/api/file/?$' {
            if ($request.HttpMethod -eq 'GET') {
                $steamId = $request.QueryString['accountId']
                $relativePath = $request.QueryString['path']
                $accountPath = Get-AccountPath -SteamId $steamId
                $target = Resolve-ChildPath -BasePath $accountPath -RelativePath $relativePath

                if (-not (Test-Path -LiteralPath $target -PathType Leaf)) {
                    throw "The file '$relativePath' does not exist."
                }

                Send-Json -Response $response -StatusCode 200 -Payload @{
                    ok            = $true
                    relativePath  = $relativePath
                    content       = [System.IO.File]::ReadAllText($target)
                    size          = (Get-Item -LiteralPath $target).Length
                    lastWriteTime = (Get-Item -LiteralPath $target).LastWriteTime.ToString('s')
                }
                return
            }

            if ($request.HttpMethod -eq 'POST') {
                $body = Read-RequestJson -Request $request
                $accountPath = Get-AccountPath -SteamId $body.accountId
                $target = Resolve-ChildPath -BasePath $accountPath -RelativePath $body.relativePath

                if ([System.IO.Path]::GetExtension($target).ToLowerInvariant() -ne '.json') {
                    throw 'Only JSON files can be edited from the browser UI.'
                }

                $null = ($body.content | ConvertFrom-Json)
                $backup = Backup-File -Path $target
                Write-Utf8File -Path $target -Content $body.content

                Send-Json -Response $response -StatusCode 200 -Payload @{
                    ok     = $true
                    backup = $backup
                }
                return
            }

            throw "Unsupported method $($request.HttpMethod) for /api/file."
        }

        '^/api/open-folder/?$' {
            Assert-HttpMethod -Request $request -Expected 'POST'
            $body = Read-RequestJson -Request $request
            Open-ExplorerTarget -SteamId $body.accountId -RelativePath $body.relativePath
            Send-Json -Response $response -StatusCode 200 -Payload @{
                ok = $true
            }
            return
        }

        default {
            if ($path.StartsWith('/api/', [System.StringComparison]::OrdinalIgnoreCase)) {
                Send-Error -Response $response -StatusCode 404 -Message "Unknown API route: $path"
                return
            }

            Send-StaticFile -Response $response -RequestPath $path
        }
    }
}

if (-not (Test-Path -LiteralPath $script:WebRoot -PathType Container)) {
    throw "The web directory was not found at '$script:WebRoot'."
}

$port = if ($Port -gt 0) { $Port } else { Get-AvailablePort }
$url = "http://127.0.0.1:$port/"
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add($url)
$listener.Start()

Write-Log "Icarus Save Editor listening at $url"
Write-Log "Save root: $script:SaveRoot"
Write-Log 'Close this window when you are done using the editor.'

if (-not $NoBrowser) {
    Start-Process $url | Out-Null
}

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        try {
            Handle-ApiRequest -Context $context
        }
        catch [System.IO.FileNotFoundException] {
            Send-Text -Response $context.Response -StatusCode 404 -Text $_.Exception.Message
        }
        catch {
            Write-Log $_.Exception.Message
            Send-Error -Response $context.Response -StatusCode 500 -Message $_.Exception.Message
        }
        finally {
            $context.Response.OutputStream.Close()
            $context.Response.Close()
        }
    }
}
finally {
    if ($listener.IsListening) {
        $listener.Stop()
    }
    $listener.Close()
}
