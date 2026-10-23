# Demo video assets

`../demo-video.mp4` — 1920×1080, 30 fps, H.264, **no audio stream**, 2:17.

## What is real and what is an overlay

Every frame showing the application is a genuine capture of https://ai.tanseer.qd.je driving
the deployed backend against the live AWS lab. No screenshot was edited, composed or
reconstructed. Overlays are used **only** for titles and labels, never to depict AWS behaviour.

| Scene | Source | Real or overlay |
|---|---|---|
| 1 · The problem | `cards/c1-problem.png` → `raw/01,02` | Title card, then **live** Overview showing the failing lab |
| 2 · Detect | `cards/c2-detect.png` → `raw/03,04,05` | Title card, then **live** Health & issues with the finding and its four cited facts |
| 3 · Analyze | `cards/c3-analyze.png` → `raw/burst-ai` → `raw/08` → `cards/c3b-quote.png` | Title card, then **live** Bedrock invocation (the ~11 s wait is real, played back at 10 fps), the real result, then the model's own words quoted verbatim |
| 4 · Plan & approve | `cards/c4-plan.png` → `raw/09,10,11` | Title card, then the **live** rollback plan and the approved-but-unexecuted state |
| 5 · Execute | `cards/c5-execute.png` → `raw/burst-exec` | Title card, then the **live** `UpdateAlias` and verification running |
| 6 · Verify | `cards/c6-verify.png` → `raw/12,13` | Title card, then the **live** verified card: BEFORE 2 → ACTION → AFTER 1 → Verified, with all three checks |
| 7 · Reset | `cards/c7-reset.png` → `raw/14`, `burst-reset`, `raw/16,17` | Title card, then **live** reset ×2 and the autonomous schedule |
| 8 · Closing | `cards/c8-close.png` | Title card only |

The numbers on the title cards (13 invocations, 10 errors, 76.9%, versions 2 and 1,
`5 of 5 findings verified`) were all read from that same recorded run — they are
transcriptions, not illustrations.

## The run behind the footage

Captured 2026-10-23. The recording performed a genuine remediation:

```
executedAt    2026-10-23T05:41:00.782Z
before→after  FunctionVersion 2 → 1
usedRevision  caade1d2-4304-4d75-9949-369a9853d350
newRevision   de1d1a28-1a9b-4fa6-a76e-57590f643ef1
verified      true   configuration-readback ✓  detector-rerun ✓  behaviour-probe ✓
probe         executedVersion 1, release v1-known-good
```

The lab was returned to its broken baseline afterwards (alias → version 2,
`matchesBaseline: true`).

## Rebuilding

```bash
cd scripts
node cards.mjs    ../cards          # title cards (Chrome renders the HTML)
node capture3.mjs ../raw            # live capture — PERFORMS A REAL ROLLBACK
bash build.sh                       # assemble demo-video.mp4
```

`capture3.mjs` asserts, before each click, that the card it is about to act on is the
rollback plan — it reads the card back and aborts if the text does not match. An earlier
version matched on button label alone and approved the wrong remediation twice; the guard
exists because of that.

`build.sh` encodes each scene separately and concatenates them, so a single scene can be
re-cut without rebuilding the whole timeline. `-an` on the final mux is what guarantees the
file carries no audio.

## Note

These assets are untracked on purpose. `demo-video.mp4` is 4.2 MB and `demo/` is ~32 MB of
source frames; whether any of it belongs in git is your call, and none of it is part of the
`feat/lambda-version-rollback` pull request.
