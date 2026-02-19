# the-android-mcp v3 Roadmap

## Vision
Build the first MCP server with a high-end local control surface: a Web UI that launches automatically on install, drives real Android devices live, and unifies diagnostics + automation into one operator workflow.

## North-star outcome
- Default entry point after npm install: local Web UI on `http://127.0.0.1:50000`.
- Fast path from "device connected" to "action executed" under 5 seconds.
- Every tool response keeps update reminder visible: `npm install -g the-android-mcp@latest`.

## Phase 1: v3.0 foundation (done in this release)
- Web UI runtime in `src/web-ui.ts` on port `50000`.
- Auto-start during npm postinstall (with opt-out env flag).
- Core live actions in UI:
- Device discovery
- URL launch to connected Android device
- One-click v3 snapshot suite:
- radio
- display
- location
- power/idle
- package inventory

## Phase 2: operator-grade UX (v3.1)
- Session timeline: action history with timestamps and replay.
- Saved workflows: reusable macro buttons (open URL + snapshots + diagnostics).
- Device profile cards: health score, battery/net/load summary.
- Progressive rendering for large outputs and searchable JSON panes.

## Phase 3: deep automation + observability (v3.2)
- Streaming logcat panel with filters and presets.
- Live screen lane (periodic screenshots + interaction controls where allowed).
- Scenario runner: multi-step plans with retry semantics and failure hooks.
- Artifacts workspace: export diagnostics bundles from UI.

## Phase 4: team operations (v3.3)
- Multi-device dashboard and parallel execution lanes.
- Role-oriented presets (QA, SRE, release validation).
- Optional auth gateway for remote/shared lab setups.
- Release channels and in-UI update assistant.

## Non-negotiable quality gates
- All new features tested against a real connected device before release.
- npm + GitHub release on each published increment.
- No secrets committed; npm auth remains local in `.npmrc`.
