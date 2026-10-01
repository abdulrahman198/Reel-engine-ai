# Reel Engine AI v0.2

A local-first short-video production engine built from scratch.

## What works now
- Create a project from a topic in Arabic, German, or English
- 30/45/60 second production plans
- Automatic editable script draft
- Automatic 4–6 scene breakdown
- Visual-generation prompt for every scene
- Estimated word/caption timing
- Vertical 9:16 storyboard preview
- Local QA checks
- Human approval gate
- Export SRT captions
- Export project JSON
- Export a render manifest prepared for ElevenLabs, Whisper and FFmpeg/Remotion adapters
- Autosave project in browser localStorage
- No API keys required for the local MVP

## Run
Open `index.html` in a modern browser. No install or npm step is required for v0.2.

## Next production adapters
1. LLM provider for real script generation
2. ElevenLabs voice generation
3. Whisper transcription/alignment
4. Image/video generation provider
5. FFmpeg/Remotion final MP4 renderer
6. Optional publishing providers after explicit human approval

Secrets should be supplied server-side or through environment variables in the production version, never committed to the repository.
