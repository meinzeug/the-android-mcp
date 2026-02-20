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

## [3.22.0] - 2026-02-20
### Added
- Mission Command Center backend expansion with persistent command-audit storage in `~/.the-android-mcp/web-ui-ops-mission-command-audit.json`.
- New Mission Command Center APIs:
- `GET /api/ops/missions/command-center/contract`
- `GET /api/ops/missions/command-center/history`
- `POST /api/ops/missions/command-center/history/clear`
- `POST /api/ops/missions/command-center/device-drill`
- `GET /api/ops/missions/command-center/stream` (SSE live feed)
- New Web UI Command Center operator surfaces for:
- live stream start/stop and stream state
- command-audit history load/prune panel
- backend contract panel
- device-drill URL batch runner.

### Improved
- Mission/control-room/quick-fix/burst workflows now append command-audit records with mode/risk metadata for stronger operator traceability.
- Ops board/state/session/audit payloads now include command-audit visibility for backend-bound diagnostics and handoff.

## [3.21.0] - 2026-02-20
### Added
- New Mission Command Center backend intelligence and orchestration workflows:
- `GET /api/ops/missions/command-center`
- `GET /api/ops/missions/command-center/timeline`
- `GET /api/ops/missions/command-center/anomalies`
- `POST /api/ops/missions/command-center/quick-fix`
- `POST /api/ops/missions/command-center/burst-test`
- New dynamic Web UI Mission Command Center module with:
- one-click command-center load
- anomaly intelligence panel
- timeline trend panel
- quick-fix execution controls
- burst-test execution controls.

### Improved
- Ops board payloads now include command-center intelligence, mission timeline, and mission anomaly views for stronger backend-bound observability.
- Mission command-center views are now integrated into UI startup and periodic refresh loops for continuous operator visibility.

## [3.20.1] - 2026-02-20
### Fixed
- Follow-up publish to ensure Mission Intelligence features are available to users via `latest` npm installation.

### Includes
- Persistent mission run storage and lifecycle load/save.
- Mission intelligence APIs for analytics, schedule status, and due-run execution.
- Web UI mission intelligence panels and controls for analytics and due scheduling.

## [3.20.0] - 2026-02-20
### Added
- New persisted mission run storage in `~/.the-android-mcp/web-ui-ops-mission-runs.json` with automatic load/save lifecycle.
- New mission intelligence APIs:
- `GET /api/ops/missions/analytics`
- `GET /api/ops/missions/schedules/status`
- `POST /api/ops/missions/schedules/run-due`
- New Web UI Mission Intelligence controls and panels for:
- analytics overview (pass/fail rates, latency, top failure reasons)
- schedule status (due/overdue visibility)
- due-run execution from UI.

### Improved
- Mission state/ops/audit/session payloads now include analytics and schedule-status context for deeper operational diagnostics.
- Mission scheduler can now execute due schedules by priority and returns before/after status snapshots for safer operator workflows.

## [3.19.0] - 2026-02-20
### Added
- New mission scheduler guardrail policy backend with persistent policy state and cooldown-based suspension controls.
- New mission policy API workflows:
- `GET /api/ops/missions/policy`
- `POST /api/ops/missions/policy`
- `POST /api/ops/missions/policy/suspend`
- `POST /api/ops/missions/policy/resume`
- New mission scheduler forecasting and fleet-control APIs:
- `GET /api/ops/missions/schedules/forecast`
- `POST /api/ops/missions/schedules/pause-all`
- `POST /api/ops/missions/schedules/resume-all`
- `POST /api/ops/missions/schedules/rebalance`
- New Web UI sections for:
- mission policy control (load/save/suspend/resume)
- scheduler fleet control (pause/resume/rebalance)
- schedule forecast timeline panel.

### Improved
- Mission schedule execution now enforces guardrail policy state and tracks consecutive failures for automatic scheduler suspension.
- Ops state/board/audit/session payloads now include mission policy context for deeper operational visibility and release confidence.

