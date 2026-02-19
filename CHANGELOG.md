# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial implementation of The Android MCP (forked from infiniV/Android-Ui-MCP)
- Support for capturing screenshots from Android devices and emulators
- Support for listing connected Android devices with detailed information
- APK discovery + install/uninstall
- App start/stop/clear data
- Input controls (tap, swipe, text, keyevent)
- Logcat fetch with filtering
- Activity listing and hot-reload helper (reverse ports + optional install/start)
- Comprehensive error handling with user-friendly error messages
- Docker support for containerized deployment
- Unit and integration tests
- Documentation and examples
- New MCP tooling for settings-driven workflows: `open_android_settings`, `configure_usb_debugging`, and USB debugging state inspection/fallback automation.
- New MCP tooling for direct browser automation: `open_chrome_url` and faster settings-toggle discovery for USB debugging via scroll-aware UI fallback.
- Added `open_chrome_url_and_login` for one-shot Chrome navigation + credential fill + submit fallback.

## [3.5.0] - 2026-02-19
### Added
- New Web UI/backend dashboard payload endpoint:
- `GET /api/dashboard`
- New lane control APIs for operations at scale:
- `POST /api/lanes/pause-all`
- `POST /api/lanes/resume-all`
- `POST /api/lanes/:laneId/pause`
- `POST /api/lanes/:laneId/resume`
- New queue control APIs:
- `POST /api/jobs/:id/promote`
- `POST /api/jobs/cancel-queued`
- New burst scenario API for high-throughput orchestration:
- `POST /api/scenario/burst`
- New queue control panel in Web UI (pause/resume all lanes, cancel queued jobs, burst enqueue, dashboard load).

### Improved
- Lane scheduler now supports paused lanes and reports paused lane state in API payloads.
- Web UI lane cards now support per-lane pause/resume and queued-job promote actions.
- Command center version display now reflects runtime package version dynamically.
- Removed duplicated client-side `connectEvents`/`refreshCore` blocks in Web UI script for cleaner and more predictable behavior.

## [3.4.0] - 2026-02-19
### Added
- Multi-lane job orchestration backend for device-scoped queues with new APIs:
- `GET /api/lanes`
- `POST /api/jobs/bulk`
- `POST /api/jobs/:id/retry`
- New session lifecycle APIs:
- `GET /api/session/export`
- `POST /api/session/reset`
- New profile matrix endpoint: `POST /api/device/profiles` for multi-device profiling.
- Persistent session event log written to `~/.the-android-mcp/web-ui-session-events.ndjson`.

### Improved
- Web UI upgraded with dedicated panels for lanes, queue jobs, bulk enqueue, retry/cancel, and session controls.
- Job execution now runs per-lane with concurrent lane processing and sequential execution inside each lane.
- Event/metric coverage expanded for queue, lane, session, and profile operations.

## [3.3.0] - 2026-02-19
### Added
- Job orchestrator APIs for queued backend execution:
- `GET /api/jobs`
- `POST /api/jobs`
- `GET /api/jobs/:id`
- `POST /api/jobs/:id/cancel`
- New device profile endpoint: `POST /api/device/profile` for fast operator-level status snapshots.
- Workflow import/export APIs:
- `GET /api/workflows/export`
- `POST /api/workflows/import`
- Upgraded Web UI panels for jobs queue, workflow import/export, and device profile capture.

### Improved
- Backend now executes queued jobs sequentially with live status events (`job-queued`, `job-running`, `job-completed`, `job-failed`).
- Metrics and event streams now include queue/workflow/profile operations for better observability.
- Web UI keeps update hint visible and actionable (`npm install -g the-android-mcp@latest`).

## [3.2.0] - 2026-02-19
### Added
- Web UI workflow engine with persistent storage in `~/.the-android-mcp/web-ui-workflows.json`.
- New workflow APIs:
- `GET /api/workflows`
- `POST /api/workflows`
- `DELETE /api/workflows/:name`
- `POST /api/workflows/run`
- New Web UI APIs for operational visibility:
- `GET /api/metrics` (backend counters/latency/success-rate)
- `POST /api/snapshot/diff` (compare latest snapshot with previous capture)
- Upgraded UI controls for workflow save/run/delete and snapshot diff actions.

### Improved
- Event stream + action history now capture workflow and diff operations as first-class events.
- Backend action handling now tracked with per-endpoint metrics.
- Web UI keeps update hints visible (`npm install -g the-android-mcp@latest`) across responses and UI.

## [3.1.0] - 2026-02-19
### Added
- Upgraded Web UI backend on `http://127.0.0.1:50000` with:
- state endpoint (`/api/state`)
- history endpoint (`/api/history`)
- live event stream via SSE (`/api/events`)
- full snapshot suite endpoint (`/api/snapshot-suite`)
- stress scenario endpoint (`/api/stress-run`) for multi-URL loop testing
- Upgraded operator UI with live event timeline, stress-run controls, and one-click suite execution.

### Improved
- Snapshot endpoints now return compact summaries by default with optional raw payloads.
- Web UI now exposes uptime/version/device status and keeps update hints visible.
- npm package payload reduced by excluding `apps/gui/node_modules` from publish artifacts.

