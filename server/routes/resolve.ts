import { Hono } from 'hono';
import { getIntellisense } from '../lib/intellisense.js';
import { resolvePackage } from '../lib/resolvePackage.js';

export const resolveRoute = new Hono();

resolveRoute.get('/resolve', async (c) => {
  try {
    const target = c.req.query('path') ?? '';
    const result = await resolvePackage(target);
    return c.json(result);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 400);
  }
});

resolveRoute.get('/intellisense', async (c) => {
  try {
    const target = c.req.query('path') ?? '';
    const result = await getIntellisense(target);
    return c.json(result);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 400);
  }
});