## [3.18.0] - 2026-02-20
### Added
- New mission scheduler backend for persistent automated mission execution.
- New mission scheduler API workflows:
- `GET /api/ops/missions/schedules`
- `POST /api/ops/missions/schedules`
- `POST /api/ops/missions/schedules/:id/start`
- `POST /api/ops/missions/schedules/:id/stop`
- `POST /api/ops/missions/schedules/:id/run-now`
- `DELETE /api/ops/missions/schedules/:id`
- New Web UI Mission Scheduler controls for schedule save/list/start/stop/run-now/delete with live status panel.
- Mission scheduler state is now persisted in `~/.the-android-mcp/web-ui-ops-mission-schedules.json` and auto-restored on server start.

### Improved
- Ops state/board/audit/session payloads now include mission schedule counts and schedule inventory for better operations observability.
- Mission orchestration now supports continuous loop automation with failure accounting and recent error visibility directly in Web UI.

## [3.17.0] - 2026-02-20
### Added
- New persisted ops mission orchestration model with mission definitions (`scenario + policy preset + watchdog profile + gate policy + action queue plan`).
- New ops mission API workflows:
- `GET /api/ops/missions`
- `POST /api/ops/missions`
- `DELETE /api/ops/missions/:name`
- `POST /api/ops/missions/plan`
- `POST /api/ops/missions/run`
- `GET /api/ops/missions/runs`
- `POST /api/ops/missions/runs/clear`
- New Web UI Mission Control section with:
- mission authoring (scenario/policy/watchdog/queue/gate binding)
- one-click mission planning and execution
- live mission run history panel with status and gate result visibility.

### Improved
- Release gate evaluation now supports reusable policy-normalization and mission-specific gate previews.
- Ops board/state/session/audit payloads now include mission inventory and mission run history for stronger operator handoff and diagnostics.

## [3.16.0] - 2026-02-19
### Added
- New operations scenario management workflows:
- `GET /api/ops/scenarios`
- `POST /api/ops/scenarios`
- `DELETE /api/ops/scenarios/:name`
- `POST /api/ops/scenarios/run`
- New control-room history workflows:
- `GET /api/ops/control-room/history`
- `POST /api/ops/control-room/history/reset`
- New operations drill/readiness workflows:
- `POST /api/ops/chaos-drill`
- `GET /api/ops/release-readiness`
- New policy preset workflows:
- `GET /api/ops/policy-presets`
- `POST /api/ops/policy-presets`
- `POST /api/ops/policy-presets/apply`
- `DELETE /api/ops/policy-presets/:name`
- New watchdog profile workflows:
- `GET /api/ops/watchdog/profiles`
- `POST /api/ops/watchdog/profiles`
- `POST /api/ops/watchdog/profiles/run`
- `DELETE /api/ops/watchdog/profiles/:name`
- New operations action queue workflows:
- `GET /api/ops/action-queue`
- `POST /api/ops/action-queue/enqueue`
- `POST /api/ops/action-queue/run-next`
- `POST /api/ops/action-queue/run-all`
- `POST /api/ops/action-queue/clear`
- New release gate workflows:
- `GET /api/ops/gate`
- `POST /api/ops/gate`
- `GET /api/ops/gate/evaluate`
- New Web UI controls and panels for:
- scenario save/list/run
- chaos drill execution
- release readiness report
- control-room history load/reset
- dedicated scenario/history panels.
- policy preset save/list/apply
- watchdog profile save/list/run
- action queue enqueue/execute/clear
- gate policy load/save/evaluate

### Improved
- Control-room payload generation now feeds history points for better trend visibility in operations mode.
- State/ops/audit/session payloads now include scenario and control-history context for stronger backend-bound observability.

## [3.15.0] - 2026-02-19
### Added
- New operations scenario backend workflows:
- `GET /api/ops/scenarios`
- `POST /api/ops/scenarios`
- `DELETE /api/ops/scenarios/:name`
- `POST /api/ops/scenarios/run`
- New control-room history workflows:
- `GET /api/ops/control-room/history`
- `POST /api/ops/control-room/history/reset`
- New advanced operations workflows:
- `POST /api/ops/chaos-drill`
- `GET /api/ops/release-readiness`
- New Web UI controls for:
- scenario save/list/run
- chaos drill execution
- release readiness report
- control history load/reset
- dedicated panels for ops scenarios and control history.

