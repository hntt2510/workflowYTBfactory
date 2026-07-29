# UI Workflows

## Application Navigation

The app uses hash-backed renderer routes:

- `#dashboard`
- `#projects`
- `#new-project`
- `#channel-profiles`
- `#production-queue`
- `#asset-library`
- `#providers`
- `#settings`
- `#diagnostics`

When a project is open, project routes are available:

- `#project-overview`
- `#idea-lab`
- `#research-claims`
- `#script`
- `#scenes`
- `#shots`
- `#visuals`
- `#voice`
- `#timeline`
- `#qa`
- `#export`

The persistent shell lives in `apps/desktop/src/renderer/layouts/AppShell.tsx`. Its top bar shows the open project, current stage, SQLite save state, a real project switcher backed by `load-project`, queue activity, and the settings shortcut.

## New Project Flow

The New Project Wizard collects topic, project name, format, language, target duration, workflow mode, and channel routing. Language is chosen from a dropdown with a custom override path, and target duration is editable with a default placeholder value. Creation uses the existing Electron `fixture-project` IPC, which persists the resulting project in SQLite. The generated content is labeled as demo because the script, scenes, shots, and ideas still come from deterministic fixture logic.

## Project Stage Flow

Project overview displays persisted project statistics, saved setup values, workflow stages, dependencies, blocked reasons, and links to project workflow screens. Stage screens show real persisted data where available:

- Idea Lab: demo generated ideas.
- Research & Claims: starter claims.
- Script: read-only script sections.
- Scenes: persisted scene data.
- Shots: persisted shot data.
- Timeline: frame-based timeline items.

Unavailable stages do not expose fake run buttons.

## Provider Setup

The Providers screen exposes the real keychain-backed 9Router credential IPC. API key input is write-only and cleared after save. Existing keys are never rendered. Base URL plus text, image, video, TTS, and STT model IDs can be saved with the credential reference. Provider-specific concurrency, timeout, model listing, and paid capability tests remain disabled or read-only until provider execution settings are implemented.

Other provider cards are read-only and marked unavailable because no runtime adapters are connected.

## Queue Workflow

The Production Queue screen displays the real queue snapshot from Electron bootstrap. The only runnable queue action calls the existing `mock-image-batch` IPC and is labeled `Queue simulation`.

## Known Unavailable Functions

- Real 9Router image generation.
- Asset download/decode/hash/assignment.
- Profile create/edit/import/export persistence.
- Script or scene editing persistence.
- Voice provider execution and manual audio import.
- FFmpeg preview IPC.
- Editable CapCut draft export.
- Project ZIP import/export.

## Settings

Settings is organized into General, Workspace, Appearance, Generation, CapCut, FFmpeg, Security, and Diagnostics. Values that are not persisted or connected yet are shown as unavailable, needs setup, or disabled with a reason.

## Runtime Verification

`scripts/capture-ui-screenshots.cjs` starts the Vite renderer when `UI_SCREENSHOT_URL` is not provided, drives the renderer workflow through Chrome DevTools, and writes the required screenshots. `scripts/verify-electron-ui.cjs` starts Vite and Electron with a temp workspace, creates a demo project, saves a write-only provider credential, restarts Electron, reopens the SQLite project, and verifies routed screens.
