# WareServer Manager

A stylish Electron desktop app for managing local Minecraft servers. Built with the Skyware dark aesthetic.

## Requirements

- Node.js v18+
- Java 21 (must be on PATH, or set a custom path in Settings)

## Running in dev mode

```bash
npm install
npm start
```

## Building an installer

```bash
# Windows (.exe installer)
npm run build-win

# macOS (.dmg)
npm run build-mac

# Linux (.AppImage)
npm run build-linux
```

Output goes to the `dist/` folder.

## Usage

1. Click **＋ New Server**
2. Browse for your Paper `.jar` and server folder using the Browse buttons
3. Set RAM and port, click **Create Server**
4. Click **▶ Start Server**
5. **Console** tab — live logs + send commands
6. **Files** tab — browse server folder, drag & drop to upload
7. **Settings** — persists between sessions automatically

## Tips

- Click `localhost:25565` on the dashboard to copy the address
- Drag files directly onto the Files tab drop zone to upload them
- Use `/deathtoll set <player> <amount>` in the console to test your plugin
