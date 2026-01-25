# Roadmap to 3.0

This is the concrete plan to reach **v3.0**. Items are grouped by impact and can be shipped incrementally.

## Milestones

- **3.0‑alpha**: gesture defaults + faster UI‑stability loops + issue reporting in tool catalog.
- **3.0‑beta**: flow orchestrator (asserts + retries) + login submit fallback detection.
- **3.0‑rc**: UI‑dump caching + screenshot throttling defaults + multi‑device dry run (non‑parallel).
- **3.0**: docs polish + performance pass + release automation pipeline.

## Core (must‑have for 3.0)
- [ ] **Gesture Intelligence v2**: smarter swipe/scroll with adaptive timing, UI‑stability gating, and auto‑screenshot hooks.
- [ ] **Flow Orchestrator**: higher‑level scenario runner that chains `fast_flow` + wait conditions + assertions.
- [ ] **Login Resilience**: improved submit detection + fallback tap logic (container/text).
- [ ] **Issue Reporting UX**: built‑in `create_github_issue` and templated bug reports.

## Performance & Stability
- [ ] **UI‑dump cache** with invalidation (timestamp + screen hash).
- [ ] **Screenshot throttling** defaults in high‑frequency loops.
- [ ] **Batch‑first strategy**: always merge ADB commands where possible.

## Developer Experience
- [ ] **Feature branches + conventional commits** automation.
- [ ] **Auto‑release** workflow with semver + changelog sync.
- [ ] **Codex efficiency guide** in README (done).

## Done (2.x)
- [x] **Gesture profiles** with profile‑driven defaults (`fast`, `normal`, `safe`).
- [x] **Swipe+Screenshot** single‑call helper.
- [x] **Issue tool** scaffolded with `gh issue create` support.

## Nice‑to‑have
- [ ] **Multi‑device test matrix** (parallel runs).
- [ ] **Visual diff** between screenshots.
- [ ] **Basic accessibility checks** (text contrast/labels).
