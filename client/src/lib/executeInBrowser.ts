import { bundlePackage } from './bundlePackage';
import type { ConsoleLevel, RunEvent } from './types';

type Emit = (event: RunEvent) => void;

const consoleLevels: ConsoleLevel[] = ['log', 'warn', 'error', 'info', 'debug'];

export async function executeInBrowser(packagePath: string, code: string, emit: Emit): Promise<void> {
  const { code: bundleCode } = await bundlePackage(packagePath, code);
  const bundleUrl = URL.createObjectURL(new Blob([bundleCode], { type: 'text/javascript' }));
  const originals = new Map<ConsoleLevel, (...args: unknown[]) => void>();

  try {
    for (const level of consoleLevels) {
      const original = console[level].bind(console) as (...args: unknown[]) => void;
      originals.set(level, original);
      console[level] = (...args: unknown[]) => {
        emit({ type: 'console', level, values: args });
        original(...args);
      };
    }

    const userModule = (await import(/* @vite-ignore */ bundleUrl)) as { default?: unknown };
    emit({ type: 'return', value: userModule.default });
    emit({ type: 'done', exitCode: 0 });
  } catch (error) {
    emit({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    emit({ type: 'done', exitCode: 1 });
  } finally {
    for (const [level, original] of originals) {
      console[level] = original as Console[typeof level];
    }
    URL.revokeObjectURL(bundleUrl);
  }
}