### Improved
- Control-room payloads now feed persistent in-memory history for richer operator timeline analysis.
- Audit/state/session payloads now include scenario and control-history context for handoff and diagnostics.

## [3.14.0] - 2026-02-19
### Added
- New reliability orchestration workflows:
- `POST /api/ops/auto-heal/preview`
- `POST /api/ops/stabilize`
- `POST /api/ops/watchdog/run`
- New queue recovery intelligence workflow:
- `POST /api/queue/snapshots/diff`
- New campaign planning workflow:
- `POST /api/runbook/campaign/plan`
- New Web UI controls for:
- Auto-heal preview
- One-click stabilize
- Watchdog cycle
- Queue snapshot diff
- Runbook campaign planning
- Dedicated Control Room panel with live severity/score/recommendations.

### Improved
- Control Room is now continuously refreshed in background and rendered as a first-class operations panel.
- Operator lane targeting is now explicit in UI and reused across heal/stabilize/watchdog actions.

## [3.13.0] - 2026-02-19
### Added
- New control-room backend and UI orchestration workflows:
- `GET /api/ops/control-room`
- `POST /api/ops/auto-heal`
- New queue snapshot library workflows:
- `GET /api/queue/snapshots`
- `POST /api/queue/snapshots/save`
- `POST /api/queue/snapshots/apply`
- New runbook fleet orchestration workflow:
- `POST /api/runbook/campaign`
- New alert governance workflow:
- `POST /api/alerts/rules/seed`
- New Web UI controls for control-room load, auto-heal execution, queue snapshot save/list/apply, runbook campaign execution, and one-click alert pack seeding.

### Improved
- Ops board/state/session/audit payloads now include queue snapshot awareness for richer recovery handoff context.
- Web UI now pre-fills campaign target devices automatically and keeps backend-first operator flows in one pane.

## [3.12.0] - 2026-02-19
### Added
- New audit and diagnostics backend workflows:
- `GET /api/audit/export`
- `GET /api/diagnostics/report`
- New runbook automation workflows:
- `POST /api/runbook/batch`
- Audited runbook execution tracking in session and ops payloads.
- New queue orchestration workflow:
- `POST /api/jobs/clone-lane`
- New schedule execution control:
- `POST /api/schedules/:id/run-now`
- New alert lifecycle workflow:
- `POST /api/alerts/incidents/prune`
- New Web UI controls for audit export, diagnostics report, runbook batch execution, lane clone, schedule run-now, and incident prune.

### Improved
- Runbook execution telemetry is now persisted in exported session context and surfaced in the ops board.
- Baseline and alert workflows are now integrated deeper into realtime operator feedback paths.

## [3.11.0] - 2026-02-19
### Added
- New device baseline workflows:
- `GET /api/device/baselines`
- `POST /api/device/baselines/save`
- `POST /api/device/compare-baseline`
- New diagnostics report endpoint:
- `GET /api/diagnostics/report`
- New alert incident mass-action endpoint:
- `POST /api/alerts/incidents/ack-all`
- New runbook planning endpoint:
- `GET /api/runbook/catalog`
- `POST /api/runbook/preview`
- New queue transfer workflows:
- `GET /api/queue/export`
- `POST /api/queue/import`
- New Web UI controls for baselines, diagnostics report, alert ack-all, runbook preview/catalog, and queue import/export.

### Improved
- Persistent schedules auto-restore on Web UI startup.
- Ops board/session export now include richer alert and schedule context.
- WebSocket realtime stream carries alert-triggered incidents for live operator feedback.

## [3.10.0] - 2026-02-19
### Added
- New alerting backend with rules + incidents:
- `GET /api/alerts/rules`
- `POST /api/alerts/rules`
- `DELETE /api/alerts/rules/:id`
- `GET /api/alerts/incidents`
- `POST /api/alerts/check`
- `POST /api/alerts/incidents/:id/ack`
- New runbook discovery/preview backend:
- `GET /api/runbook/catalog`
- `POST /api/runbook/preview`
- New queue transfer backend:
- `GET /api/queue/export`
- `POST /api/queue/import`
- New persistent schedule storage and auto-restore on Web UI startup.
- New Web UI controls for alerts, runbook preview/catalog, and queue export/import.

