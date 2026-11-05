# Replica Test Plan — Handala Studio

Build: branch `replica/handala-studio-recon` based on main SHA `70bf87fe5aac8d6dd37f180087c84467fa319cd2`; docs head `e145cf269ef7182ae1dbf613efd636f251346ccb`
Date: 2026-11-05
Environment: source review via GitHub connector. No local browser session available; all result cells remain NOT RUN until the app is launched in a real browser.

## F01 — Import media and begin editing

| case | type | steps | expected | auto | result |
|---|---|---|---|---|---|
| F01-H1 | happy | Open /studio.html; import valid MP4; wait for metadata | Asset appears, clip in VIDEO lane, preview activates | manual | NOT RUN |
| F01-H2 | happy | Import image and audio separately | Assets added; image/video lanes and audio lane correctly reflect kind | manual | NOT RUN |
| F01-E1 | edge: empty | Open file picker then cancel | Existing timeline unchanged | manual | NOT RUN |
| F01-E2 | edge: unsupported type | Attempt a text or unknown file | Unsupported file filtered; no broken asset URL | manual | NOT RUN |
| F01-E3 | edge: long filename / emoji | Import file named with 60+ chars and emoji | Asset label remains operable and not layout-breaking | manual | NOT RUN |
| F01-E4 | edge: metadata failure | Import corrupted or metadata-less video | User receives clear notice; editor remains usable | manual | NOT RUN |
| F01-E5 | edge: large file / quota | Import large asset and observe persistence | No tab crash; storage failure gets recovery message | manual | NOT RUN |
| F01-E6 | edge: refresh | Import assets, refresh | Stored project restored or explicit recovery message | manual | NOT RUN |
| F01-E7 | edge: mobile | Repeat import on 390px viewport/touch device | Controls accessible, no unintended horizontal overflow | manual | NOT RUN |

## F02 — Edit and arrange a clip

| case | type | steps | expected | auto | result |
|---|---|---|---|---|---|
| F02-H1 | happy | Select clip, change start and trim fields | Timeline and preview reflect valid timing | manual | NOT RUN |
| F02-H2 | happy | Seek inside clip; Split at playhead | Two clips with adjacent timing, no gap/negative bounds | manual | NOT RUN |
| F02-H3 | happy | Drag clip later then earlier | Start remains >=0; preview and track position agree | manual | NOT RUN |
| F02-H4 | happy | Adjust brightness, contrast, saturation, fade, opacity keyframes | Preview/export use same effect values | manual | NOT RUN |
| F02-E1 | edge: invalid bounds | Set trim-in/out beyond clip duration | Values clamp or validation prevents invalid state | manual | NOT RUN |
| F02-E2 | edge: split near boundary | Split at clip start/end | No zero-length or invalid clip produced | manual | NOT RUN |
| F02-E3 | edge: rapid actions | Split/delete/change selection quickly | State stays consistent; no stale selected clip | manual | NOT RUN |
| F02-E4 | edge: overlap | Drag clips to same time | Layer policy is predictable; no silent asset loss | manual | NOT RUN |
| F02-E5 | edge: keyboard only | Select and arrange clips without mouse | Editing loop possible via keyboard | manual | NOT RUN (known gap) |
| F02-E6 | edge: undo/redo | Edit, undo, redo several times | Each snapshot restored; history bounded | manual | NOT RUN |

## F03 — Add subtitles

| case | type | steps | expected | auto | result |
|---|---|---|---|---|---|
| F03-H1 | happy | Import valid SRT with multi-line cue | Cues parsed and timed; active cue appears in preview and export | manual | NOT RUN |
| F03-E1 | edge: empty SRT | Import empty file | Empty cue list with informative status | manual | NOT RUN |
| F03-E2 | edge: malformed timestamps | Import invalid SRT blocks | Invalid blocks skipped; no crash | manual | NOT RUN |
| F03-E3 | edge: Unicode | Import Arabic/German/emoji subtitles | Text remains legible and preserved | manual | NOT RUN |
| F03-E4 | edge: overlaps | Import cues with overlapping ranges | Behavior documented; correct active cue policy | manual | NOT RUN |
| F03-E5 | edge: long lines | Import 60+ char lines | Preview/export wraps or bounds text without clipping | manual | NOT RUN |

## F04 — Save and restore project

| case | type | steps | expected | auto | result |
|---|---|---|---|---|---|
| F04-H1 | happy | Export JSON backup with clips and SRT, then re-import | Clips, timing, ratio, overlay, media and captions restored | manual | NOT RUN |
| F04-H2 | happy | Refresh after local save | IndexedDB restores project and media | manual | NOT RUN |
| F04-E1 | edge: corrupt JSON | Import malformed JSON | Clear error, current project unaffected | manual | NOT RUN |
| F04-E2 | edge: wrong schema | Import JSON with unexpected format | Reject backup with explanatory notice | manual | NOT RUN |
| F04-E3 | edge: missing media payload | Import valid schema but data=null clip | No crash; missing media identified | manual | NOT RUN |
| F04-E4 | edge: large project | Export/import multi-large media JSON | No tab crash; user warned or memory handled | manual | NOT RUN (risk) |
| F04-E5 | edge: storage unavailable | Disable IndexedDB / quota | Recovery guidance; export backup remains available | manual | NOT RUN |

## F05 — Render and download

| case | type | steps | expected | auto | result |
|---|---|---|---|---|---|
| F05-H1 | happy | Import visual clip, render WebM | Download valid playable WebM | manual | NOT RUN |
| F05-H2 | happy | Render with MP4 endpoint available | Download playable MP4 | manual | NOT RUN |
| F05-H3 | fallback | Disable/unavailable FFmpeg route | Valid WebM fallback downloaded and notice shown | manual | NOT RUN |
| F05-E1 | edge: no visual clip | Export with only audio or no clips | Export blocked with clear status | manual | NOT RUN |
| F05-E2 | edge: unsupported browser | Browser lacks MediaRecorder/captureStream | Clear unsupported notice, app remains usable | manual | NOT RUN |
| F05-E3 | edge: audio decode failure | Import corrupt audio and export | Render failure handled, tracks/resources released | manual | NOT RUN |
| F05-E4 | edge: long render | Render a long sequence | Progress/status understandable; no runaway resource usage | manual | NOT RUN |
| F05-E5 | edge: subtitles/effects | Render with subtitle and opacity keyframes | Output visual treatment aligns with preview | manual | NOT RUN |
| F05-E6 | edge: mobile | Render on mobile browser | If unsupported, explain; no tab lock/crash | manual | NOT RUN |

## Global accessibility / compatibility checks

- Keyboard-only: focus order, visible focus, action naming, range keyboard operation.
- Screen reader: input labels, selection feedback, live status announcements.
- Viewports: 390px mobile and 1440px desktop; orientation change.
- Browser: current Chromium and Firefox/Safari where available.
- Console errors and HTTP 5xx responses during each flow.
- Two tabs: storage conflicts / project overwrite behavior.
- Browser refresh/back during import/render.
- Offline behavior: local editing persistence vs server-required MP4 conversion.
- Verify no unrelated app route or original Reel Engine flow regression.

## Execution note

No test was actually executed in a browser in this session. This is an actionable test plan, not a passing QA report. Record observed bugs in `replica/bugs.md` only after reproduction.
