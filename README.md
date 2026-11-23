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

## Receipt and invoice scanning (cache v25)

The **Receipts** tab accepts photos from the Android/iPhone camera, existing images, store receipts, emailed PDFs (including Amazon invoices), or pasted confirmation text. Tesseract OCR runs locally in the browser. Text-based PDF invoices are read with PDF.js first; scanned PDF pages use local OCR. Receipt documents must be under 10 MB. The review screen extracts individual line items where available and lets you edit the description, product number, quantity, category, price, merchant, date, subtotal, tax, and final amount paid.

For Canadian Tire or another retailer, tap **Find SKU description**, **Look up product numbers** (up to 8, with explicit consent), or the direct public product search link. These are **unverified suggestions**, and availability varies by retailer and access restrictions. No source receipt or payment data are uploaded by the lookup; only the retailer and the public product SKU are used. The importer never overwrites paid prices based on an online listing.

All purchase totals are recorded in CAD; foreign invoices require a user-selected exchange rate, with a Bank of Canada reference-rate option. The **full paid invoice total** (including tax and shipping as entered) contributes exactly once to project cash investment. Item lines do not independently add money. After saving, a purchased physical component can be sent to **Parts (Received) + Inventory**: its unit cost is recorded for reference, but that linked part's cost is excluded from independent parts spending to prevent double counting. Other consumable items (paint, sanding discs, rags, masking materials) remain as expense lines on the invoice.

Receipt source files and line items are included in JSON exports and optional Google Drive synchronization. The localStorage mirror omits bulky receipt attachments, which are retained in IndexedDB; the existing missing-photo-database protection also applies to these attachments. The importer is review-first and will not blindly book an invoice or rely on OCR totals without user confirmation. A printed product number, quantity, currency, GST/PST, freight or line layout may need manual correction.

Existing project data keys and all older saved task, part, lead, inventory, sale and catalog schemas remain unchanged.