### Improved
- WebSocket realtime channel now transports alert events for low-latency operator feedback.
- Session export now includes schedules and alert state for better diagnostics handoff.
- Ops board enriched with live alert and schedule context.

## [3.9.0] - 2026-02-19
### Added
- New websocket realtime backend stream:
- `GET /api/ws` upgrade endpoint for live event delivery to Web UI.
- New queue board and lane-control APIs:
- `GET /api/board/queue`
- `POST /api/jobs/:id/move`
- New schedule automation APIs:
- `GET /api/schedules`
- `POST /api/schedules`
- `POST /api/schedules/:id/start`
- `POST /api/schedules/:id/stop`
- `DELETE /api/schedules/:id`
- New advanced operations APIs:
- `POST /api/jobs/transaction`
- `POST /api/jobs/reorder`
- `GET /api/ops/board`
- New Web UI controls for queue board, move/reorder, schedule automation, and ops board.

### Improved
- Web UI realtime transport now prefers websocket and falls back to SSE automatically.
- Lane execution now supports policy-based queue pressure signals and failure auto-pause behavior.
- State/dashboard payloads now expose schedule and websocket client visibility.

## [3.8.0] - 2026-02-19
### Added
- New operations policy backend:
- `GET /api/policy`
- `POST /api/policy`
- New transactional queue backend:
- `POST /api/jobs/transaction`
- `POST /api/jobs/reorder`
- New runbook automation backend:
- `POST /api/runbook/run` with built-in runbooks (`recover-lane`, `purge-lane`, `smoke-now`, `autopilot-lite`).
- New operations board backend:
- `GET /api/ops/board`
- Web UI controls for policy load/save, runbook execution, transaction dry-run/execute, and ops board rendering.

### Improved
- Lane execution now supports policy-driven auto-pause after failure threshold.
- Queue pressure events now emit when lane depth exceeds policy threshold.
- Web UI gained deeper backend-bound orchestration controls while keeping live timeline and recorder/preset workflows.

## [3.7.0] - 2026-02-19
### Added
- New recorder APIs for queue capture + replay:
- `POST /api/recorder/start`
- `POST /api/recorder/stop`
- `GET /api/recorder/sessions`
- `POST /api/recorder/replay`
- New queue preset APIs with persistent storage:
- `GET /api/queue-presets`
- `POST /api/queue-presets`
- `POST /api/queue-presets/run`
- New lane heatmap API:
- `GET /api/lanes/heatmap`
- New wallboard API for multi-device health snapshots:
- `POST /api/device/wallboard`
- New timeline chart and advanced operator controls in Web UI for recorder, presets, heatmap, and wallboard.

### Improved
- Job creation now supports recorder capture for exact replayable queue sessions.
- Dashboard/state/session payloads include richer orchestration metadata (presets, recorder, timeline).
- Web UI now renders timeline telemetry as a live chart with backend-backed refresh.

## [3.6.0] - 2026-02-19
### Added
- New autopilot orchestration API:
- `POST /api/autopilot/run` to enqueue multi-loop, multi-device mixed job bundles.
- New device smoke API:
- `POST /api/device/smoke` for fast URL-open + profile health run with pass/fail result.
- New queue maintenance APIs:
- `POST /api/jobs/retry-failed`
- `POST /api/jobs/prune`
- New dashboard timeline telemetry APIs:
- `GET /api/dashboard/timeline`
- `POST /api/dashboard/timeline/reset`
- New Web UI operator controls for smoke tests, failed-job retries, pruning, autopilot, and timeline inspection/reset.

### Improved
- Live telemetry now records timeline points from backend events for better queue/lane observability.
- State payload now reports `activeLaneCount` alongside existing queue and lane counters.
- Session export now includes dashboard timeline data.

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
