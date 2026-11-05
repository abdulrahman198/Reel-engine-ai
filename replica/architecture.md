# Architecture: Handala Studio (existing web editor)

## Stack

This document plans incremental work on the current codebase; it does not propose a rewrite or a third-party clone.

| layer | choice | why |
|---|---|---|
| web | React 19 + Vite 8 + JavaScript | Already used by the project; preserve the current build and avoid unnecessary migration |
| styling | Existing studio.css | Keep the existing visual language and improve responsive/layout behavior incrementally |
| media engine | Browser Canvas + MediaRecorder + Web Audio API | Current export pipeline; browser-native processing keeps local editing possible |
| conversion | Existing Node/Express server + FFmpeg | MP4 conversion is already exposed as a server route |
| project persistence | IndexedDB in the browser, portable JSON backup | Current single-user/local-first design; media blobs remain local |
| database | None for the Studio editor | No user account or cloud sync is in scope; adding a database would create needless complexity |
| auth | None in editor; server host/origin restrictions remain | Current app is private single-user development workspace |
| payments/email/jobs | None for Studio | Not part of current editing loop |
| hosting | GitHub Codespaces/private forwarded port for development | Current documented deployment; not permanent public hosting |

## Schema

Tables: 0 server database tables. Browser IndexedDB currently uses database `handala-studio-db`, object store `projects`, key `current`. Access rules: same-origin browser storage; it is not account-authenticated and must not be treated as multi-user storage.

Logical entities:
- StudioProject: ratio, overlay, volume, textColor, textSize, textPosition, captions[], clips[].
- Clip: id, name, kind, media Blob/File, timeline start, trimStart/end/duration, effect properties, audio gain, opacity keyframes.
- CaptionCue: id, start, end, text.
- OpacityKeyframe: time, opacity.

No SQL migration is proposed. If cloud sync becomes an explicit requirement, revisit authentication, ownership, object storage, access policies and deletion requirements before implementing.

## API

Existing Studio-specific route verified in implementation:

| method path | does | who | input | output | flow |
|---|---|---|---|---|---|
| POST /api/studio/export/mp4 | Convert recorded WebM to MP4 via FFmpeg | Same-origin app client | video/webm request body | MP4 binary or error response | F05 |

The wider Reel Engine API includes project/script/image/audio/render routes documented in README, but they are not currently called by the Studio timeline component directly.

Webhooks in: none. Webhooks out: none. Jobs: browser-side render loop; server FFmpeg conversion request (no scheduled job).

## The parts that bite

- Timing: use seconds consistently; avoid drift between playhead, media currentTime, audio offsets and caption cues.
- Idempotency: render action should guard against double-click/repeated request; current UI disables export while rendering.
- Race conditions: media metadata loading can update clip duration asynchronously; changing/deleting clips during load needs careful handling.
- Memory/file sizes: project JSON embeds media as base64, which increases memory use substantially; IndexedDB quota can fail.
- Browser compatibility: MediaRecorder, captureStream and AudioContext behavior vary across browsers and mobile.
- Export integrity: verify WebM creation, MP4 conversion, soundtrack timing, subtitles, portrait/landscape output and download.
- Offline: local assets and IndexedDB support local draft retention; MP4 conversion still requires the app server.
- Security/privacy: keep Codespaces port private; no public multi-user service. Avoid exposing server endpoints publicly.
- GDPR deletion: current project data lives in browser storage; provide clear project reset/delete guidance before any cloud storage is introduced.

## Build order

1. **Vertical slice / hardening:** import one video, preview and trim, export WebM/MP4, reopen project; cover it with integration tests (S01–S07; IndexedDB only; F01/F02/F05).
2. **Must-have reliability:** test imported media edge cases, clip bounds, subtitle parsing, backup round-trip, undo/redo, export errors and browser support (S02/S04/S05/S06/S07; F01–F05).
3. **Should-have UX:** touch-friendly timeline and responsive inspector, multi-line text layout, richer transitions and audio controls (S03/S04/S05).
4. **Could-have advanced editing:** independent text layers, waveform, speed controls, chroma key, motion tracking and color grading only after the core loop is reliable.
5. **Fixes from replica-entrepreneur:** deferred until the product is publicly used and genuine user feedback is available.
