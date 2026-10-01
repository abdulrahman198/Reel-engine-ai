# v0.7 validation — 1 October 2026

Verified with Node.js 24.19.0 and local FFmpeg/FFprobe.

- Dependency installation with the pinned package manifest and lockfile succeeded.
- `npm run build`: passed (React/Vite production bundle).
- `npm test`: **16 passed**, including draft persistence across store recreation, incomplete draft edits, audio normalization, Arabic/German SRT parsing, image decoding, invalid payloads, origin/Host checks, credential redaction, provider response mocks and job recovery. Codespaces coverage checks its exact forwarded host/origin, preflight, project creation, rejection of other codespaces, private-origin overrides and incomplete environment metadata.
- `npm run test:render`: **passed** with real FFmpeg. It produced a 30-second 1080×1920 H.264/AAC video, plus a 1280×720 video with narration longer than the original plan and burned-in subtitles. Output dimensions, 30 fps, playback ranges, download headers and preservation of the complete narration were verified.
- Exported frames were visually inspected: Arabic shaping, German/Arabic screen text and subtitle placement were present.
- Provider calls use deterministic mocks for tests. No paid OpenAI or ElevenLabs requests were made. Live account permissions, provider costs and generated output quality were not tested.
- Full browser interaction/mobile-layout verification could not be completed: the browser binary download was invalid in the environment, and the available remote browser blocked access to the localhost preview. The UI build passed; this does not replace browser QA.
- Docker packaging is supplied but was not built or run in this environment.
- Codespaces automatic-start smoke check passed locally: first start, repeated-start reuse, built UI response, forwarded Host/Origin access and FFmpeg/FFprobe readiness. The dev-container JSON was parsed successfully. An actual GitHub Codespace was not provisioned; the container build, GitHub sign-in and phone browser flow remain unverified.

Current scope: still-image camera motion, equal scene durations, one narration track and optional timed captions. Uploaded recordings require their own SRT for subtitles. Multi-user authentication and public hosting are not part of this release.

## Codespaces recovery update — 2 October 2026

- Fixed frontend routes being omitted permanently when the server started before `dist/index.html` existed. A regression test starts with no built UI, checks the explicit setup error, writes a build, and verifies HTML and JavaScript become available on the same running server.
- Added `npm run codespace` for dependency installation, build and managed-server restart, plus `npm run codespace:check` for read-only local readiness checks. Checks cover the HTML, JavaScript bundle and exact forwarded Host/Origin in addition to API health. They do not claim to verify the GitHub tunnel.
- `npm run build`: passed. `npm test`: **22 passed, 1 skipped, 0 failed**. Startup checks exercise a stopped server, first start, repeated-start reuse, unavailable UI/bundle detection and refusal to stop an unrelated process.
- The successful managed-restart integration check is skipped in this execution environment because its virtual process IDs do not match the exposed `/proc` tree. The ownership check fails closed when a live process cannot be verified. Successful process replacement on a real Linux Codespace remains unverified.
- The actual user's Codespace, private preview URL and mobile browser flow remain unverified because the agent browser has not authenticated to GitHub. This repository update is not proof that the reported external 502 has been resolved. The full FFmpeg render suite was not repeated for these startup changes.
