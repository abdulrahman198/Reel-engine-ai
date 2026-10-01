# v0.7 validation — 1 October 2026

Verified with Node.js 24.19.0 and local FFmpeg/FFprobe.

- Dependency installation with the pinned package manifest and lockfile succeeded.
- `npm run build`: passed (React/Vite production bundle).
- `npm test`: **14 passed**, including draft persistence across store recreation, incomplete draft edits, audio normalization, Arabic/German SRT parsing, image decoding, invalid payloads, origin/Host checks, credential redaction, provider response mocks and job recovery.
- `npm run test:render`: **passed** with real FFmpeg. It produced a 30-second 1080×1920 H.264/AAC video, plus a 1280×720 video with narration longer than the original plan and burned-in subtitles. Output dimensions, 30 fps, playback ranges, download headers and preservation of the complete narration were verified.
- Exported frames were visually inspected: Arabic shaping, German/Arabic screen text and subtitle placement were present.
- Provider calls use deterministic mocks for tests. No paid OpenAI or ElevenLabs requests were made. Live account permissions, provider costs and generated output quality were not tested.
- Full browser interaction/mobile-layout verification could not be completed: the browser binary download was invalid in the environment, and the available remote browser blocked access to the localhost preview. The UI build passed; this does not replace browser QA.
- Docker packaging is supplied but was not built or run in this environment.

Current scope: still-image camera motion, equal scene durations, one narration track and optional timed captions. Uploaded recordings require their own SRT for subtitles. Multi-user authentication and public hosting are not part of this release.
