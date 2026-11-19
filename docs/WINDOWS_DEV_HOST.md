# Windows trip host

Atlas Studio is available on the development website at
`https://dmzscuba-com.pages.dev/management/` for individually signed-in
administrator accounts. Development builds download Atlas releases from that
development site by default; production builds keep their production feed.
The most recent verified release remains available offline and after an app
restart. Set `EXPO_PUBLIC_ATLAS_USE_BUNDLED=1` only when deliberately testing
local bundled datasets instead of published Atlas Studio updates.

Windows serves JavaScript to the existing iPhone development build. Xcode is not
needed to host Metro; rebuilding the iOS native binary still requires a Mac.
Use the same native dependencies as the phone build. Do not uninstall the phone
app to change its development-server URL.

## Install the prerelease

Use Git and Node.js 22.23.3 (or a compatible Node 22 release). Install the official
ngrok agent and authenticate it on Windows using your own ngrok account. Keep
its authtoken in ngrok's local configuration, outside Git.

In PowerShell, in a folder where you keep projects:

```powershell
git clone --recurse-submodules https://github.com/dmz34705/dmzscuba-app.git
cd dmzscuba-app
git checkout --detach v0.1.0-beta.2
npm ci
ngrok config check
```

If already cloned, first inspect `git status` and preserve any Windows edits.
Then fetch tags, check out the tag and run `npm ci` and
`git submodule update --init --recursive`. Never copy Mac `node_modules`, `.expo`,
`ios` or `android` directories to Windows.

Create `.env.host.local` in the repository (it is ignored by Git):

```dotenv
NGROK_URL=https://YOUR-RESERVED-DOMAIN.ngrok-free.app
```

Use the real stable domain assigned to your ngrok account. Reusing the Mac's
reserved domain requires its tunnel to be stopped before starting Windows.
Do not run both hosts against the same domain. `.env.host.local` is loaded by
the tunnel launcher before it starts either ngrok or Metro. Existing shell
environment variables take precedence over values in that file.

## Start and connect

```powershell
npm run host:dev
```

This starts the installed ngrok agent, starts the local Expo CLI directly with
Node (no shell-dependent npx invocation), and prints the iPhone development-client
link. The supervisor retries a failed Metro/tunnel process after 15 seconds.
An occupied Windows port produces a useful error without killing other programs.
The standard Metro port is 8081; `RCT_METRO_PORT` in `.env.host.local` can change it.
The trip host binds Metro to localhost and uses ngrok for remote access, so router
port forwarding is unnecessary.

Keep the host terminal open. On AC power, disable automatic sleep in Windows
power settings (`powercfg /change standby-timeout-ac 0` from PowerShell). Locking
the screen is fine; signing out or restarting stops this foreground host.
Arrange Windows Update restarts before departure. If the machine reboots, sign
in and start the host again (or use the optional task below).

Open the printed `dmzscuba://expo-development-client/?url=...` link on the iPhone,
or open the installed development client's launcher and enter the HTTPS tunnel
URL. If a previous project opens automatically, return to the development-client
launcher and select the new URL. This serves the existing installed native app;
it does not install a different app or alter its local logbook.

## Optional restart at sign-in

After a successful foreground test, from PowerShell in the repository:

```powershell
$repoPath = (Get-Location).Path
$nodePath = (Get-Command node).Source
$hostScript = Join-Path $repoPath 'scripts\host-dev-server.cjs'
$action = New-ScheduledTaskAction -Execute $nodePath -Argument ('"' + $hostScript + '"') -WorkingDirectory $repoPath
$trigger = New-ScheduledTaskTrigger -AtLogOn -User ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name)
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName 'DMZ Scuba Trip Host' -Action $action -Trigger $trigger -Settings $settings -Description 'Serve the pinned DMZ Scuba beta through ngrok while signed in.'
```

Stop the foreground host with Ctrl+C, then run
`Start-ScheduledTask -TaskName 'DMZ Scuba Trip Host'`. Inspect it in Task Scheduler.
This task starts at **sign-in**, not before sign-in after a reboot; it does not
configure automatic login. Start it under the same Windows user whose ngrok
configuration you tested. No Git updates are performed automatically.
Remove it later with `Unregister-ScheduledTask -TaskName 'DMZ Scuba Trip Host'`.

## Backups are a separate transfer

The app's development-backup middleware is mounted on Metro. By default Windows
will use `%USERPROFILE%\dmzscuba-backups`. Existing Mac backup history is in
`/Users/dmz/dmzscuba-backups` (about 8.8 GB at preparation time) and is outside
Git. Copy that complete folder, including `store` and `backups`, through your
private file-transfer method while both hosts are stopped. Do not put private
backups in GitHub. Alternatively set `DMZ_BACKUP_DIR` in `.env.host.local` to the
copied folder. New backups can also start fresh without moving historical ones;
phone records remain on the phone.

## Verify before leaving

1. `Invoke-RestMethod http://127.0.0.1:8081/status` returns `packager-status:running`.
2. `Invoke-RestMethod http://127.0.0.1:8081/__dmz-backup/ping` shows the intended Windows backup directory.
3. Request the reserved HTTPS URL with an `expo-platform: ios` header and confirm
   its manifest's `launchAsset.url` points to the HTTPS domain. Request that
   bundle too; a running Metro process alone is not enough.
4. Turn Wi-Fi off on the iPhone, open the app through the Windows tunnel, reload,
   and check the logbook, a saved photo, Atlas, Planner, account and Dive Lens.
5. Stop the Mac tunnel and repeat the phone test with the Mac offline. Keep the
   Mac server available for rollback until this has succeeded.

Runtime use on a physical iPhone is the final acceptance check. A bundle export
or mocked Windows launcher test cannot verify remote connectivity or the native
phone binary. Backend Workers remain separately hosted; saving their source to
Git does not deploy them.

References: [Expo CLI](https://docs.expo.dev/more/expo-cli/),
[ngrok CLI](https://ngrok.com/docs/gateway/agent/cli).
