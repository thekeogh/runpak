import { Hono } from 'hono';
import { build } from 'esbuild';
import { resolvePackage } from '../lib/resolvePackage.js';
import { createTempProject, writeTempEntry } from '../lib/tempProject.js';
import { createUserEntrySource } from '../lib/userSource.js';

export const bundleRoute = new Hono();

bundleRoute.post('/bundle', async (c) => {
  try {
    const body = await c.req.json<{ packagePath?: string; code?: string }>();
    const resolved = await resolvePackage(body.packagePath ?? '');
    const projectDir = await createTempProject('browser-runs', resolved);
    const source = createUserEntrySource(body.code ?? '', resolved);
    const entryPath = await writeTempEntry(projectDir, 'entry.ts', source);
    const output = await build({
      entryPoints: [entryPath],
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'browser',
      target: 'es2022',
      absWorkingDir: projectDir,
      sourcemap: 'inline',
      logLevel: 'silent'
    });

    return c.json({
      code: output.outputFiles[0]?.text ?? '',
      resolved
    });
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : String(error)
      },
      400
    );
  }
});
