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
