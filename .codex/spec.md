# Runpak, spec document

## For the agent (Claude Code, Codex, etc.)

- This spec lives at `./.codex/spec.md`
- Use `./.codex/temp/` as your working directory for all temporary files, generated assets, scratch files, and intermediate output. Do not litter the project root or application directories with temp files.
- The final application code lives outside `.codex/` entirely. Nothing inside `.codex/` is part of the shipped app.
- Keep `./README.md` up-to-date as you build. The README is for the **end user**, not a contributor. It should cover: what Runpak is, how to install and run it, and how to use it. Nothing else. No architecture notes, no internal decisions, no contributor guides. Keep it clean, concise, and scannable.

---

## Overview

Runpak is a local developer tool for interactively testing npm/pnpm packages in real runtime environments. It solves a specific frustration: you can build and unit-test a package, but you cannot easily see how its API behaves in a true browser or Node.js environment without wiring up a throwaway project. Runpak gives you that, instantly, in a clean UI.

It is a local-only tool. There is no deployment target, no auth, no database. You run it locally and it serves a browser UI backed by a Hono server.

---

## Running the tool

```bash
cd Sites/apps/runpak
pnpm install
pnpm start
```

This starts the Hono server and opens the browser UI at `http://localhost:7777`. The port `7777` is the default and should not be `3000` (too commonly used by other tools).

The tool is not currently published to npm. It is run locally from the cloned repository.

---

## Tech stack

| Concern | Choice |
|---|---|
| Server | Hono (Node.js) |
| UI build | Vite (outputs static files served by Hono) |
| UI framework | React |
| Code editor | Monaco Editor |
| On-demand bundler | esbuild |
| Node execution | Node.js `child_process` |
| Package manager | pnpm |
| Language | TypeScript throughout |

---

## Architecture

```
runpak/
  server/         # Hono server
    index.ts      # Entry point, starts server on port 7777
    routes/
      bundle.ts   # POST /api/bundle — esbuild bundles package for browser mode
      execute.ts  # POST /api/execute — child_process execution for Node mode
      resolve.ts  # GET /api/resolve — reads package.json, resolves entry point
  client/         # Vite + React UI
    src/
      App.tsx
      components/
        TopPane.tsx
        EditorPane.tsx
        ResultPane.tsx
        ModeSelector.tsx
      lib/
        executeInBrowser.ts   # Browser mode execution logic
        executeInNode.ts      # Node mode: POSTs to /api/execute
        bundlePackage.ts      # POSTs to /api/bundle
  dist/           # Vite build output, served as static by Hono
```

---

## UI layout

```
┌─────────────────────────────────────────────────────┐
│  TOP PANE: Package path input + Mode dropdown       │
├────────────────────────┬────────────────────────────┤
│                        │  TOP-RIGHT: stdout / logs  │
│  LEFT: Code editor     │──────────────────────────  │
│  (Monaco, dark theme)  │  BOTTOM-RIGHT: Return val  │
│                        │                            │
├────────────────────────┴────────────────────────────┤
│  [ Run ]                                            │
└─────────────────────────────────────────────────────┘
```

### Top pane

- A text input accepting either:
  - A path to the package root, e.g. `/Users/keogh/Sites/my-package/` (Runpak reads `package.json` and resolves the entry point from the `main` or `exports` field)
  - A path directly to the `dist/` or compiled output folder
- A dropdown to select execution environment: `Browser` or `Node.js`

### Left pane

- Monaco Editor, dark theme
- Syntax highlighted TypeScript/JavaScript
- The user writes code here as they would in real application code
- `async`/`await` is supported — the server and browser runner both wrap user code in an async IIFE automatically
- The user uses a `return` statement to surface the primary result
- `console.log` etc. are captured and shown in the stdout pane

### Right pane (split vertically)

- **Top half**: stdout and console output, displayed in order, labelled clearly (e.g. `[log]`, `[warn]`, `[error]`)
- **Bottom half**: the return value of the user's code, pretty-printed as JSON if it is an object, plain text otherwise. Clearly labelled as `return`.

### Run button

- Sits below the left pane
- Triggers execution in whichever mode is selected
- Results clear and re-render on each run

---

## UI design

### Theme

- Dark throughout, no light mode
- Background: very dark grey/near-black (e.g. `#0d0d0d` or similar), not pure black
- Surface colours for panes should be slightly elevated from the background (e.g. `#141414`, `#1a1a1a`) to create depth without being distracting
- Accent colour: a single vivid accent for interactive elements (the Run button, active states, highlights). A cool electric blue or sharp green works well. Pick one and use it consistently.
- Borders: subtle, low-contrast (e.g. `#2a2a2a`), used to delineate panes without being heavy

