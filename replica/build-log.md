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
