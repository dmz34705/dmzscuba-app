# Development backups

Deleting the app from a phone deletes everything it stores. Development builds therefore keep a copy of
all app data **on the Mac**, through the Metro dev server the app is already connected to.

## What is backed up

- **App storage:** every record: logbook (dives, computer logs, corrections), gear locker, setups,
  settings, Atlas preferences, tank profiles and the rest. In-app logbook snapshots are left out
  (redundant), as are sign-in tokens (kept in the secure keychain; sign in again).
- **Files:** everything under the app's Documents folder: dive photos (`dive-photos/`), gear attachments
  (`gear-attachments/`) and anything added later.

## Where it goes

`~/dmzscuba-backups/` (override with `DMZ_BACKUP_DIR`):

- `store/<key>`: one copy of each file. A file (same path, size and modification time) is uploaded once
  and shared by every backup that contains it.
- `backups/<id>/manifest.json`: app storage and the file list; `summary.json`: counts shown in the app.

The newest 30 automatic backups are kept. Manual and "before a restore" backups are never pruned. Files
no backup refers to are removed.

## When

- Automatically: 20 s after launch and whenever the app goes to the background, at most every 15 minutes,
  and only if something changed. A fresh install with no data never overwrites anything.
- Manually: **Settings → Export & backup → Backups on your Mac → Back up now**.

## Restore

Same screen: tap a backup. The current data is backed up first ("Before a restore"), files are downloaded
to a staging folder, then storage and the managed Documents folders are replaced. Photo links are rewritten
for the reinstalled app's new Documents path (iOS changes the container id on reinstall). The app reloads.

## How it works

- `metro.config.js` mounts `scripts/dev-backup/server.cjs` on the dev server at `/__dmz-backup` (Expo SDK 57
  composes it through `server.enhanceMiddleware`), so it works over LAN and tunnel with nothing else running.
- `src/lib/devBackup.js` is the app side. It finds the dev server the bundle was loaded from, is active only
  in `__DEV__` builds, and is started in `App.js`.
- `clean-rebuild.sh` checks for a recent backup before telling you to delete the app.
- `npm run test:dev-backup` runs the whole cycle against a real server with an in-memory phone: backup,
  delete and reinstall with a new Documents path, restore, then the safety backup and pruning.

Release builds have no dev server and show none of this. The logbook's JSON export (same screen) still
works everywhere.
