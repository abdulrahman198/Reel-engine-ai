# Handala Studio

Handala Studio is an additional timeline-editing workspace inside Reel Engine AI. It is available at `/studio.html`; the original AI story-to-video workflow remains at the root route.

## Current editor features

- Import local video, image, and audio files.
- Multi-lane timeline with video, audio, overlay/image, and subtitle tracks.
- Preview monitor with portrait 9:16, landscape 16:9, and square 1:1 canvases.
- Playback controls, timeline seeking, zoom, clip selection, clip positioning, trim-in/trim-out, split-at-playhead, and delete.
- Per-clip brightness, contrast, saturation, fade-in, and fade-out controls.
- Editable title overlay with size, color, and top/center/bottom placement.
- Import SRT subtitle files, preview timed cues, and render them into the export; subtitle cues are visible on their own timeline lane.
- Import timed subtitles from SRT; cues appear in the preview and rendered export.
- Audio clip volume control and timeline audio mixing for imported audio.
- Automatic local project persistence using IndexedDB, including imported media blobs, so the edit can be restored in the same browser.
- Browser-side rendering to WebM, followed by server-side FFmpeg conversion to MP4 when the app server and FFmpeg are available. If conversion is unavailable, the editor offers the WebM render instead.

## Run it

Start the app as described in the main README, then open:

`http://localhost:8787/studio.html`

In GitHub Codespaces, open the forwarded port 8787 and append `/studio.html` to the app URL.

## Important limitations

This is an early-access editor foundation, not a complete CapCut replacement yet. The current version has one global title layer, simple clip fades rather than transition presets, and basic audio mixing. It does not yet provide a full undo/redo history, keyframe animation, multi-layer compositing, speed curves, chroma key, motion tracking, waveform rendering, advanced color grading, or mobile touch-optimized timeline gestures. Video clip source-audio mixing is not yet guaranteed; add audio as a separate audio clip for a reliable soundtrack.

Media and project state are stored in the current browser's IndexedDB. They do not automatically sync between devices or browsers. Export finished videos and keep a separate backup before clearing browser site data.

## Build and test

```bash
npm ci
npm test
npm run build
```

The GitHub Actions workflow `.github/workflows/handala-studio-ci.yml` installs FFmpeg and DejaVu fonts before running the repository test suite and production build.