### Typography

Use Google Fonts. Suggested pairing:

- **UI chrome** (labels, inputs, dropdowns, button text): `Inter` or `DM Sans`, clean and legible at small sizes
- **Code output / result pane**: `JetBrains Mono` or `Fira Code`, monospaced with ligature support, used for stdout labels, return values, and any non-editor code display

Load via `<link>` in the HTML head or via `@import` in CSS.

### Monaco Editor

- Theme: `vs-dark` as the base, or a custom theme that aligns with the overall palette
- Language: `typescript` (covers both TS and JS with full syntax highlighting)
- Font: `JetBrains Mono` or `Fira Code`, matching the result pane
- Font size: 14px
- Line numbers: on
- Minimap: off (unnecessary at this scale)
- Word wrap: off

### Result pane

- Stdout/log entries rendered in monospace, each prefixed with a coloured label badge:
  - `[log]` — muted white
  - `[warn]` — amber
  - `[error]` — red
- Return value rendered as syntax-highlighted JSON using a lightweight highlighter (e.g. `highlight.js` with a dark theme, or a small custom renderer). Not plain text.
- A thin divider line separates the stdout and return sections
- Empty state: subtle placeholder text, e.g. `Run your code to see output here`

### General

- Pane dividers are draggable (resizable split panes), so the user can adjust the editor/result ratio
- Inputs and dropdowns in the top pane should feel native to the dark theme, not browser-default styled
- The Run button should be prominent, full-width or wide, with the accent colour as its background
- Rounded corners on surfaces: `4px` to `6px`, nothing excessive
- Spacing: generous padding inside panes, tight but not cramped

---

## Execution modes

### Browser mode

1. UI sends a `POST /api/bundle` request with the resolved package path
2. Server runs esbuild on the package with `platform: 'browser'`, returns the bundle as a JS string
3. Browser creates a `Blob` URL from the bundle and dynamically imports it as an ES module
4. User's code (wrapped in an async IIFE) is executed in the browser tab against the imported module
5. `console.log` and friends are intercepted before execution to capture output
6. Return value and captured logs are displayed in the right pane

This is a genuine browser environment — no simulation, no jsdom. Because the tool itself runs in a browser, the user's code runs in that same real browser context. esbuild with `platform: 'browser'` applies the same transforms a Vite or Webpack build would apply, so fidelity to real-world browser usage is high.

### Node.js mode

1. UI sends a `POST /api/execute` with the user's code and the resolved package path
2. Hono server spawns a `child_process` and executes the code against the package directly from disk (no bundling)
3. stdout, stderr, and the return value are captured and streamed back to the UI
4. Results are displayed in the right pane

This is a genuine Node.js environment. No transforms, no polyfills. What works here will work for Node consumers of the package.

---

## Package resolution

When the user provides a path, the server:

1. Checks if a `package.json` exists at that path or one level up
2. If found, reads the `main` and/or `exports` fields to determine the entry point
3. If no `package.json` is found, treats the path itself as the entry point (i.e. user pointed directly at `dist/`)

This means the tool is agnostic to package manager (npm, pnpm, yarn). It never installs or builds anything. It works with whatever is already on disk.

---

## Code execution wrapper

User code in the left pane is automatically wrapped before execution:

```ts
(async () => {
  // user code here
})()
```

This means the user can use `await` freely at the top level and use `return` to surface a value. They do not need to wrap anything themselves.

---

## Streaming (Node mode)

Node mode streams results back via a `ReadableStream` from the Hono API route. This means `console.log` output appears in the UI in real time as the child process produces it, rather than waiting for the process to complete. This is particularly useful for async code or anything with meaningful intermediate output.

---

## Error handling

- Syntax errors in the user's code are caught and displayed in the stdout pane with a clear label, e.g. `[error] SyntaxError: Unexpected token`
- Stack traces are shown in full in the stdout pane
- esbuild errors (e.g. package cannot be bundled for browser) are surfaced clearly with context
- The right pane never shows a blank or silent failure

---

## Deferred / v2 concerns

- **Build button**: If a `package.json` is resolved, a build button could shell out and run `scripts.build` using the detected package manager (detected from lockfile presence). Deferred for now, the user builds manually before using Runpak.
- **npm publishing / `npx` support**: Not a current concern. The tool is run locally.
- **Next.js environment mode**: Not needed. Next.js server-side is covered by Node mode, client-side by Browser mode.
- **Tab/session persistence**: Code in the left pane could persist across reloads via localStorage. Deferred.

---

## Non-goals

- Runpak does not install packages
- Runpak does not manage dependencies
- Runpak does not build packages
- Runpak does not deploy anything
- Runpak does not simulate environments — both modes use real runtimes
