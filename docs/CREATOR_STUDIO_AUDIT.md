# Creator Studio Repository Audit

## Current flow

New character-first projects currently move through project setup, story/review stages, scene and shot planning, character preparation, visual routing, asset concepts, prompt preparation, manual asset intake/review, voice, subtitles, timeline, preview, QA, and export. Legacy projects retain the provider-oriented visual stages. The renderer already exposes a five-item phase stepper, but most detailed stages remain visible as an admin-style route registry.

## Architectural bottlenecks

- `apps/desktop/src/renderer/App.tsx` contains app state, route dispatch, data fetching, mutations, and the remaining project-creation, production, and voice-settings screen logic in a 1,352-line module; Story route screens now live in `apps/desktop/src/renderer/features/story/StoryScreens.tsx`.
- `AppShell` and `styles.css` provide a dark foundation, but permanent navigation and copy still expose technical routes/statuses instead of a creator journey.
- Manual asset intake exists and preserves scene assets, but the normal path still shares eligibility and orchestration assumptions with automatic image acquisition.
- Prompt preparation already compiles scene-level GG Lab prompts and numeric frame manifests, but the creator-facing flow needs a single scene prompt surface and explicit upload gate.
- FFmpeg command planning and preview validation exist; the repository lacks a deterministic real-media fixture proving the full image/voice/subtitle/audio/output contract.
- CapCut packaging has a typed adapter and render-safe media preparation, but must remain optional after a valid MP4.

## Dead or duplicated paths

- Detailed internal routes are duplicated by the phase stepper and the project overview; they should remain available under an advanced surface without competing with the five phases.
- Manual and provider asset acquisition share the same stage id; the domain must choose the runner/eligibility by visual workflow without changing legacy behavior.
- Renderer status labels and action copy are repeated in multiple components and currently leak raw internal vocabulary.

## Migration risks

- Existing SQLite projects may lack newer character, composition, prompt-manifest, or audio metadata; parsing must stay backward-compatible and derive defaults.
- Stage invalidation is artifact-aware but is still easy to broaden accidentally when replacing a single frame.
- FFmpeg availability varies by Windows installation; tests must use deterministic probes and report a clear setup action without inventing media.
- User-uploaded assets must never be overwritten or deleted during normalization, replacement, or render retries.

## Implementation phases

1. Normalize manual-first eligibility/orchestration and creator-facing state labels.
2. Split route-level renderer modules around a shared studio shell and phase model.
3. Build Director, Prompt Studio, and Asset Intake surfaces on existing typed APIs.
4. Harden deterministic FFmpeg timeline/audio/asset validation and add the 3-scene fixture.
5. Preserve optional CapCut handoff, legacy routing, and dependency-aware invalidation.
6. Run full unit, lint, typecheck, desktop build, Electron/screenshot, and FFprobe verification; then perform read-only review and independent QA.
