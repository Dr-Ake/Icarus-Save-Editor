# Icarus Save Editor

Double-click `launch-icarus-save-editor.bat` to start the local editor.

The app:

- Starts with `%LOCALAPPDATA%\Icarus\Saved\PlayerData`, but lets you point the editor at another `PlayerData` folder from the UI if the default path is wrong or missing
- Detects Steam account folders and character saves
- Lets you edit `Profile.json` currencies and character XP/state in the browser
- Lets you remove or restore `UnlockedFlags` from both the profile and individual characters without hand-editing JSON
- Surfaces current known meta currencies such as `Credits`, `Exotic1`, `Exotic_Red`, `Exotic_Uranium`, `Biomass`, `Licence`, and `Refund`
- Summarizes `Accolades.json`, `BestiaryData.json`, `Mounts.json`, and saved `Prospects\*.json` records in dedicated panels
- Lets you filter and open any `.json` file under the selected account without losing track of which file is actually loaded in the raw editor
- Creates a timestamped `.editorbackup_*` file before every save
- Lets you restore a backup over its original file or delete old backups when they start to pile up

Notes:

- Close Icarus before saving, or the game may overwrite your edits.
- Keep the PowerShell window open while using the editor.
- Opening `web\index.html` directly only shows a reminder to use the `.bat` file.
- Save detection is per-user: by default the server scans `%LOCALAPPDATA%\Icarus\Saved\PlayerData` on whatever Windows account launches it.
- If that path is missing on another PC, paste the correct `PlayerData` folder into the sidebar and click `Use This Folder`.
- You can still pre-set the location by starting `server.ps1 -SaveRoot "C:\Some\Other\PlayerData"` if needed.