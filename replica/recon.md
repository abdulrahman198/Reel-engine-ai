# Replica Recon: Handala Studio (Web)

Scope: Audit and improve the existing browser-based timeline editor at `/studio.html` inside Reel Engine AI. This is an assessment of our own product, not a clone of a third-party product.
For: Single-user creator workflow for Handala / Palestinian media video editing, including social video output.
Date: 2026-11-05

## Sources

| # | source | URL | notes |
|---|---|---|---|
| 1 | Repository README | https://github.com/abdulrahman198/Reel-engine-ai/blob/main/README.md | Parent app, setup, server and export boundaries |
| 2 | Handala Studio feature/limits doc | https://github.com/abdulrahman198/Reel-engine-ai/blob/main/HANDALA_STUDIO.md | Editor feature inventory and known gaps |
| 3 | Studio HTML entry | https://github.com/abdulrahman198/Reel-engine-ai/blob/main/studio.html | Route entry |
| 4 | Studio React implementation | https://github.com/abdulrahman198/Reel-engine-ai/blob/main/studio.jsx | Direct code inspection of flows and states |
| 5 | Package scripts | https://github.com/abdulrahman198/Reel-engine-ai/blob/main/package.json | Build and test commands |

No live browser session or rendered screenshots were available during this recon. UI state notes are inferred from the implementation; screenshot-level visual parity and actual mobile usability remain unverified.

## Core loop

Import video, image, audio and/or SRT assets → arrange and edit clips on the timeline → preview and adjust clip properties/title/audio → save a portable project → render and download WebM or MP4 when FFmpeg conversion is available.

## Screens

| ID | screen | route / how to reach | purpose | key components | states seen / inferred |
|---|---|---|---|---|---|
| S01 | Studio workspace | `/studio.html` | Main editing workspace | topbar, media library, preview monitor, inspector, timeline, footer/status | empty initial state, media-loaded, selected clip, playback, export, restored project; loading/error inferred |
| S02 | Media library | S01 left panel | Import/select media assets | file picker, asset list, import SRT | empty, imported assets, selected asset; invalid type is filtered |
| S03 | Preview monitor & transport | S01 center | Preview active footage and captions; control playhead | stage, video/image preview, overlay, subtitle cue, transport, seek range | empty, video/image/caption active, paused/playing |
| S04 | Clip inspector | S01 right panel after selecting clip | Edit position, trim and visual/audio properties | numeric fields, sliders, keyframe list, split/delete actions | no selection, video/image selected, audio selected, keyframes empty/populated |
| S05 | Timeline | S01 bottom | Arrange, select, move, split clips and seek | ruler, video/audio/image/subtitle lanes, draggable clip blocks, playhead, zoom, undo/redo | empty lanes, clips populated, selected clip, drag/drop, captions |
| S06 | Project backup import/export | S01 Save project / Open project | Portable JSON project with embedded media | download action, JSON file input | export success/failure notice; import success/invalid backup notice |
| S07 | Video export | S01 Export video | Render composition and download output | MediaRecorder canvas, FFmpeg MP4 endpoint, status notice | rendering, MP4 success, WebM fallback, unsupported browser, failure |

## Flows

```
F01 Import media and begin editing
    S01 -> S02 -> S05 -> S03
    happy path: choose local media, metadata loads, asset appears on timeline, preview shows active item
    edge: unsupported MIME, metadata unavailable, browser storage quota exceeded, large asset import

F02 Edit and arrange a clip
    S05 -> S04 -> S03 -> S05
    happy path: select clip, change start/trim/filter/fade, split or drag, preview
    edge: invalid trim range, split at/outside clip bounds, drag to negative start, overlaps/track behavior

F03 Add subtitles
    S02 (SRT import) -> S05 (subtitle lane) -> S03 (cue preview) -> S07
    edge: malformed timestamps, multi-line text, empty SRT, subtitle cues overlap

F04 Save and restore project
    S01 -> S06 -> S01
    happy path: export JSON including base64 media, re-import and restore settings/clips/captions
    edge: huge JSON/base64 memory use, corrupted file, missing media payload, storage full

F05 Render and download
    S01 -> S03/S05 -> S07
    happy path: capture canvas, mix imported audio, attempt server FFmpeg MP4, download
    edge: MediaRecorder unsupported, no visual clip, FFmpeg endpoint unavailable, conversion failure, audio decode error, render long duration
```

## Components

| component | variants | states | used on |
|---|---|---|---|
| Import file control | media multi-select, SRT, project JSON | idle, selected, invalid/filtered | S02, S06 |
| Asset row | video, image, audio | default, chosen | S02 |
| Preview stage | portrait 9:16, landscape 16:9, square 1:1 | empty, active clip, active subtitle, overlay | S03 |
| Transport controls | start, play/pause, end, seek range | paused, playing | S03 |
| Clip block | video, image, audio, caption | default, selected, draggable | S05 |
| Inspector controls | numeric, range, color, select | default, edited, selected-kind conditional | S04 |
| Keyframe row | opacity/time | none, populated, removable | S04 |
| Timeline toolbar | undo, redo, split, zoom +/- | enabled/disabled, zoom level | S05 |
| Status notice | informational/error/success text | save, import, export, failure | S01/S07 |

## Inferred data model

```
StudioProject
  ratio, overlay, volume, textColor, textSize, textPosition, captions[], clips[]
  evidence: snapshotProject, IndexedDB project persistence, project JSON export
  confidence: high

Clip
  id, name, kind(video|image|audio), file/blob, url, start, trimStart, end, duration,
  brightness, contrast, saturation, fadeIn, fadeOut, gain, keyframes[]
  evidence: importFiles, inspector, timeline, exportProject
  confidence: high

CaptionCue
  id, start, end, text
  evidence: parseSrt, subtitle preview and render
  confidence: high

OpacityKeyframe
  time, opacity
  evidence: opacityAt, addKeyframe, keyframe list
  confidence: high

Local persistence
  IndexedDB object store projects/current; browser localStorage holds lightweight settings fallback
  evidence: readStudioProject/writeStudioProject
  confidence: high
```

Relationships: StudioProject contains many Clips and CaptionCues; each Clip contains zero or more opacity keyframes. Project state is browser-local and not account-synced.

## Feature matrix

See `replica/features.csv`. Priority totals are tracked there. Priorities represent the editor product roadmap, not third-party feature parity.

## Out of scope / constraints

- Cloud multi-user collaboration and cross-device sync are not implemented; local browser IndexedDB is the current storage model.
- Licensed stock-media catalogues, third-party creator networks, and commercial platform integrations are not part of this assessment.
- Automatic transcription/translation of imported audio is not present in the timeline editor; SRT import is available.
- Generated moving footage from Flow/Veo/Kling is outside the editor's current built-in capability; imported clips can be edited.
- Full advanced professional suites (motion tracking, chroma key, speed curves, extensive compositing/color grading) are aspirational, not implied as complete.
- The editor has not been manually verified at mobile touch gesture level in this recon.

## Size

7 screen areas, 5 core flows, 4 primary entities. Hard parts: robust synchronized playback/rendering, media storage/memory, editing gestures and mobile responsiveness, reliable export/audio mixing. Size: L for a credible advanced editor; prioritize incremental vertical slices.
