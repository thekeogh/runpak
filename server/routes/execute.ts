import { Hono } from 'hono';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { resolvePackage } from '../lib/resolvePackage.js';
import { createTempProject, writeTempEntry } from '../lib/tempProject.js';
import { createUserEntrySource } from '../lib/userSource.js';
import type { RunEvent } from '../lib/types.js';

export const executeRoute = new Hono();

function encodeEvent(event: RunEvent): string {
  return `${JSON.stringify(event)}\n`;
}

function runnerSource(userModuleSpecifier: string): string {
  return `
const send = (event) => process.stdout.write(JSON.stringify(event) + '\\n');
const format = (value) => {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  return value;
};
const serializeArgs = (args) => args.map(format);
for (const level of ['log', 'warn', 'error', 'info', 'debug']) {
  console[level] = (...args) => {
    send({ type: 'console', level, values: serializeArgs(args) });
  };
}
try {
  const userModule = await import(${JSON.stringify(userModuleSpecifier)});
  const value = Object.prototype.hasOwnProperty.call(userModule, 'default') ? userModule.default : undefined;
  send({ type: 'return', value: format(value) });
} catch (error) {
  send({ type: 'error', message: error?.message ?? String(error), stack: error?.stack });
  process.exitCode = 1;
}
`;
}

executeRoute.post('/execute', async (c) => {
  const encoder = new TextEncoder();

  try {
    const body = await c.req.json<{ code?: string; packagePath?: string }>();
    const resolved = await resolvePackage(body.packagePath ?? '');
    const projectDir = await createTempProject('node-runs', resolved);
    const userSource = createUserEntrySource(body.code ?? '', resolved);
    const entryPath = await writeTempEntry(projectDir, 'entry.ts', userSource);
    const output = await build({
      entryPoints: [entryPath],
      bundle: false,
      write: false,
      format: 'esm',
      platform: 'node',
      target: 'node22',
      absWorkingDir: projectDir,
      sourcemap: 'inline',
      logLevel: 'silent',
      outfile: path.join(projectDir, 'entry.mjs')
    });

    const compiledEntryPath = await writeTempEntry(projectDir, 'entry.mjs', output.outputFiles[0]?.text ?? '');
    const runnerPath = await writeTempEntry(projectDir, 'runner.mjs', runnerSource(pathToFileURL(compiledEntryPath).href));

    const stream = new ReadableStream({
      start(controller) {
        const child = spawn(process.execPath, [runnerPath], {
          cwd: projectDir,
          env: { ...process.env, NODE_NO_WARNINGS: '1' },
          stdio: ['ignore', 'pipe', 'pipe']
        });

        child.stdout.on('data', (chunk: Buffer) => {
          controller.enqueue(chunk);
        });

        child.stderr.on('data', (chunk: Buffer) => {
          controller.enqueue(encoder.encode(encodeEvent({ type: 'stderr', message: chunk.toString() })));
        });

        child.on('error', (error) => {
          controller.enqueue(encoder.encode(encodeEvent({ type: 'error', message: error.message, stack: error.stack })));
          controller.close();
        });

        child.on('close', (exitCode) => {
          controller.enqueue(encoder.encode(encodeEvent({ type: 'done', exitCode })));
          controller.close();
        });
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-cache'
      }
    });
  } catch (error) {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            encodeEvent({
              type: 'error',
              message: error instanceof Error ? error.message : String(error),
              stack: error instanceof Error ? error.stack : undefined
            })
          )
        );
        controller.enqueue(encoder.encode(encodeEvent({ type: 'done', exitCode: 1 })));
        controller.close();
      }
    });

    return new Response(stream, {
      status: 400,
      headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' }
    });
  }
});
