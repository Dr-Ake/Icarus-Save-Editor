# Icarus Save Editor

Double-click `launch-icarus-save-editor.bat` to start the local editor.

The app:

- Scans `%LOCALAPPDATA%\Icarus\Saved\PlayerData`
- Detects Steam account folders and character saves
- Lets you edit `Profile.json` currencies and character XP/state in the browser
- Lets you remove or restore `UnlockedFlags` from both the profile and individual characters without hand-editing JSON
- Surfaces current known meta currencies such as `Credits`, `Exotic1`, `Exotic_Red`, `Exotic_Uranium`, `Biomass`, `Licence`, and `Refund`
- Summarizes `Accolades.json`, `BestiaryData.json`, and saved `Prospects\*.json` records in dedicated panels
- Lets you open and edit any `.json` file under the selected account
- Creates a timestamped `.editorbackup_*` file before every save

Notes:

- Close Icarus before saving, or the game may overwrite your edits.
- Keep the PowerShell window open while using the editor.
- Opening `web\index.html` directly only shows a reminder to use the `.bat` file.
- Save detection is per-user: by default the server scans `%LOCALAPPDATA%\Icarus\Saved\PlayerData` on whatever Windows account launches it.
- You can also override the auto-detected location by starting `server.ps1 -SaveRoot "C:\Some\Other\PlayerData"` if needed.
