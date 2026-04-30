import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { resolvePackage } from './resolvePackage.js';
import type { EditorLib, IntellisenseResult } from './types.js';

type PackageJson = {
  name?: string;
  types?: string;
  typings?: string;
  main?: string;
  module?: string;
  exports?: unknown;
};

type ExportTarget = {
  subpath: string;
  runtimePath: string | null;
  typesPath: string | null;
};

const localDeclarationPattern = /\b(?:import|export)\b[\s\S]*?\bfrom\s+["'](\.{1,2}\/[^"']+)["']|import\s*\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g;

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, 'utf8')) as T;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const info = await stat(filePath);
    return info.isFile();
  } catch {
    return false;
  }
}

function moduleName(packageName: string, subpath: string): string {
  return subpath === '.' ? packageName : `${packageName}/${subpath.replace(/^\.\//, '')}`;
}

function virtualPackagePath(packageName: string, relativePath: string): string {
  return `file:///node_modules/${packageName}/${relativePath.replace(/^\.\//, '')}`;
}

function toPackageRelative(packageRoot: string, filePath: string): string {
  return path.relative(packageRoot, filePath).split(path.sep).join('/');
}

function declarationModuleName(packageName: string, relativePath: string): string {
  return `${packageName}/${relativePath.replace(/\.d\.ts$/, '')}`;
}

function pickStringTarget(target: unknown, keys: string[]): string | null {
  if (typeof target === 'string') return target;
  if (!target || typeof target !== 'object') return null;

  const record = target as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string') return value;
    const nested = pickStringTarget(value, keys);
    if (nested) return nested;
  }

  return null;
}

function declarationCandidate(runtimePath: string): string {
  const extension = path.extname(runtimePath);
  return extension ? runtimePath.slice(0, -extension.length) + '.d.ts' : `${runtimePath}.d.ts`;
}

async function resolveDeclarationImport(fromFile: string, specifier: string): Promise<string | null> {
  const basePath = path.resolve(path.dirname(fromFile), specifier);
  const extension = path.extname(basePath);
  const candidates = extension
    ? [basePath.slice(0, -extension.length) + '.d.ts', basePath]
    : [`${basePath}.d.ts`, path.join(basePath, 'index.d.ts')];

  for (const candidate of candidates) {
    if (await fileExists(candidate)) return candidate;
  }

  return null;
}

async function transformLocalSpecifiers(
  content: string,
  fromFile: string,
  packageName: string,
  packageRoot: string
): Promise<string> {
  let transformed = content;

  for (const match of content.matchAll(localDeclarationPattern)) {
    const specifier = match[1] ?? match[2];
    if (!specifier) continue;

    const dependency = await resolveDeclarationImport(fromFile, specifier);
    if (dependency?.startsWith(packageRoot)) {
      const dependencyModule = declarationModuleName(packageName, toPackageRelative(packageRoot, dependency));
      transformed = transformed.replaceAll(specifier, dependencyModule);
    }
  }

  return transformed;
}

async function addDeclarationGraph(
  libs: Map<string, EditorLib>,
  packageName: string,
  packageRoot: string,
  entryPath: string,
  seen = new Set<string>()
): Promise<string | null> {
  if (seen.has(entryPath) || !(await fileExists(entryPath))) return null;
  seen.add(entryPath);

  const relativePath = toPackageRelative(packageRoot, entryPath);
  const virtualPath = virtualPackagePath(packageName, relativePath);
  const content = await readFile(entryPath, 'utf8');

  libs.set(virtualPath, {
    filePath: virtualPath,
    content
  });

  for (const match of content.matchAll(localDeclarationPattern)) {
    const specifier = match[1] ?? match[2];
    if (!specifier) continue;

    const dependency = await resolveDeclarationImport(entryPath, specifier);
    if (dependency?.startsWith(packageRoot)) {
      await addDeclarationGraph(libs, packageName, packageRoot, dependency, seen);
    }
  }

  const ambientContent = await transformLocalSpecifiers(content, entryPath, packageName, packageRoot);
  const ambientModule = declarationModuleName(packageName, relativePath);
  libs.set(virtualPackagePath(packageName, `__runpak_ambient__/${relativePath}`), {
    filePath: virtualPackagePath(packageName, `__runpak_ambient__/${relativePath}`),
    content: `declare module ${JSON.stringify(ambientModule)} {\n${ambientContent}\n}\n`
  });

  return virtualPath;
}