## [3.0.0] - 2026-02-19
### Added
- `capture_android_radio_snapshot`: radio state + wifi/telephony/bluetooth/IP/connectivity diagnostics in one call.
- `capture_android_display_snapshot`: display/window/SurfaceFlinger + brightness/rotation/timeout state snapshot.
- `capture_android_location_snapshot`: location mode/providers/mock-location + optional package app-ops diagnostics.
- `capture_android_power_idle_snapshot`: battery/power/deviceidle/thermal + batterystats snapshot for doze/power debugging.
- `capture_android_package_inventory_snapshot`: package inventory counts/lists with optional paths and device feature snapshot.
- New local Web UI server on `http://127.0.0.1:50000` with live device list, URL launcher, and one-click v3 snapshot actions.
- New npm binary `the-android-mcp-web-ui` for manual Web UI startup.
- New `ROADMAP_V3.md` with structured milestones toward the full v3 platform rollout.

### Improved
- New snapshot tools return the same update reminder (`npm install -g the-android-mcp@latest`) in tool output.
- `postinstall` now auto-starts the Web UI on npm install (skip with `THE_ANDROID_MCP_NO_WEB_UI_AUTOSTART=1`).

## [2.5.0] - 2026-02-19
### Added
- `capture_android_security_snapshot`: SELinux/developer options/package verifier posture + optional policy/user/app-ops data.
- `capture_android_package_permissions_snapshot`: requested/runtime permissions + app-ops + package-level permission intelligence.
- `capture_android_system_health_snapshot`: uptime/load/cpu/memory/vmstat/disk/kernel health telemetry.
- `capture_android_audio_media_snapshot`: audio/media-session/router/flinger/codec diagnostics snapshots.
- `capture_android_input_snapshot`: input/input_method/IME/window-policy diagnostics snapshots.

### Improved
- Tool responses keep the upgrade reminder (`npm install -g the-android-mcp@latest`) visible for users.

## [2.4.0] - 2026-02-19
### Added
- `capture_android_notification_snapshot`: notification manager snapshot with optional listeners/policy/stats views.
- `capture_android_process_snapshot`: process table + top + activity process dump with optional per-app PID details.
- `capture_android_services_snapshot`: activity services plus optional jobs/alarms/broadcast/package dumps.
- `capture_android_sensors_snapshot`: sensorservice plus optional thermal/power/display snapshots.
- `capture_android_graphics_snapshot`: SurfaceFlinger/window/gfxinfo snapshots for rendering diagnostics.

### Improved
- Tool responses continue to include update reminder text for global npm upgrades.

## [2.3.0] - 2026-02-19
### Added
- `capture_android_performance_snapshot`: top/load/mem/gfx/cpu snapshots for runtime performance analysis.
- `capture_android_battery_snapshot`: battery + batterystats + optional history/reset workflows.
- `capture_android_network_snapshot`: IP/route/DNS plus optional wifi/connectivity/netstats snapshots.
- `capture_android_storage_snapshot`: df/diskstats and optional package data/media usage probes.
- `capture_android_crash_snapshot`: crash buffer + activity crashes + optional ANR/tombstone/dropbox probes.

### Improved
- Tool-call responses now include a visible update reminder (`npm install -g the-android-mcp@latest`).

## [2.2.0] - 2026-02-19
### Added
- `run_android_shell`: run raw `adb shell` commands through MCP.
- `run_android_monkey`: package-scoped or global monkey stress testing.
- `record_android_screen`: record MP4 on-device and pull artifact locally.
- `capture_android_bugreport`: create local bugreport artifacts for deep debugging.
- `collect_android_diagnostics`: one-call snapshot for activity, window, hash, properties, logcat, and optional UI dump.

## [2.0.1] - 2026-01-25
### Added
- 20+ new MCP tools: keyboard IME helpers, wait-for-disappear, scroll helpers, long-press/double-tap, scroll-until, app/package inspectors, property lookups, and URL open/paste tools.

### Improved
- Smarter login field detection (EditText/password hints) for faster `smart_login` flows.
- Submit button selection now prefers clickable button nodes near login fields.

## [2.0.2] - 2026-01-25
### Improved
- Submit detection now resolves clickable containers around submit text (e.g. Compose buttons).

## [2.0.3] - 2026-01-25
### Added
- GitHub issue creation tool (`create_github_issue`) for bug/enhancement reporting.
- Smart gesture helpers (`smart_swipe`, `smart_scroll`) and swipe+shot tool.

### Improved
- Screenshot throttling for faster repeated captures.
- README now includes an efficiency playbook for coding AIs.

## [2.0.0] - 2026-01-25
### Added
- Smart login tools (`smart_login`, `detect_login_fields`, `smart_login_fast`).
- ADB keyboard IME controls and text input helper for fast typing.
- Device aliasing and fast-flow batch actions for speed.

## [0.1.5] - 2026-01-25
### Added
- Root-level GUI launcher bin to avoid publish-time warnings.

### Fixed
- Distribution packaging now bundles GUI assets and bin launchers consistently.

## [0.1.4] - 2026-01-25
### Added
- Global GUI launcher (`the-android-mcp-gui`) after `npm install -g`.
- GUI assets bundled with the npm package.

### Fixed
- Linux Electron sandbox fallback now works when `chrome-sandbox` is misconfigured.

## [0.1.2] - 2026-01-24
### Added
- APK install from URL (`apkUrl`) with automatic download.
- New tools: current activity, window size, and UI hierarchy dump.

## [0.1.3] - 2026-01-24
### Added
- Linux GUI app (Electron) under `apps/gui` for visual MCP control.

## [0.1.1] - 2026-01-24
### Added
- Auto-register Codex MCP config on install (writes `~/.codex/config.toml` if present).

## [0.1.0] - 2026-01-24

### Added
- Initial public release of The Android MCP
