# Project Sixty-Eight ft. The Niemi Family
1968 Chevrolet C10 restoration tracker and garage companion.

## Optional Google Drive cloud backup and cross-device sync

Go to **Cloud** in the installed app or the browser site and tap **Connect Google Drive**. Authorize your own Google account. This integration reuses the public Google OAuth web client configured for the `https://16-bitz-studios.github.io` origin in TruckLedger; no OAuth secret or access token is stored in the repository. It requests Google's `drive.appdata` scope and verified email information. Only Project Sixty-Eight backups under the `ProjectSixtyEight_Sync_v1_` prefix are indexed. TruckLedger's backups use another prefix and remain separate.

After the first connection, the app saves an initial compressed snapshot of the complete local restoration data (including lead and inventory photos and imported diagram/PDF references), then automatically backs up saved local changes while the app is open and Google authorization remains valid. When active, it checks for cloud changes approximately once per minute and when returning to the app. The working record remains in local IndexedDB, with the existing JSON export/import retained as an independent recovery option.

### Safety boundaries

- **Existing cloud records are never replaced on first connection without confirmation.** A new phone with seeded local tasks must explicitly choose the cloud copy, or keep its current local version.
- **Cross-device conflicts stop automatic syncing.** The app uses append-only revision snapshots with parent references; when both devices branch from the same revision, both backups remain available. The user chooses which version to activate, rather than a blind last-writer-wins overwrite. This is *whole-snapshot reconciliation*, not field-level merging of concurrent edits.
- **A safety copy of local data is uploaded before a manual cloud restore.** Separate manual JSON downloads are always available. After a verified sync, up to 30 recent revisions are retained; revisions from the last seven days are not automatically pruned. Safety backups are not pruned.
- **No silent photo deletion.** If IndexedDB photo storage is missing or local saving fails, cloud uploads and restores are blocked.
- **Google grants expire** and need a user-initiated reconnect. Closing the app, losing connectivity, or disabling authorization pauses syncing. Offline changes remain local. This is not always-on background sync; it only runs during an authorized app session.
- **Large media:** cloud snapshots use gzip compression with explicit size limits (55 MB before compression and 40 MB uploaded). LMC's entire catalog is not uploaded; only catalog files explicitly saved in your restoration records are included.
- **Scope:** do not store a Google OAuth client secret in a browser app. Google Drive files live in the user's hidden application-data folder; they are separate from the public GitHub Pages source code.
