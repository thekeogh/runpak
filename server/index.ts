import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundleRoute } from './routes/bundle.js';
import { executeRoute } from './routes/execute.js';
import { resolveRoute } from './routes/resolve.js';

const app = new Hono();
const port = Number(process.env.PORT ?? 7777);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distRoot = path.resolve(__dirname, '../../dist');

app.use(logger());
app.route('/api', resolveRoute);
app.route('/api', bundleRoute);
app.route('/api', executeRoute);
app.use('/assets/*', serveStatic({ root: distRoot }));
app.get('/favicon.svg', serveStatic({ path: path.join(distRoot, 'favicon.svg') }));
app.get('/favicon.ico', (c) => c.redirect('/favicon.svg'));
app.get('*', serveStatic({ path: path.join(distRoot, 'index.html') }));

serve({ fetch: app.fetch, port }, () => {
  const url = `http://localhost:${port}`;
  console.log(`Runpak is running at ${url}`);
  if (!process.env.RUNPAK_NO_OPEN) {
    const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
    const args = process.platform === 'win32' ? ['/c', 'start', url] : [url];
    spawn(command, args, { detached: true, stdio: 'ignore' }).unref();
  }
});
