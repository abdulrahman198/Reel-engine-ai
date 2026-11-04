# Handala Studio product plan

## Product direction

A creator-focused video production workspace for Arabic, German and English social storytelling. The product should make it easier to move from research and an idea to a script, scenes, narration, subtitles and an exported video.

## Existing foundation to preserve

- Multi-project workspace with server persistence and browser draft backup.
- Arabic, German and English interface.
- Script and scene planning, editable scene prompts and on-screen text.
- Image upload and optional provider image generation.
- ElevenLabs narration and subtitle timing when configured.
- SRT import, subtitle burn-in and real FFmpeg MP4 export.
- Portrait 9:16 and landscape 16:9 output.

## Planned work

### Phase 1 — Brand and onboarding
- Adopt Handala Studio naming in the application shell and setup documentation.
- Preserve existing project data keys and current export behavior.
- Improve the README and Arabic quick-start guide.

### Phase 2 — Creator workspace
- Add a clear project dashboard and workspace navigation.
- Improve mobile layout and preview workflow.
- Add reusable script, scene and motion-graphics presets.

### Phase 3 — API catalogue
- Add searchable API discovery based on the public-apis catalogue.
- Distinguish discovered APIs from configured and tested integrations.
- Implement safe server-side adapters only for selected providers.

### Phase 4 — Production tools
- Add better timeline controls and scene timing.
- Improve voice, subtitle and visual asset management.
- Add export presets for TikTok, Instagram Reels and YouTube.

### Phase 5 — Quality and release
- Add automated UI and API tests for each new feature.
- Verify Arabic RTL, German and English flows.
- Document secrets, backups, deployment and privacy before any public hosting.

## Release principle

Do not remove working functionality to make the interface look newer. Every phase must preserve existing project compatibility and pass the relevant test suite.
