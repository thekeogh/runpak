import type { ResolveResult } from './types.js';

function hasModuleSyntax(code: string): boolean {
  return /^\s*(import|export)\s/m.test(code);
}

function rewriteShorthandExport(code: string): string {
  return code.replace(/^(\s*)export\s+([A-Za-z_$][\w$]*)\s*;?\s*$/m, '$1export default $2;');
}

function rewriteTopLevelReturn(code: string): string {
  const lines = code.split('\n');

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const trimmed = lines[index].trim();
    if (!trimmed || trimmed.startsWith('//')) continue;
    if (!trimmed.startsWith('return ')) break;

    const expression = trimmed.replace(/^return\s+/, '').replace(/;$/, '');
    lines[index] = `${lines[index].match(/^\s*/)?.[0] ?? ''}export default ${expression};`;
    break;
  }

  return lines.join('\n');
}

export function createUserEntrySource(code: string, resolved: ResolveResult): string {
  const normalized = rewriteTopLevelReturn(rewriteShorthandExport(code));

  if (hasModuleSyntax(normalized)) {
    return normalized;
  }

  return `import * as pkg from ${JSON.stringify(resolved.packageName)};\nexport default await (async () => {\n${normalized}\n})();`;
}
