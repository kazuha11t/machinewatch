# Auto-start MachineWatch on this laptop

Goal: after logging into Windows, the backend + AI service are already running and the phone
app just opens and shows live data — no terminal, no `npm run dev` / `uvicorn` each time.

## What's already set up

- `backend/.env` — a real `JWT_SECRET`, `NODE_ENV=production`, `EMBEDDED_BROKER=true` (so no
  separate Mosquitto install is needed; the backend runs its own broker on port 1883, same as
  `EMBEDDED_BROKER=true npm run dev` in the README quick start).
- `start.ps1` — launches `ai-service` (uvicorn, port 8000), the backend (`node src/server.ts`,
  port 4000) and the web dashboard (`vite preview`, port 5173, serving the prebuilt `web/dist`)
  hidden in the background, logging to `scripts/autostart/logs/`.
- `stop.ps1` — stops all three.
- `register.ps1` — registers a Scheduled Task ("MachineWatch AutoStart") that runs `start.ps1`
  ~30s after you log into Windows, then runs it once immediately.
- `unregister.ps1` — removes the scheduled task and stops the processes.
- `mobile/eas.json` — a `production` build profile that bakes the backend's LAN URL
  (`http://<your-LAN-IP>:4000`, stored on EAS as `EXPO_PUBLIC_API_URL`, see step 4) into a
  standalone Android build, so the installed app never needs Metro/`expo start` running.
- `web/dist` — a production build of the dashboard (`VITE_API_URL=http://<your-LAN-IP>:4000 npm
  run build` in `web/`), so it talks straight to the backend over the LAN instead of relying on
  Vite's dev-only `/api` proxy.

`<your-LAN-IP>` below means this laptop's IPv4 address on your Wi-Fi/LAN (`ipconfig`). Optionally
set it once as a user environment variable, `[Environment]::SetEnvironmentVariable('MACHINEWATCH_LAN_IP', '<your-LAN-IP>', 'User')`,
so `start.ps1` can print the exact web build command if `web/dist` is missing.

## One-time setup (run these yourself)

**1. Register the auto-start task** — normal (non-admin) PowerShell:
```powershell
cd scripts\autostart
.\register.ps1
```

**2. Open the firewall** for the backend + MQTT ports, so your phone and ESP32 nodes on the LAN
can reach this laptop. This needs an elevated PowerShell (Run as Administrator):
```powershell
New-NetFirewallRule -DisplayName "MachineWatch API" -Direction Inbound -Protocol TCP -LocalPort 4000 -Action Allow
New-NetFirewallRule -DisplayName "MachineWatch MQTT" -Direction Inbound -Protocol TCP -LocalPort 1883 -Action Allow
New-NetFirewallRule -DisplayName "MachineWatch Web" -Direction Inbound -Protocol TCP -LocalPort 5173 -Action Allow
```

**3. Give the laptop a fixed LAN IP**, otherwise the address baked into the phone app (and the
one your ESP32 nodes are configured with) will break next time your router hands out a different
IP. Easiest option: log into your router and add a **DHCP reservation** for this laptop's MAC
address, pinned to its current address (`<your-LAN-IP>`). Alternative: set a static IP in Windows
network adapter settings. If the IP changes, update the EAS variable (step 4) and rebuild both the
app and `web/dist`.

**4. Build the standalone Android app** (needs a free Expo account):
```powershell
cd mobile
npx eas-cli login          # once, interactive
npx eas-cli init           # once, links this project to your Expo account (fills app.json's eas.projectId)
npx eas-cli env:set --name EXPO_PUBLIC_API_URL --value http://<your-LAN-IP>:4000 --environment production --visibility plaintext
npx eas-cli build -p android --profile production
```
The cloud build only sees variables stored on EAS (not your shell or a `.env` file), which is why
`env:set` comes first; the `production` profile reads the `production` EAS environment.
`eas build` uploads and builds in the cloud; when it finishes it gives you a download link/QR for
an `.apk`. Download it on the phone and install it (allow "install from unknown sources" once).
From then on, opening the app talks straight to `http://<your-LAN-IP>:4000` — no laptop terminal
needed, only the laptop being on and logged in with MachineWatch auto-started.

## Day to day

- Laptop boots → log in → wait ~30s → backend/AI/web are up. Open the app on the phone, or
  `http://<your-LAN-IP>:5173` in a browser on any device on the same LAN for the dashboard.
- Check logs: `scripts/autostart/logs/{backend,ai-service,web}.log` (and the matching `.err.log`).
- Manually stop/restart: `.\stop.ps1` then `.\start.ps1`.
- Remove auto-start entirely: `.\unregister.ps1`.
- After pulling changes to `web/`, rebuild it before the new version shows up (`start.ps1` serves
  whatever is already in `web/dist`, it does not rebuild):
  ```powershell
  cd web
  $env:VITE_API_URL = "http://<your-LAN-IP>:4000"
  npm run build
  cd ..\scripts\autostart
  .\stop.ps1; .\start.ps1
  ```

## Known limits of this setup

- The laptop must be powered on and logged in (not fully shut down) for the phone app to reach
  it — a Scheduled Task at logon does not run while the machine is off. If you later want the
  system reachable even when the laptop is off, that needs a different host (an always-on
  Raspberry Pi/mini PC or a cloud VPS) — ask if you want that path set up instead.
- The phone must be on the same Wi-Fi/LAN as the laptop (no port-forwarding/VPN is configured),
  matching how the ESP32 firmware already reaches the backend (`firmware/include/secrets.h` →
  `MQTT_HOST`).
