# محرر الصور (local Android photo editor): slice 1

What works in code (written, NOT yet run on a phone): pick a photo, remove the background on-device, refine with an Erase/Restore brush, undo/redo, hold to compare, export PNG (transparent) or JPG.
Everything else in the tool strip shows "coming soon". Stub routes exist for screens S06-S19.

## 1. Get the model (required, about 4 MB)

Download `u2netp.onnx` from the rembg project releases:
https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx
and put it at `public/models/u2netp.onnx`. (rembg's own code checks it against MD5 `8e83ca70e441ab06c318d82300c84806`.)
U2-Net is Apache-2.0; rembg is MIT. This is the small model: faster, rougher edges than the 170 MB one. The brush is there to fix edges.

## 2. Build the APK on GitHub (no Android Studio needed)

1. Create a GitHub repo and upload this whole folder (including `public/models/u2netp.onnx`).
2. Actions tab -> "Build APK" -> Run workflow.
3. When it finishes, download the artifact `app-debug-apk`, copy `app-debug.apk` to the phone, and install it (allow install from this source).

## 3. Run in a desktop browser (optional)

    npm install
    npm run dev      # opens a local page, good for quick checks
    npm test         # unit tests for the mask math (9 tests)

## Known risks (things I could not test)

- Not built or run yet: this environment has no network, so `npm install`, the type check and the APK build have not been run. The mask/image math is unit tested (9 passing); the screens, worker and export are not.
- Capacitor and Java versions: the workflow uses Capacitor 7 and Java 21. If the build fails on a version error, that is the first place to look.
- Saving to the gallery: `native/MediaSaverPlugin.java` saves into `Pictures/PhotoEditor` through MediaStore (Android 10+ needs no storage permission). The CI workflow copies it and `native/MainActivity.java` into the generated Android project. This Java was written to the pattern in Capacitor's custom-plugin docs but has NOT been compiled (no Java toolchain here). If the build fails in the Java step, send me the error. On Android 9 or older, or if the plugin fails, the app falls back to `Documents/PhotoEditor/`, then to the app cache. "مشاركة" writes a temporary copy and opens the share sheet.
- If you change `appId` in `capacitor.config.ts`, change the `package` line at the top of both Java files to match.
- Speed and memory on your phone are unknown. Working copy is capped at 1600 px; export is capped at 4096 px.
- The model quality on hair and fine edges is limited (small model).
