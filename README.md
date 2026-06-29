<!--
  SPDX-FileCopyrightText: 2026 Kubuno contributors
  SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Kubuno App

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE)

A visual **no-code application builder** for [Kubuno](https://github.com/kubuno) —
the self-hosted, libre alternative to Google Workspace and Microsoft 365.

Compose full web applications — **pages, data and workflows** — by dragging widgets
onto a canvas, with no code. Build internal tools, forms-driven apps, dashboards or
public mini-sites, then publish them behind a shareable link.

## Features

- **Visual page builder** — a drag-and-drop canvas of nestable elements (sections,
  columns, containers) and a rich widget palette, each configured through an
  inspector. The same render path drives both the editor and the live runtime, so
  what you build is exactly what ships.
- **Widget library (Elementor-style)** — text, heading, button, image, video, map,
  gallery, icon box, tabs, accordion, counter, countdown, price table, call-to-action,
  testimonial, flip box, and more.
- **Data** — define collections and let app pages read and write records; published
  apps can expose scoped, anonymous data endpoints (search / list / create / update /
  delete) for public forms and tools.
- **Workflows** — wire up logic and automation behind your pages.
- **Publish & share** — one click turns an app into a public page reachable at
  `/app/p/<slug>`; the anonymous runtime loads the module bundles through the core
  proxy, with data scoped to `public/apps/<slug>`.

## Architecture

The module is an independent process that registers with the Kubuno core on start-up;
the core proxies its routes and forwards the authenticated user via `x-kubuno-user-*`
headers. Anonymous (published) requests are proxied without auth.

| | |
|---|---|
| Port | `3119` |
| PostgreSQL schema | `app` |
| Sidebar | `App` (protected Drive folder `App`) |
| Process isolation | `kubuno-seccomp` (no `execve` on the host) |

### Backend (Rust · Axum · SQLx)

- `handlers/` — app CRUD, the visual definition, the data engine (`data.rs`, including
  the unauthenticated `public_*` handlers) and published-app resolution.
- Schema `app` only; the authenticated user is taken from the proxy-injected
  `x-kubuno-user-id` header.

### Frontend (React 19 · TypeScript · Vite)

Loaded at runtime by the host as an ESM bundle (`entry.js` exporting `register()`);
shared specifiers (`react`, `@kubuno/sdk`, `@ui`, …) are resolved by the host import map.

- `elements/` — the element/widget model: `palette.ts` (the available widgets),
  `widgets.tsx` (the shared `renderWidget` used by both the builder and the runtime)
  and `style.ts`.
- The builder canvas and the `AppRuntime` share the same element tree, so adding a
  widget is one model + one shared renderer.

## Install

This module ships in the **all-in-one [Kubuno](https://github.com/kubuno/core) Docker image** (`ghcr.io/kubuno/kubuno`) — the easiest way to self-host a full Kubuno instance (core + every module). See **[kubuno/docker](https://github.com/kubuno/docker)** for `docker compose` instructions.

To build this module from source (Debian package), see below.

## Development

```bash
cargo build --release                     # backend (shared crates from git tags)
cd frontend && npm ci && npm run build     # frontend bundle
bash build_deb.sh --install                # build + install the .deb locally
bash ../_tools/deploy_local.sh app          # fast local rebuild + restart
```

## License

[AGPL-3.0-or-later](LICENSE) © Kubuno contributors.
