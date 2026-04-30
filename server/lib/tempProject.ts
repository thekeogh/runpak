import { mkdir, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ResolveResult } from './types.js';

export async function createTempProject(prefix: string, resolved: ResolveResult): Promise<string> {
  const tempRoot = path.join(process.cwd(), '.codex', 'temp', prefix);
  const projectDir = path.join(tempRoot, `runpak-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const packageParts = resolved.packageName.split('/');
  const packageParent = path.join(projectDir, 'node_modules', ...packageParts.slice(0, -1));
  const packageLink = path.join(projectDir, 'node_modules', ...packageParts);

  await mkdir(packageParent, { recursive: true });
  await symlink(resolved.packageRoot, packageLink, 'junction');

  return projectDir;
}

export async function writeTempEntry(projectDir: string, fileName: string, code: string): Promise<string> {
  const entryPath = path.join(projectDir, fileName);
  await writeFile(entryPath, code, 'utf8');
  return entryPath;
}
