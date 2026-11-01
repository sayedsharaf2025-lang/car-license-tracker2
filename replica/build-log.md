# Build log

| ID | date | status | missing | notes |
| --- | --- | --- | --- | --- |
| shell | 2026-10-31 | partial | SQLite data layer | hash router, tokens wired, in-memory data layer with the planned function shapes, stub routes S06-S19 |
| S02 Home | 2026-10-31 | partial | recent-project thumbnails, persistence | projects are lost when the app closes (in-memory) |
| S03 Photo picker | 2026-10-31 | partial | permission-denied state | uses the system picker through a file input |
| S04 Editor | 2026-10-31 | partial | pinch zoom/pan, layers | canvas shows cutout over a checkerboard |
| S05 Remove BG | 2026-10-31 | partial | edge softening, brush size preview circle | undo uses snapshots (max 10), to be replaced by a stroke list |
| S16 Export | 2026-10-31 | partial | not run on a device | PNG alpha and JPG; saves to the gallery (Pictures/PhotoEditor) via a custom MediaStore plugin, falls back to Documents then cache; Share via a temp copy |

Status words: "partial" means code written, math unit-tested, but not run on a device. Nothing is marked "done" until it has been.
Harder than expected: gallery saving needs native code (MediaStore), so the CI workflow injects a small Java plugin after `cap add android`. That Java is uncompiled so far.
| S06 Background | 2026-11-01 | partial | fit/ratio options | transparent, solid color, gallery image (cover crop); needs a cutout first |
| S13 Text | 2026-11-01 | partial | outline/shadow, alignment, multiple selection handles | add, edit, drag, delete; Arabic RTL; 5 bundled fonts; size and color; positions stored as fractions so export scales |
| Export | 2026-11-01 | partial | not run on device | now composes background + cutout + text at export size |
Not built yet: Remove Object (S09), Font finder (S19), crop/adjust, filters, saving projects.
| S09 Remove Object | 2026-11-01 | partial | undo, AI-quality fill, OCR-assisted text removal | red brush selection; fill runs on the full-size photo; works without a cutout |
| S19 Font finder | 2026-11-01 | partial | OCR (user types the text instead), more fonts | drag a box over the text, type it, get top 5 of the 5 bundled fonts with a score; one tap adds a text layer in that font |
Not built: crop/adjust, filters, saving projects, OCR.
| OCR | 2026-11-01 | partial | text removal using OCR boxes, whole-image scan | button in the Font finder reads the selected area (Arabic + Latin) and runs the font search; needs 3 model files in public/models |
| MI-GAN | 2026-11-01 | partial | not run with the real model | Remove Object now uses MI-GAN (ONNX pipeline, MIT) in a worker; downloads once (~80 MB), cached in the WebView, offline afterwards; only the area around the hole goes to the model; falls back to the old simple fill if the model cannot run. Client + crop/paste logic unit-tested with a fake worker (model itself NOT run: huggingface.co was not reachable from the build sandbox) |
| Edit text in photo | 2026-11-01 | partial | not run on a device | detect lines (PaddleOCR detector) -> read line -> pick font/colour/size from the untouched pixels -> erase line with MI-GAN -> add a text layer at the same spot |
| Auto-select text for removal | 2026-11-01 | partial | not run on a device | marks every detected word in the object-removal mask; the brush/eraser can adjust it before removing |
| Crop + resize | 2026-11-01 | partial | not run on a device | rect (free / 1:1 / 4:3 / 16:9 / 9:16), rounded, circle, heart, star, hexagon, triangle, freehand outline; non-rect shapes become transparency (folded into the cutout mask); resize with locked ratio; one-level undo; crop reads pixels from the full-size original |
| Export formats | 2026-11-01 | partial | EXIF is not carried over | PNG / JPG / WebP; the format of the opened photo is pre-selected |
| Fonts | 2026-11-01 | partial | - | 27 bundled fonts (16 Arabic, 11 Latin), woff2 only (~1.1 MB); font finder ranks only fonts that can draw the typed text's script |
| Size | 2026-11-01 | done | - | ORT switched to the CPU-only build with the wasm loaded from /ort (15 MB once, not 88 MB + 30 MB duplicate); web build is 16 MB |
