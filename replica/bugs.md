# Replica QA bug register — Handala Studio

Date: 2026-11-05

## Reproduced bugs
None recorded. No browser execution was available, so runtime defects are not marked reproduced.

## Risks to verify (not confirmed bugs)

### RISK-001: timeline keyboard operation
- Severity if confirmed: S2
- Flow: F02-E5; Screen S05
- Evidence: timeline interactions appear pointer/drag oriented in source review; keyboard nudge/select not confirmed.
- Verify: navigate and select/move/split clips with keyboard only.
- Status: to check

### RISK-002: embedded source video audio in export
- Severity if confirmed: S2
- Flow: F05-H1; Screen S07
- Evidence: source video preview is muted; export audio mixing is assembled from separate imported audio clips.
- Verify: export a video with embedded audio and no external audio clip; inspect output.
- Status: to check

### RISK-003: base64 backup memory amplification
- Severity if confirmed: S3
- Flow: F04-E4; Screen S06
- Evidence: media are embedded in project JSON as base64, increasing memory footprint.
- Verify: large fixture export/import under supported browser.
- Status: to check

### RISK-004: render progress/cancel affordance
- Severity if confirmed: S3
- Flow: F05-E4; Screen S07
- Evidence: notices exist, but progress and cancellation affordances not confirmed.
- Verify: long render, user feedback, cleanup.
- Status: to check

### RISK-005: touch timeline responsiveness
- Severity if confirmed: S2/S3
- Flow: F01-E7, F02-E5, F05-E6
- Evidence: touch interactions have not been manually validated.
- Verify: real device and 390px viewport.
- Status: to check

### RISK-006: subtitle cue editing
- Severity if confirmed: S3
- Flow: F03; Screen S05
- Evidence: cues render on subtitle lane; edit/select/delete capabilities not verified.
- Verify: cue timing and editing workflow.
- Status: to check

## Fixes
None. Do not mark risks as fixed without test evidence and commit.
