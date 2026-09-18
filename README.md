<!--
  SPDX-FileCopyrightText: 2026 Kubuno contributors
  SPDX-License-Identifier: AGPL-3.0-or-later
-->

<div align="center">

<img src=".github/logo.png" alt="Kubuno App logo" width="120">

# Kubuno — App

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE)
![Rust](https://img.shields.io/badge/Rust-edition_2021-orange.svg)
![React](https://img.shields.io/badge/React-19-61dafb.svg)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791.svg)
![Status](https://img.shields.io/badge/status-alpha-yellow.svg)

**A visual, no-code application builder for Kubuno — the self-hosted, libre (AGPLv3) cloud platform, a sovereign alternative to Google Workspace and Microsoft 365.**

Compose full web applications — **pages, data and workflows** — by dragging widgets onto a canvas, with no code. Build internal tools, forms-driven apps, dashboards or public mini-sites, then publish them behind a shareable link.

</div>

---

## ✨ Features

- 🎨 **Visual page builder** — a drag-and-drop canvas of nestable elements (sections, columns, containers) and a rich widget palette, each configured through an inspector. The same render path drives both the editor and the live runtime, so what you build is exactly what ships. Direct-manipulation editing throughout: double-click any text element to edit it in place, a floating quick-action bar on the selection (reorder, duplicate, wrap in a container, delete), a clickable breadcrumb of the selected element's ancestors, and Ctrl/⌘ + mouse-wheel zoom anchored under the cursor.
- 🧱 **Rich widget library** — text, heading, button, image, video, map, gallery, icon box, tabs, accordion, counter, countdown, price table, call-to-action, testimonial, flip box, and more — every widget styled through the same inspector.
- 🗃️ **Data collections** — define collections ("Things") with typed, reorderable fields, and let app pages read and write records. The built-in data table offers server-side search and sorting, inline cell editing, multi-row selection and CSV import/export. Published apps can expose scoped, anonymous data endpoints (search / list / create / update / delete) for public forms and tools.
- ⚙️ **Workflows** — wire logic and automation behind your pages: each workflow pairs an event trigger (click, input change, page load) with a sequence of actions organised by family — data (create / update / delete / refresh), navigation, interface (messages, state variables, clipboard), documents (PDF) and flow control (wait, confirmation prompt that can cancel the rest of the run). Actions support "only if…" conditions, drag-and-drop reordering, duplication and per-action or per-workflow enable/disable switches.
- 📄 **PDF reports** — a banded, report-designer surface rendered as true WYSIWYG: labels, data fields, summaries (sum / count / avg / min / max), special fields (page numbers, dates, record counters), lines, boxes, ellipses, checkboxes and images, laid out on draggable bands with snapping smart guides, multi-selection, align/distribute tools, clipboard support and keyboard nudging. Margins and band heights are resized by direct drag, bands can repeat, hide or force page breaks, and a live preview panel re-renders the actual PDF (generated client-side) against real records as you edit.
- 🎛️ **Office-style chrome** — the builder shares the Kubuno Office shell: a ribbon whose groups collapse responsively into dropdown chips when space runs out, a "File" backstage for opening and creating apps, and clear error dialogs when a file cannot be opened.
- 🌍 **Publish & share** — one click turns an app into a public page reachable at `/app/p/<slug>`; the anonymous runtime loads the module bundles through the core proxy, with data scoped to `public/apps/<slug>`.
- 🛡️ **Administered by policy** — instance administrators control public publishing, whether published apps require a signed-in account, anonymous data writes, and per-user app / per-app record / definition-size quotas, all from the admin console (Modules ▸ App).

## 🏗️ Architecture

Kubuno is **modular**: each module is a **separate process** that registers with the [core](https://github.com/kubuno/core) at startup. The core proxies its routes, forwards the authenticated user, and serves its runtime-loaded React frontend bundle. A module never links the core — shared Rust crates come from tagged git dependencies, and shared frontend libraries (`@kubuno/sdk`, `@ui`) are resolved at runtime by the host import map.

| | |
|---|---|
| Port | `3119` |
| PostgreSQL schema | `app` |
| Sidebar | `App` (protected Drive folder `App`) |
| Process isolation | `kubuno-seccomp` (no `execve` on the host) |

- **Backend** — `src/`: Axum + SQLx (PostgreSQL, schema `app`); app CRUD, the visual definition, the data engine (including the unauthenticated `public_*` handlers for published apps) and published-app resolution. Proxied requests are authenticated from a signed `X-Kubuno-Auth` token minted by the core (via `kubuno-modauth`), never from plain headers.
- **Frontend** — `frontend/`: a React 19 bundle built to `entry.js` exporting `register()`, consuming `@kubuno/sdk` and `@ui` from npm (provided by the host at runtime via the import map). The builder canvas and the `AppRuntime` share one element tree and one shared renderer, so adding a widget is one model plus one shared renderer.

## 📦 Install

This module ships in the **all-in-one [Kubuno](https://github.com/kubuno/core) Docker image** (`ghcr.io/kubuno/kubuno`) — the easiest way to self-host a full Kubuno instance (core + every module). See **[kubuno/docker](https://github.com/kubuno/docker)** for `docker compose` instructions.

A Kubuno module is distributed as a single **`.kbpkg`** — a self-contained package the Kubuno server installs itself, identical on Linux, Windows and macOS. Tagged releases attach one `.kbpkg` per platform to the [GitHub Releases](https://github.com/kubuno/app/releases) page. Install it from the admin console, or offline from the command line:

```bash
sudo kubuno modules:install app-<version>-<os>-<arch>.kbpkg
sudo systemctl restart kubuno              # the core loads the module on (re)start
```

## 🛠️ Build & development

**Requirements:** Rust ≥ 1.82, Node.js ≥ 24, PostgreSQL 16.

```bash
cargo build --release                      # backend (shared crates from git tags)
cd frontend && npm ci && npm run build     # frontend bundle → dist/{entry.js, entry.css}
bash build_kbpkg.sh                        # → dist/app-<version>-<os>-<arch>.kbpkg
bash build_kbpkg.sh --install              # build + install into the local store + restart
bash ../_tools/deploy_local.sh app         # fast local rebuild + restart (after first install)
```

> Shared dependencies come from Kubuno — no `kubuno/core` checkout required:
> - **Rust** — shared crates via tagged git dependencies.
> - **Frontend** — `@kubuno/sdk`, `@ui` from the `@kubuno` npm scope, resolved by the host at runtime.

## 🧰 Tech stack

Rust 2021 · Axum 0.7 · Tokio · SQLx 0.8 (PostgreSQL 16) — React 19 · TypeScript · Vite · Tailwind CSS v4.

## 🤝 Contributing

Contributions are welcome. Please open an issue to discuss any significant change before submitting a pull request.

## 📄 License

[AGPL-3.0-or-later](LICENSE) © Kubuno contributors.
