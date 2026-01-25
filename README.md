# The Android MCP

[![npm version](https://badge.fury.io/js/the-android-mcp.svg)](https://badge.fury.io/js/the-android-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://typescriptlang.org)
[![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)](https://nodejs.org)

> Build, ship, and validate Android UI changes in minutes — with AI agents that can see and touch your device.

## ⚡ What This Enables (Fast)

- **Instant UI feedback**: screenshots + UI hierarchy in one flow
- **Lightning login**: automatic form fill + submit detection
- **Hot reload at scale**: wire ports, install APKs, and restart apps from MCP
- **Human‑like navigation**: tap, swipe, scroll, and wait logic built-in

## Visual Overview

```mermaid
flowchart LR
  Dev[Code Changes] --> Agent[AI Agent]
  Agent --> MCP[MCP Server]
  MCP --> Device[Android Device]
  Device --> MCP
  MCP --> Agent
  Agent --> Dev
```

```mermaid
sequenceDiagram
  participant A as AI Agent
  participant M as MCP Server
  participant D as Android Device
  A->>M: smart_login_fast
  M->>D: UI dump and ADB input
  D-->>M: Updated UI state
  M->>D: Tap submit
  M-->>A: Result (fields found, submit tapped)
```

## Quick Start (Copy/Paste)

```bash
npm install -g the-android-mcp
the-android-mcp
```

```json
{
  "mcpServers": {
    "the-android-mcp": {
      "command": "the-android-mcp"
    }
  }
}
```

## Tool Highlights

| Goal | Tools |
| --- | --- |
| Fast login | `smart_login_fast`, `detect_login_fields`, `adb_keyboard_*` |
| Speedy flows | `fast_flow`, `run_flow_plan`, `batch_android_actions` |
| Robust waits | `wait_for_*`, `wait_for_*_disappear`, `wait_for_ui_stable` |
| Navigation | `tap_*`, `swipe_*`, `scroll_*`, `scroll_until_*` |
| App ops | `install_android_apk`, `start_android_app`, `hot_reload_android_app` |

## Performance Tips (Real‑World)

- Prefer `fast_flow` + `batch_android_actions` to reduce ADB round‑trips.
- Use `wait_for_ui_stable` to avoid flaky taps during transitions.
- Prefer `scroll_until_*` over manual scroll loops.
- For login screens, use `smart_login_fast` with ADB keyboard enabled.

## Efficiency Playbook (for Coding AIs)

Use this when you want **maximum speed** and **minimum ADB round‑trips**.

### 1) Prefer “one‑call” flows
- Use `fast_flow` or `run_flow_plan` to combine taps, text, waits, and screenshots in **one call**.
- Use `smart_swipe` / `smart_scroll` to **swipe + stabilize + (optional) screenshot** in one call.
- Use `swipe_and_screenshot` when you just need a fast swipe + capture.

### 2) Reduce screenshots to only what you need
- Use `take_android_screenshot` with `throttleMs` to reuse the last capture.
- Prefer **UI dumps** (`dump_android_ui_hierarchy`) for logic, and screenshots only for visual confirmation.

### 3) Use ADB keyboard for fast input
- `smart_login_fast` with `useAdbKeyboard=true` is the fastest login path.
- For manual input: `adb_keyboard_input` or `adb_keyboard_input_chars`.

### 4) Always wait for stability before tapping
- If a screen is changing, use `wait_for_ui_stable` or `smart_swipe` / `smart_scroll`.
- Avoid immediate taps after navigation without a wait; it causes flakiness.

### 5) Favor selector‑based taps over coordinates
- Use `tap_by_text`, `tap_by_id`, `tap_by_desc`, or `query_ui` + `tap_by_selector_index`.
- Coordinates are a fallback when no stable selectors exist.

### 6) Use scroll‑until helpers
- `scroll_until_text`, `scroll_until_id`, `scroll_until_desc` are faster and less flaky than manual loops.

### 7) Capture bug reports immediately
- When a flow fails, use `create_github_issue` with repro steps + logs/screenshots.

### Example: Fast login + submit + verify in one flow
```json
{
  "steps": [
    { "type": "wait_for_ui_stable", "stableIterations": 2 },
    { "type": "smart_login_fast", "email": "user@example.com", "password": "secret", "useAdbKeyboard": true },
    { "type": "wait_for_activity_change", "timeoutMs": 8000 }
  ],
  "stopOnFailure": true
}
```

ADB-powered Model Context Protocol server that lets AI coding agents install, launch, and control Android apps, capture screenshots, and wire hot-reload ports. Built for iterative UI refinement, automated test flows, and hands-on app navigation with Expo, React Native, Flutter, and native Android projects.

Based on the original project: [infiniV/Android-Ui-MCP](https://github.com/infiniV/Android-Ui-MCP).

**Keywords:** android mcp server, adb automation, android app testing, hot reload, android ui control, ai agent android, expo, react native, flutter

## Features

**Real-Time Development Workflow**

- Live screenshot capture during app development with Expo, React Native, Flutter
- Instant visual feedback for AI agents on UI changes and iterations
- Seamless integration with development servers and hot reload workflows
- Support for both physical devices and emulators during active development
- ADB-driven app install, launch, input control, and port reverse for hands-on testing

**AI Agent Integration**

- MCP protocol support for Claude Desktop, GitHub Copilot, and Gemini CLI
- Enable AI agents to see your app UI and provide contextual suggestions
- Perfect for iterative UI refinement and design feedback loops
- Visual context for AI-powered code generation and UI improvements

**Developer Experience**

- Zero-configuration setup with running development environments
- Docker deployment for team collaboration and CI/CD pipelines
- Comprehensive error handling with helpful development suggestions
- Secure stdio communication with timeout management

## Table of Contents

- [AI Agent Configuration](#ai-agent-configuration)
- [Installation](#installation)
- [GUI App (Linux)](#gui-app-linux)
- [Development Workflow](#development-workflow)
- [Prerequisites](#prerequisites)
- [Development Environment Setup](#development-environment-setup)
- [Docker Deployment](#docker-deployment)
- [Available Tools](#available-tools)
- [Usage Examples](#usage-examples)
- [Troubleshooting](#troubleshooting)
- [Development](#development)

## AI Agent Configuration

This MCP server works with AI agents that support the Model Context Protocol. Configure your preferred agent to enable real-time Android UI analysis:

Have fun exploring this tool!

We’re actively developing in the background right now — as you’re reading this.
A lot of work is happening at this very moment, and even more powerful tools are already in development.

This project is evolving fast, and there’s much more to come. 🚧

### Claude Code
```bash
# CLI Installation
claude mcp add the-android-mcp -- npx the-android-mcp

# Local Development
claude mcp add the-android-mcp -- node "D:\\projects\\the-android-mcp\\dist\\index.js"
```

### Claude Desktop
Add to `%APPDATA%\Claude\claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "the-android-mcp": {
      "command": "npx",
      "args": ["the-android-mcp"],
      "timeout": 10000
    }
  }
}
```

### GitHub Copilot (VS Code)
Add to `.vscode/settings.json`:
```json
{
  "github.copilot.enable": {
    "*": true
  },
  "mcp.servers": {
    "the-android-mcp": {
      "command": "npx",
      "args": ["the-android-mcp"],
      "timeout": 10000
    }
  }
}
```

### Gemini CLI
```bash
# CLI Installation
gemini mcp add the-android-mcp npx the-android-mcp

# Configuration
# Create ~/.gemini/settings.json with:
{
  "mcpServers": {
    "the-android-mcp": {
      "command": "npx",
      "args": ["the-android-mcp"]
    }
  }
}
```

### Codex
On install, the package auto-adds the server to `~/.codex/config.toml` if the file exists.
To skip auto-setup, set `THE_ANDROID_MCP_NO_CODEX_SETUP=1`.

If you need to add it manually, use:
```toml
[mcp_servers.the-android-mcp]
command = "npx"
args = ["-y", "the-android-mcp"]
timeout = 10000
```

## Installation

### Package Manager Installation

```bash
npm install -g the-android-mcp
```

Launch the GUI (after global install):

```bash
the-android-mcp-gui
```

### Source Installation

```bash
git clone https://github.com/meinzeug/the-android-mcp
cd the-android-mcp
npm install && npm run build
```

### Installation Verification

After installation, verify the package is available:

```bash
the-android-mcp --version
# For npm installation
npx the-android-mcp --version
```

Optional GUI launch:

```bash
the-android-mcp-gui
```

## GUI App (Linux)

Lightweight Electron GUI that talks to the MCP server over stdio and gives you a visual control surface for devices.

### Global GUI (recommended)

```bash
the-android-mcp-gui
```

This uses the GUI bundled with the npm package and launches the MCP server automatically.

### Local GUI (development)

```bash
# build MCP server first
npm run build

# start the GUI
cd apps/gui
npm install
npm run dev
```

**Linux sandbox note:** The GUI launcher auto-disables the Electron sandbox if `chrome-sandbox` isn’t correctly configured. To enforce sandboxing, set `THE_ANDROID_MCP_FORCE_SANDBOX=1` and fix permissions on your Electron install (for global installs, this is typically under `$(npm root -g)/the-android-mcp/node_modules/electron/dist/chrome-sandbox`).

The GUI auto-launches the MCP server from `dist/index.js` and exposes:
- device list + selection
- screenshots + tap overlay
- app install/start/stop
- text input + keyevents
- current activity, window size, UI hierarchy dump

## Development Workflow

This MCP server transforms how you develop Android UIs by giving AI agents real-time visual access to your running application. Here's the typical workflow:

1. **Start Your Development Environment**: Launch Expo, React Native Metro, Flutter, or Android Studio with your app running
2. **Connect the MCP Server**: Configure your AI agent (Claude, Copilot, Gemini) to use this MCP server
3. **Iterative Development**: Ask your AI agent to analyze the current UI, suggest improvements, or help implement changes
4. **Real-Time Feedback**: The AI agent takes screenshots to see the results of code changes immediately
5. **Refine and Repeat**: Continue the conversation with visual context for better UI development

**Perfect for:**

- Expo development with live preview and hot reload
- React Native development with Metro bundler
- Flutter development with hot reload
- Native Android development with instant run
- UI testing and visual regression analysis
- Collaborative design reviews with AI assistance
- Accessibility testing with visual context
- Cross-platform UI consistency checking

## Prerequisites

| Component | Version | Installation                                                                               |
| --------- | ------- | ------------------------------------------------------------------------------------------ |
| Node.js   | 18.0+   | [Download](https://nodejs.org)                                                             |
| npm       | 8.0+    | Included with Node.js                                                                      |
| ADB       | Latest  | [Android SDK Platform Tools](https://developer.android.com/studio/releases/platform-tools) |

### Android Device Setup

1. Enable Developer Options: Settings > About Phone > Tap "Build Number" 7 times
2. Enable USB Debugging: Settings > Developer Options > USB Debugging
3. Verify connection: `adb devices`


## Development Environment Setup

### Expo Development

1. Start your Expo development server:

```bash
npx expo start
# or
npm start
```

2. Open your app on a connected device or emulator
3. Ensure your device appears in `adb devices`
4. Your AI agent can now take screenshots during development

### React Native Development

1. Start Metro bundler:

```bash
npx react-native start
```

2. Run on Android:

```bash
npx react-native run-android
```

3. Enable hot reload for instant feedback with AI analysis

### Flutter Development

1. Start Flutter in debug mode:

```bash
flutter run
```

2. Use hot reload (`r`) and hot restart (`R`) while getting AI feedback
3. The AI agent can capture UI states after each change

### Native Android Development

1. Open project in Android Studio
2. Run app with instant run enabled
3. Connect device or start emulator
4. Enable AI agent integration for real-time UI analysis


## Docker Deployment

### Docker Compose

```bash
cd docker
docker-compose up --build -d
```

Configure AI platform for Docker:

```json
{
  "mcpServers": {
    "the-android-mcp": {
      "command": "docker",
      "args": ["exec", "the-android-mcp", "node", "/app/dist/index.js"],
      "timeout": 15000
    }
  }
}
```

### Manual Docker Build

```bash
docker build -t the-android-mcp .
docker run -it --rm --privileged -v /dev/bus/usb:/dev/bus/usb the-android-mcp
```

## Available Tools

| Tool                      | Description                               | Parameters                                                                 |
| ------------------------- | ----------------------------------------- | -------------------------------------------------------------------------- |
| `take_android_screenshot` | Captures device screenshot                | `deviceId` (optional), `throttleMs` (optional)                             |
| `list_android_devices`    | Lists connected devices                   | None                                                                       |
| `set_device_alias`        | Set a device alias                        | `alias`, `deviceId` (optional)                                             |
| `resolve_device_alias`    | Resolve device alias                      | `alias`                                                                    |
| `list_device_aliases`     | List device aliases                       | None                                                                       |
| `clear_device_alias`      | Clear a device alias                      | `alias`                                                                    |
| `list_imes`               | List available Android IMEs               | `deviceId` (optional)                                                      |
| `set_ime`                 | Set current Android IME                   | `imeId`, `deviceId` (optional)                                             |
| `enable_ime`              | Enable Android IME                        | `imeId`, `deviceId` (optional)                                             |
| `adb_keyboard_input`      | Input text via ADB Keyboard IME           | `text`, `imeId` (optional), `setIme` (optional)                            |
| `adb_keyboard_clear_text` | Clear text via ADB Keyboard IME           | `imeId` (optional), `setIme` (optional), `deviceId` (optional)             |
| `adb_keyboard_input_code` | Send key code via ADB Keyboard IME        | `code`, `imeId` (optional), `setIme` (optional), `deviceId` (optional)     |
| `adb_keyboard_editor_action` | Send editor action via ADB Keyboard IME | `code`, `imeId` (optional), `setIme` (optional), `deviceId` (optional)     |
| `adb_keyboard_input_chars`| Send unicode codepoints via ADB Keyboard  | `text`, `imeId` (optional), `setIme` (optional), `deviceId` (optional)     |
| `set_adb_keyboard_mode`   | Enable/disable ADB keyboard mode          | `enable` (optional), `imeId` (optional)                                    |
| `smart_login`             | Auto-fill login screen quickly            | `email`, `password`, `submitLabels` (optional)                             |
| `detect_login_fields`     | Detect login fields and submit button     | `submitLabels` (optional), `deviceId` (optional)                           |
| `smart_login_fast`        | Fast login (single dump + batch actions)  | `email`, `password`, `useAdbKeyboard` (optional)                           |
| `find_android_apk`        | Finds the most recent APK in a project    | `projectRoot` (optional)                                                   |
| `install_android_apk`     | Installs an APK on a device               | `apkPath`/`apkUrl` (optional), `deviceId` (optional), install flags, `timeoutMs` |
| `uninstall_android_app`   | Uninstalls an app by package name         | `packageName`, `deviceId` (optional), `keepData` (optional)                |
| `start_android_app`       | Starts an app (optionally activity)       | `packageName`, `activity` (optional), `deviceId` (optional)                |
| `get_android_current_activity` | Gets the focused activity           | `deviceId` (optional)                                                      |
| `get_android_window_size` | Gets device window size                   | `deviceId` (optional)                                                      |
| `list_installed_packages` | List installed package names              | filters (optional), `deviceId` (optional)                                  |
| `is_app_installed`        | Check if package is installed             | `packageName`, `deviceId` (optional)                                       |
| `get_app_version`         | Get app version info                      | `packageName`, `deviceId` (optional)                                       |
| `get_android_property`    | Read a system property                    | `property`, `deviceId` (optional)                                          |
| `get_android_properties`  | Read system properties by prefix          | `prefix` (optional), `deviceId` (optional)                                 |
| `open_url`                | Open URL via Android intent               | `url`, `deviceId` (optional)                                               |
| `paste_clipboard`         | Paste clipboard content                   | `deviceId` (optional)                                                      |
| `dump_android_ui_hierarchy` | Dumps UI hierarchy XML                  | `deviceId` (optional), `maxChars` (optional)                               |
| `stop_android_app`        | Force-stops an app                        | `packageName`, `deviceId` (optional)                                       |
| `clear_android_app_data`  | Clears app data                           | `packageName`, `deviceId` (optional)                                       |
| `tap_android_screen`      | Sends a tap event                         | `x`, `y`, `deviceId` (optional)                                            |
| `swipe_android_screen`    | Sends a swipe gesture                     | `startX`, `startY`, `endX`, `endY`, `durationMs` (optional), `deviceId`    |
| `swipe_and_screenshot`    | Swipe + screenshot in one call            | `startX`, `startY`, `endX`, `endY`, `postSwipeWaitMs` (optional)           |
| `smart_swipe`             | Swipe + auto-wait + optional screenshot   | `startX`, `startY`, `endX`, `endY`, `waitForUiStable`, `captureScreenshot` |
| `input_android_text`      | Types text into focused input             | `text`, `deviceId` (optional)                                              |
| `send_android_keyevent`   | Sends an Android keyevent                 | `keyCode`, `deviceId` (optional)                                           |
| `batch_android_actions`   | Runs multiple input actions in one call   | `actions`, `preActionWaitMs` (optional), `deviceId` (optional), `captureBefore`/`captureAfter` (optional), `timeoutMs` |
| `pm2_start_hot_mode`      | Start hot mode build via PM2              | `projectRoot`/`configPath` (optional), `appName` (optional)                |
| `pm2_stop_app`            | Stop a PM2 app by name                     | `appName`                                                                  |
| `pm2_list`                | List PM2 apps                              | None                                                                       |
| `fast_flow`               | Run fast UI flow (batch + optional dumps)  | `actions`/`steps`, `stepRetries`, `screenshotThrottleMs` (optional)         |
| `tap_by_text`             | Tap UI node by visible text               | `text`, `matchMode` (optional), `index` (optional), `deviceId` (optional)  |
| `tap_by_id`               | Tap UI node by resource-id                | `resourceId`, `index` (optional), `deviceId` (optional)                    |
| `tap_by_desc`             | Tap UI node by content-desc               | `contentDesc`, `matchMode` (optional), `index` (optional), `deviceId` (optional) |
| `wait_for_text`           | Wait for text via UI dump polling         | `text`, `matchMode` (optional), `timeoutMs`/`intervalMs` (optional)        |
| `wait_for_text_disappear` | Wait for text to disappear                | `text`, `matchMode` (optional), `timeoutMs`/`intervalMs` (optional)        |
| `type_by_id`              | Tap a field by id and type text           | `resourceId`, `text`, `matchMode`/`index` (optional), `deviceId` (optional)|
| `wait_for_id`             | Wait for resource-id via UI dump polling  | `resourceId`, `matchMode` (optional), `timeoutMs`/`intervalMs` (optional)  |
| `wait_for_id_disappear`   | Wait for resource-id to disappear         | `resourceId`, `matchMode` (optional), `timeoutMs`/`intervalMs` (optional)  |
| `wait_for_desc`           | Wait for content-desc via UI dump polling | `contentDesc`, `matchMode` (optional), `timeoutMs`/`intervalMs` (optional) |
| `wait_for_desc_disappear` | Wait for content-desc to disappear        | `contentDesc`, `matchMode` (optional), `timeoutMs`/`intervalMs` (optional) |
| `wait_for_activity`       | Wait for current activity/component       | `activity`, `matchMode` (optional), `timeoutMs`/`intervalMs` (optional)    |
| `wait_for_activity_change` | Wait for activity to change              | `previousActivity`/`targetActivity` (optional), `timeoutMs`/`intervalMs`   |
| `press_key_sequence`      | Press multiple keyevents in sequence      | `keyCodes`, `intervalMs` (optional), `deviceId` (optional)                 |
| `tap_relative`            | Tap using percentage coordinates          | `xPercent`, `yPercent`, `deviceId` (optional)                              |
| `swipe_relative`          | Swipe using percentage coordinates        | `startXPercent`, `startYPercent`, `endXPercent`, `endYPercent`, `durationMs`|
| `scroll_vertical`         | Scroll vertically via percentage swipe    | `direction`, `distancePercent` (optional), `deviceId` (optional)           |
| `scroll_horizontal`       | Scroll horizontally via percentage swipe  | `direction`, `distancePercent` (optional), `deviceId` (optional)           |
| `smart_scroll`            | Scroll + auto-wait + optional screenshot  | `direction`, `profile`, `waitForUiStable`, `captureScreenshot`             |
| `tap_center`              | Tap the center of the screen              | `deviceId` (optional)                                                      |
| `long_press`              | Long-press on coordinate                  | `x`, `y`, `durationMs` (optional), `deviceId` (optional)                   |
| `double_tap`              | Double-tap on coordinate                  | `x`, `y`, `intervalMs` (optional), `deviceId` (optional)                   |
| `wait_for_ui_stable`      | Wait for UI dump to stabilize             | `stableIterations`, `intervalMs`, `timeoutMs` (optional)                   |
| `get_screen_hash`         | Get UI hash from current dump             | `deviceId` (optional)                                                      |
| `scroll_until_text`       | Scroll until text appears                 | `text`, `matchMode` (optional), `maxScrolls` (optional)                    |
| `scroll_until_id`         | Scroll until resource-id appears          | `resourceId`, `matchMode` (optional), `maxScrolls` (optional)              |
| `scroll_until_desc`       | Scroll until content-desc appears         | `contentDesc`, `matchMode` (optional), `maxScrolls` (optional)             |
| `wait_for_package`        | Wait for package in foreground            | `packageName`, `timeoutMs`/`intervalMs` (optional)                         |
| `run_flow_plan`           | Execute a multi-step UI plan quickly      | `steps`, `stopOnFailure` (optional), `deviceId`/`deviceAlias` (optional)   |
| `query_ui`                | Query UI nodes by selector                | `selector`, `maxResults` (optional), `deviceId` (optional)                 |
| `wait_for_node_count`     | Wait for selector match count             | `selector`, `count`, `comparator` (optional)                               |
| `tap_by_selector_index`   | Tap selector match by index               | `selector`, `index` (optional), `deviceId` (optional)                      |
| `ui_dump_cached`          | Return last cached UI dump                | `deviceId` (optional), `maxChars` (optional)                               |
| `reverse_android_port`    | Reverse TCP port (device → host)          | `devicePort`, `hostPort` (optional), `deviceId` (optional)                 |
| `forward_android_port`    | Forward TCP port (host → device)          | `devicePort`, `hostPort`, `deviceId` (optional)                            |
| `get_android_logcat`      | Fetch recent logcat output                | `lines` (optional), filters, `deviceId` (optional)                         |
| `list_android_activities` | List activities for a package             | `packageName`, `deviceId` (optional)                                       |
| `hot_reload_android_app`  | Reverse ports + install/start for hot dev | `packageName`, `reversePorts`, install/start options, Play Protect handling, `deviceId` (optional)|
| `create_github_issue`     | Create a GitHub issue                     | `title`, `body` (optional), `labels` (optional), `assignees` (optional)     |

### Tool Schemas (selected)

Full schemas are exported via the MCP server and live in `src/types.ts`.

**take_android_screenshot**

```json
{
  "name": "take_android_screenshot",
  "description": "Capture a screenshot from an Android device or emulator",
  "inputSchema": {
    "type": "object",
    "properties": {
      "deviceId": {
        "type": "string",
        "description": "Optional device ID. If not provided, uses the first available device."
      },
      "format": {
        "type": "string",
        "description": "Image format (png)."
      }
    }
  }
}
```

**list_android_devices**

```json
{
  "name": "list_android_devices",
  "description": "List all connected Android devices and emulators with detailed information",
  "inputSchema": {
    "type": "object",
    "properties": {}
  }
}
```

**find_android_apk**

```json
{
  "name": "find_android_apk",
  "description": "Find the most recent APK in a project directory",
  "inputSchema": {
    "type": "object",
    "properties": {
      "projectRoot": {
        "type": "string",
        "description": "Optional project root to search for APKs"
      }
    }
  }
}
```

**install_android_apk**

```json
{
  "name": "install_android_apk",
  "description": "Install an APK on a connected Android device or emulator",
  "inputSchema": {
    "type": "object",
    "properties": {
      "deviceId": {
        "type": "string",
        "description": "Optional device ID"
      },
      "apkPath": {
        "type": "string",
        "description": "Path to APK to install (optional; auto-detects if omitted)"
      },
      "apkUrl": {
        "type": "string",
        "description": "Optional URL to download an APK before installing"
      },
      "projectRoot": {
        "type": "string",
        "description": "Optional project root to search for APKs when apkPath is omitted"
      },
      "reinstall": {
        "type": "boolean",
        "description": "Reinstall if already installed (-r)"
      },
      "grantPermissions": {
        "type": "boolean",
        "description": "Grant runtime permissions at install time (-g)"
      },
      "allowTestPackages": {
        "type": "boolean",
        "description": "Allow installing test-only APKs (-t)"
      },
      "allowDowngrade": {
        "type": "boolean",
        "description": "Allow version downgrade (-d)"
      },
      "timeoutMs": {
        "type": "number",
        "description": "Optional timeout in milliseconds for install"
      },
      "playProtectAction": {
        "type": "string",
        "description": "How to handle Google Play Protect prompts (send_once, always, never)"
      },
      "playProtectMaxWaitMs": {
        "type": "number",
        "description": "Max time to wait for Play Protect prompt handling (milliseconds)"
      }
    }
  }
}
```

**uninstall_android_app**

```json
{
  "name": "uninstall_android_app",
  "description": "Uninstall an app by package name",
  "inputSchema": {
    "type": "object",
    "properties": {
      "packageName": {
        "type": "string",
        "description": "Android application package name"
      },
      "deviceId": {
        "type": "string",
        "description": "Optional device ID"
      },
      "keepData": {
        "type": "boolean",
        "description": "Whether to keep app data and cache directories (-k)"
      }
    }
  }
}
```

**start_android_app**

```json
{
  "name": "start_android_app",
  "description": "Start an Android app by package name",
  "inputSchema": {
    "type": "object",
    "properties": {
      "packageName": {
        "type": "string",
        "description": "Android application package name"
      },
      "activity": {
        "type": "string",
        "description": "Optional activity to launch"
      },
      "deviceId": {
        "type": "string",
        "description": "Optional device ID"
      }
    }
  }
}
```

**stop_android_app**

```json
{
  "name": "stop_android_app",
  "description": "Force-stop an app",
  "inputSchema": {
    "type": "object",
    "properties": {
      "packageName": {
        "type": "string",
        "description": "Android application package name"
      },
      "deviceId": {
        "type": "string",
        "description": "Optional device ID"
      }
    }
  }
}
```

**clear_android_app_data**

```json
{
  "name": "clear_android_app_data",
  "description": "Clear app data",
  "inputSchema": {
    "type": "object",
    "properties": {
      "packageName": {
        "type": "string",
        "description": "Android application package name"
      },
      "deviceId": {
        "type": "string",
        "description": "Optional device ID"
      }
    }
  }
}
```

**get_android_current_activity**

```json
{
  "name": "get_android_current_activity",
  "description": "Get the currently focused app activity",
  "inputSchema": {
    "type": "object",
    "properties": {
      "deviceId": {
        "type": "string",
        "description": "Optional device ID"
      }
    }
  }
}
```

**get_android_window_size**

```json
{
  "name": "get_android_window_size",
  "description": "Get device window size (physical/override)",
  "inputSchema": {
    "type": "object",
    "properties": {
      "deviceId": {
        "type": "string",
        "description": "Optional device ID"
      }
    }
  }
}
```

**dump_android_ui_hierarchy**

```json
{
  "name": "dump_android_ui_hierarchy",
  "description": "Dump UI hierarchy XML from the device",
  "inputSchema": {
    "type": "object",
    "properties": {
      "deviceId": {
        "type": "string",
        "description": "Optional device ID"
      },
      "maxChars": {
        "type": "number",
        "description": "Optional maximum number of characters to return"
      }
    }
  }
}
```

**tap_android_screen**

```json
{
  "name": "tap_android_screen",
  "description": "Send a tap event to the device screen",
  "inputSchema": {
    "type": "object",
    "properties": {
      "x": {
        "type": "number",
        "description": "Tap X coordinate in pixels"
      },
      "y": {
        "type": "number",
        "description": "Tap Y coordinate in pixels"
      },
      "deviceId": {
        "type": "string",
        "description": "Optional device ID"
      }
    }
  }
}
```

**swipe_android_screen**

```json
{
  "name": "swipe_android_screen",
  "description": "Send a swipe gesture to the device screen",
  "inputSchema": {
    "type": "object",
    "properties": {
      "startX": {
        "type": "number",
        "description": "Start X coordinate in pixels"
      },
      "startY": {
        "type": "number",
        "description": "Start Y coordinate in pixels"
      },
      "endX": {
        "type": "number",
        "description": "End X coordinate in pixels"
      },
      "endY": {
        "type": "number",
        "description": "End Y coordinate in pixels"
      },
      "durationMs": {
        "type": "number",
        "description": "Optional swipe duration in milliseconds"
      },
      "deviceId": {
        "type": "string",
        "description": "Optional device ID"
      }
    }
  }
}
```

**input_android_text**

```json
{
  "name": "input_android_text",
  "description": "Type text into the focused input field",
  "inputSchema": {
    "type": "object",
    "properties": {
      "text": {
        "type": "string",
        "description": "Text to input into the focused field"
      },
      "deviceId": {
        "type": "string",
        "description": "Optional device ID"
      }
    }
  }
}
```

**send_android_keyevent**

```json
{
  "name": "send_android_keyevent",
  "description": "Send an Android keyevent",
  "inputSchema": {
    "type": "object",
    "properties": {
      "keyCode": {
        "type": "string",
        "description": "Android keycode (e.g., 3 for HOME, 4 for BACK, KEYCODE_ENTER)"
      },
      "deviceId": {
        "type": "string",
        "description": "Optional device ID"
      }
    }
  }
}
```

**reverse_android_port**

```json
{
  "name": "reverse_android_port",
  "description": "Reverse TCP port from device to host (useful for hot reload)",
  "inputSchema": {
    "type": "object",
    "properties": {
      "devicePort": {
        "type": "number",
        "description": "Device port to reverse"
      },
      "hostPort": {
        "type": "number",
        "description": "Host port to map to (defaults to devicePort)"
      },
      "deviceId": {
        "type": "string",
        "description": "Optional device ID"
      }
    }
  }
}
```

**forward_android_port**

```json
{
  "name": "forward_android_port",
  "description": "Forward TCP port from host to device",
  "inputSchema": {
    "type": "object",
    "properties": {
      "devicePort": {
        "type": "number",
        "description": "Device port to forward to (tcp)"
      },
      "hostPort": {
        "type": "number",
        "description": "Host port to forward from (tcp)"
      },
      "deviceId": {
        "type": "string",
        "description": "Optional device ID"
      }
    }
  }
}
```

**get_android_logcat**

```json
{
  "name": "get_android_logcat",
  "description": "Fetch recent logcat output (optionally filtered)",
  "inputSchema": {
    "type": "object",
    "properties": {
      "lines": {
        "type": "number",
        "description": "Number of log lines to return"
      },
      "since": {
        "type": "string",
        "description": "Optional time filter (e.g., \"1m\", \"2024-01-01 00:00:00.000\")"
      },
      "tag": {
        "type": "string",
        "description": "Optional log tag filter"
      },
      "priority": {
        "type": "string",
        "description": "Optional minimum priority (V/D/I/W/E/F/S)"
      },
      "pid": {
        "type": "number",
        "description": "Optional PID to filter logs by"
      },
      "packageName": {
        "type": "string",
        "description": "Optional package name to filter by running PID"
      },
      "format": {
        "type": "string",
        "description": "Logcat output format (time, threadtime, brief, raw)"
      },
      "deviceId": {
        "type": "string",
        "description": "Optional device ID"
      }
    }
  }
}
```

**list_android_activities**

```json
{
  "name": "list_android_activities",
  "description": "List activities for a package name",
  "inputSchema": {
    "type": "object",
    "properties": {
      "packageName": {
        "type": "string",
        "description": "Android application package name"
      },
      "deviceId": {
        "type": "string",
        "description": "Optional device ID"
      }
    }
  }
}
```

**hot_reload_android_app**

```json
{
  "name": "hot_reload_android_app",
  "description": "Reverse ports, install (optional), and start an app for hot reload",
  "inputSchema": {
    "type": "object",
    "properties": {
      "deviceId": {
        "type": "string",
        "description": "Optional device ID"
      },
      "packageName": {
        "type": "string",
        "description": "Android application package name"
      },
      "activity": {
        "type": "string",
        "description": "Optional activity to launch"
      },
      "apkPath": {
        "type": "string",
        "description": "Optional APK path to install before starting"
      },
      "projectRoot": {
        "type": "string",
        "description": "Optional project root used to auto-detect APKs"
      },
      "reversePorts": {
        "type": "array",
        "description": "Ports to reverse (defaults to 8081)"
      },
      "install": {
        "type": "boolean",
        "description": "Whether to install an APK before starting"
      },
      "start": {
        "type": "boolean",
        "description": "Whether to start the app after setup"
      },
      "stopBeforeStart": {
        "type": "boolean",
        "description": "Whether to force-stop the app before starting"
      },
      "reinstall": {
        "type": "boolean",
        "description": "Reinstall if already installed (-r)"
      },
      "grantPermissions": {
        "type": "boolean",
        "description": "Grant runtime permissions at install (-g)"
      },
      "allowTestPackages": {
        "type": "boolean",
        "description": "Allow installing test-only APKs (-t)"
      },
      "allowDowngrade": {
        "type": "boolean",
        "description": "Allow version downgrade (-d)"
      },
      "timeoutMs": {
        "type": "number",
        "description": "Optional timeout in milliseconds for install"
      }
    }
  }
}
```

**pm2_start_hot_mode**

```json
{
  "name": "pm2_start_hot_mode",
  "description": "Start the Android hot mode build in the background via PM2",
  "inputSchema": {
    "type": "object",
    "properties": {
      "projectRoot": {
        "type": "string",
        "description": "Optional project root to resolve config paths"
      },
      "configPath": {
        "type": "string",
        "description": "Optional PM2 config path (defaults to android_hot_mode.config.json)"
      },
      "appName": {
        "type": "string",
        "description": "Optional PM2 app name to start (filters config)"
      }
    }
  }
}
```

**fast_flow**

```json
{
  "name": "fast_flow",
  "description": "Run a fast UI flow with optional screenshots and UI dump",
  "inputSchema": {
    "type": "object",
    "properties": {
      "deviceId": {
        "type": "string",
        "description": "Optional device ID"
      },
      "actions": {
        "type": "array",
        "description": "Ordered list of actions to run"
      },
      "captureBefore": {
        "type": "boolean",
        "description": "Capture a screenshot before running the actions"
      },
      "captureAfter": {
        "type": "boolean",
        "description": "Capture a screenshot after running the actions"
      },
      "postActionWaitMs": {
        "type": "number",
        "description": "Optional wait after actions before capture/dump (milliseconds)"
      },
      "includeUiDump": {
        "type": "boolean",
        "description": "Include a UI hierarchy dump after the actions"
      },
      "uiDumpMaxChars": {
        "type": "number",
        "description": "Optional maximum number of characters to return from the UI dump"
      }
    }
  }
}
```

## Usage Examples

_Example: AI agent listing devices, capturing screenshots, and providing detailed UI analysis in real-time_

### Real-Time UI Development

With your development environment running (Expo, React Native, Flutter, etc.), interact with your AI agent:

**Initial Analysis:**

- "Take a screenshot of my current app UI and analyze the layout"
- "Show me the current state of my login screen and suggest improvements"
- "Capture the app and check for accessibility issues"

**Iterative Development:**

- "I just changed the button color, take another screenshot and compare"
- "Help me adjust the spacing - take a screenshot after each change"
- "Take a screenshot and tell me if the new navigation looks good"

**Cross-Platform Testing:**

- "Capture screenshots from both my phone and tablet emulator"
- "Show me how the UI looks on device emulator-5554 vs my physical device"

**Development Debugging:**

- "List all connected devices and their status"
- "Take a screenshot from the specific emulator running my debug build"
- "Capture the current error state and help me fix the UI issue"

**App Installation & Interaction:**

- "Find the latest APK in this repo and install it"
- "Start com.example.app and open the main activity"
- "Tap the login button at (540, 1620) and type my test credentials"
- "Run a batch: tap email, type, tap password, type, tap login (one call)"
- "Reverse port 8081 for hot reload, then relaunch the app"
- "Get the last 200 logcat lines for com.example.app"

## Troubleshooting

### ADB Issues

- **ADB not found**: Verify ADB is installed and in PATH
- **No devices**: Check USB connection and debugging authorization
- **Device unauthorized**: Disconnect/reconnect USB, check device authorization prompt
- **Screenshot failed**: Ensure device is unlocked and properly connected

### Connection Issues

- Verify `adb devices` shows your device as "device" status
- Restart ADB server: `adb kill-server && adb start-server`
- Check USB debugging permissions on device

## Development

### Build Commands

```bash
npm run build     # Production build
npm test          # Run tests
npm run lint      # Code linting
npm run format    # Code formatting
```

### Project Structure

```
src/
├── server.ts         # MCP server implementation
├── types.ts          # Type definitions
├── gui.ts            # Global GUI launcher entry
├── postinstall.ts    # Codex auto-config hook
├── utils/
│   ├── adb.ts        # ADB command utilities
│   ├── screenshot.ts # Screenshot processing
│   └── error.ts      # Error handling
└── index.ts          # Entry point

apps/gui/             # Electron GUI app
bin/                  # CLI launchers
```

## Performance

- 5-second timeout on ADB operations
- In-memory screenshot processing
- Stdio communication for security
- Minimal privilege execution

## License

MIT License - see LICENSE file for details.
