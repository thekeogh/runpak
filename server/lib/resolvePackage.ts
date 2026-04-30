import { access, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ResolveResult } from './types.js';

type PackageJson = {
  name?: string;
  main?: string;
  module?: string;
  browser?: string | Record<string, string | false>;
  exports?: unknown;
};

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function firstExportTarget(exportsField: unknown): string | null {
  if (typeof exportsField === 'string') return exportsField;
  if (!exportsField || typeof exportsField !== 'object') return null;

  const record = exportsField as Record<string, unknown>;
  const root = record['.'] ?? record;

  if (typeof root === 'string') return root;
  if (!root || typeof root !== 'object') return null;

  const rootRecord = root as Record<string, unknown>;
  for (const key of ['browser', 'import', 'module', 'default', 'require', 'node']) {
    const value = rootRecord[key];
    if (typeof value === 'string') return value;
  }

  for (const value of Object.values(rootRecord)) {
    if (typeof value === 'string') return value;
    const nested = firstExportTarget(value);
    if (nested) return nested;
  }

  return null;
}

function packageEntry(packageJson: PackageJson): string {
  const browser = typeof packageJson.browser === 'string' ? packageJson.browser : null;
  return (
    browser ??
    firstExportTarget(packageJson.exports) ??
    packageJson.module ??
    packageJson.main ??
    'index.js'
  );
}

export async function resolvePackage(input: string): Promise<ResolveResult> {
  if (!input.trim()) {
    throw new Error('Enter a package path before running code.');
  }

  const inputPath = path.resolve(input.trim());
  const inputStat = await stat(inputPath).catch(() => null);

  if (!inputStat) {
    throw new Error(`Path does not exist: ${inputPath}`);
  }

  if (!inputStat.isDirectory()) {
    throw new Error('Package path must be the package root directory, not a file or dist entry.');
  }

  const packageJsonPath = path.join(inputPath, 'package.json');

  if (!(await exists(packageJsonPath))) {
    throw new Error('Package path must point at the package root and contain a package.json.');
  }

  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8')) as PackageJson;

  if (!packageJson.name) {
    throw new Error('package.json must include a name so Runpak can mimic real package imports.');
  }

  const entry = packageEntry(packageJson);
  const entryPath = path.resolve(inputPath, entry);

  return {
    inputPath,
    packageRoot: inputPath,
    packageJsonPath,
    entryPath,
    entrySpecifier: pathToFileURL(entryPath).href,
    packageName: packageJson.name
  };
}
