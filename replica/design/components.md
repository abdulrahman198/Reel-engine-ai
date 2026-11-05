# Handala Studio component design specifications

Grounding: current source CSS and JSX were inspected. No screenshots/browser render were captured in this recon, so exact visual sizing and contrast should be validated against a running build before shipping.

## Workspace shell / top bar
- Layout: brand mark and wordmark left; project actions, aspect-ratio selector, export action right. Existing height 76px desktop; wraps on narrow screens.
- States: default, busy export, disabled export; keyboard focus visible is a required improvement.
- Accessibility: action buttons must be keyboard-operable; file inputs need accessible names; don't rely on lime alone for status.

## Import control
- Variants: multi-file media, SRT, JSON project.
- States: idle, selected, filtered unsupported file, error.
- Accessibility: label should announce accepted formats and purpose; preserve focus after import.

## Asset row
- Variants: video, image, audio.
- States: default, selected/chosen, hover, focus-visible.
- Layout: name truncates but must expose full filename by accessible title/name; media kind should be text rather than color-only.

## Preview stage
- Variants: portrait 9:16, landscape 16:9, square 1:1.
- States: empty prompt, active video, active image, overlay title, active subtitle cue.
- Accessibility: preview status should be described to screen readers; transport controls provide an alternative for visual playhead manipulation.

## Transport controls
- Variants: start, play/pause, end, seek range.
- States: paused, playing, focus-visible, unsupported playback.
- Accessibility: descriptive aria-labels; range has current time and total duration; keyboard arrow seeking.

## Timeline clip
- Variants: video, audio, image, subtitle cue.
- States: default, selected, dragging, focus-visible.
- Accessibility: clips should be selectable and movable without mouse (keyboard nudging); label communicates kind, name, duration and selection. Current drag/drop is mouse-centric and keyboard support is a gap.

## Inspector field
- Variants: numeric time fields, range slider, color picker, select, text field.
- States: default, edited, invalid, disabled, focus-visible.
- Accessibility: every input must have a programmatic label; validation should announce invalid trim bounds; units (seconds/percent) must be explicit.

## Keyframe list
- States: empty hint, populated row, delete action, focus-visible.
- Accessibility: keyframe action names must include timestamp/value context where practical.

## Timeline toolbar
- Variants: Undo, Redo, Split, Zoom in/out.
- States: enabled/disabled, active zoom.
- Accessibility: tooltips and aria-labels; shortcut help should be discoverable.

## Status notice / export
- States: local save, restored, import success, rendering, MP4 success, WebM fallback, error.
- Accessibility: use a polite live region for progress and assertive announcement for blocking failures; provide meaningful failure text and recovery guidance.
