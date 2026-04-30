# Runpak

Runpak is a local developer tool for interactively testing npm and pnpm packages in real Browser and Node.js runtimes.

Point Runpak at a local package root, write a small TypeScript or JavaScript entry file, then run it without creating a throwaway app.

## Install

```bash
pnpm install
```

## Run

```bash
pnpm start
```

Runpak starts at:

```text
http://localhost:7777
```

## Use

1. Enter a package root path. The directory must contain `package.json`.
2. Choose `Browser` or `Node.js`.
3. Write code in the editor.
4. Import the package by its real package name and exported subpaths.
5. Use `console.log`, `console.warn`, or `console.error` to inspect output.
6. Use `return` to show the primary result.
7. Click `Run`.

Example:

```ts
import { createClient } from "example-package/client";

const client = createClient({ environment: "staging" });
const result = await client.items.list();

return result;
```

Runpak does not install or build your package. Build the package yourself first if your source needs compilation.
