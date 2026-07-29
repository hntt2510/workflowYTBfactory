# UI Design System

## Color Tokens

The renderer defines the dark theme in `apps/desktop/src/renderer/styles.css`.

- `--background: #0b0d10`
- `--surface-1: #111419`
- `--surface-2: #171b21`
- `--surface-3: #1d222a`
- `--border: #272d36`
- `--text-primary: #f3f4f6`
- `--text-secondary: #a5acb8`
- `--text-muted: #707887`
- `--accent: #6d8cff`
- `--success: #4fb58b`
- `--warning: #d2a44c`
- `--danger: #d86666`
- `--info: #65a5d8`

One accent color is used for active navigation and primary actions. Status colors are reserved for real state.

## Typography And Spacing

- Page title: 24px semibold.
- Section title: 16px semibold.
- Body: 13-14px.
- Metadata and tables: 12-13px.
- Timecode and diagnostics use monospace where applicable.
- Cards use 8px radius; controls use 6px radius.

## Surfaces

The shell uses a persistent sidebar, top bar, and scrollable content region. Cards use subtle borders and restrained surface contrast rather than bright decorative panels.

## Status Rules

- `Ready` and persisted states use green.
- `Not configured`, blocked, unavailable, or demo output uses amber.
- Errors use red.
- Experimental or running states use blue.

Mock-only output is labeled `Demo generation` or `Queue simulation`.

## Component Rules

Reusable renderer primitives:

- `AppShell`
- `LoadingScreen`
- `PageHeader`
- `SectionCard`
- `MetricCard`
- `DataTable`
- `StatusBadge`
- `EmptyState`
- `DisabledAction`
- `FormField`
- `TagList`
- `ScoreBar`
- settings definition lists
- provider capability cards

Buttons are active only when they call a real preload/main-process function. Unavailable actions are disabled with a reason.

The persistent sidebar and top bar live in `apps/desktop/src/renderer/layouts/AppShell.tsx`; route screens are composed from the reusable primitives and typed renderer client functions.

## Screenshots

Screenshots are stored in `docs/screenshots/` after runtime verification.

- `docs/screenshots/dashboard.png`
- `docs/screenshots/new-project-wizard.png`
- `docs/screenshots/project-overview.png`
- `docs/screenshots/shot-board.png`
- `docs/screenshots/production-queue.png`
- `docs/screenshots/provider-settings.png`