function collectExports(packageJson: PackageJson): ExportTarget[] {
  const exportsField = packageJson.exports;

  if (!exportsField) {
    const runtimePath = packageJson.module ?? packageJson.main ?? './index.js';
    return [
      {
        subpath: '.',
        runtimePath,
        typesPath: packageJson.types ?? packageJson.typings ?? declarationCandidate(runtimePath)
      }
    ];
  }

  if (typeof exportsField === 'string') {
    return [
      {
        subpath: '.',
        runtimePath: exportsField,
        typesPath: packageJson.types ?? packageJson.typings ?? declarationCandidate(exportsField)
      }
    ];
  }

  if (typeof exportsField !== 'object') return [];

  const record = exportsField as Record<string, unknown>;
  const hasSubpaths = Object.keys(record).some((key) => key === '.' || key.startsWith('./'));
  const entries = hasSubpaths ? record : { '.': record };

  return Object.entries(entries)
    .filter(([subpath]) => subpath === '.' || subpath.startsWith('./'))
    .map(([subpath, target]) => {
      const runtimePath = pickStringTarget(target, ['import', 'module', 'default', 'require', 'browser', 'node']);
      return {
        subpath,
        runtimePath,
        typesPath: pickStringTarget(target, ['types', 'typings']) ?? (runtimePath ? declarationCandidate(runtimePath) : null)
      };
    });
}

function relativeTypeImport(shimPath: string, actualTypesPath: string): string {
  const fromDir = path.posix.dirname(shimPath.replace('file://', ''));
  const toFile = actualTypesPath.replace('file://', '').replace(/\.d\.ts$/, '');
  const relative = path.posix.relative(fromDir, toFile);
  return relative.startsWith('.') ? relative : `./${relative}`;
}

function shimContent(
  packageName: string,
  target: ExportTarget,
  actualTypesPath: string | null,
  shimPath: string
): string {
  const name = moduleName(packageName, target.subpath);

  if (!actualTypesPath) {
    return `declare module ${JSON.stringify(name)} {\n  const value: any;\n  export = value;\n  export default value;\n}\n`;
  }

  const importPath = relativeTypeImport(shimPath, actualTypesPath);
  return `declare module ${JSON.stringify(name)} {\n  export * from ${JSON.stringify(importPath)};\n  export { default } from ${JSON.stringify(importPath)};\n}\n`;
}

export async function getIntellisense(packagePath: string): Promise<IntellisenseResult> {
  const resolved = await resolvePackage(packagePath);
  const packageJson = await readJson<PackageJson>(resolved.packageJsonPath);
  const exportsList = collectExports(packageJson);
  const libs = new Map<string, EditorLib>();

  libs.set(virtualPackagePath(resolved.packageName, 'package.json'), {
    filePath: virtualPackagePath(resolved.packageName, 'package.json'),
    content: JSON.stringify(packageJson, null, 2)
  });

  for (const target of exportsList) {
    const typePath = target.typesPath ? path.resolve(resolved.packageRoot, target.typesPath) : null;
    const virtualTypesPath = typePath
      ? await addDeclarationGraph(libs, resolved.packageName, resolved.packageRoot, typePath)
      : null;

    const shimPath =
      target.subpath === '.'
        ? virtualPackagePath(resolved.packageName, 'index.d.ts')
        : virtualPackagePath(resolved.packageName, `${target.subpath.replace(/^\.\//, '')}.d.ts`);

    if (virtualTypesPath && typePath) {
      const publicContent = await transformLocalSpecifiers(
        await readFile(typePath, 'utf8'),
        typePath,
        resolved.packageName,
        resolved.packageRoot
      );
      libs.set(shimPath, {
        filePath: shimPath,
        content: `declare module ${JSON.stringify(moduleName(resolved.packageName, target.subpath))} {\n${publicContent}\n}\n`
      });
    } else {
      libs.set(shimPath, {
        filePath: shimPath,
        content: shimContent(resolved.packageName, target, virtualTypesPath, shimPath)
      });
    }
  }

  const rootPath = virtualPackagePath(resolved.packageName, 'package.json.d.ts');
  if (!libs.size) {
    libs.set(virtualPackagePath(resolved.packageName, 'index.d.ts'), {
      filePath: virtualPackagePath(resolved.packageName, 'index.d.ts'),
      content: shimContent(
        resolved.packageName,
        { subpath: '.', runtimePath: null, typesPath: null },
        null,
        rootPath
      )
    });
  }

  return {
    packageName: resolved.packageName,
    libs: [...libs.values()]
  };
}
