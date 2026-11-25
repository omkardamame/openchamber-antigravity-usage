import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readQuotaProviderRequest } from '@openchamber/sdk';
import { readUsage } from './quota.js';

const MAX_BODY_BYTES = 65536;

function sendJson(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
}

function isAuthorized(authHeader, token) {
  const supplied = Buffer.from(String(authHeader ?? ''));
  const expected = Buffer.from(`Bearer ${token}`);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

/**
 * Build the HTTP request handler for the OpenChamber quota provider service.
 */
export function createRequestHandler({ token, readQuota = readUsage }) {
  let pending;
  return async (req, res) => {
    if (!isAuthorized(req.headers.authorization, token)) {
      return sendJson(res, 401, { error: 'unauthorized' });
    }
    const { pathname } = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (req.method === 'GET' && pathname === '/health') {
      return sendJson(res, 200, { ok: true });
    }
    if (req.method !== 'POST' || pathname !== '/quota') {
      return sendJson(res, 404, { error: 'not found' });
    }

    let body = '';
    let size = 0;
    try {
      for await (const chunk of req) {
        size += Buffer.byteLength(chunk);
        if (size > MAX_BODY_BYTES) return sendJson(res, 413, { error: 'request too large' });
        body += chunk;
      }
      if (!readQuotaProviderRequest(body)) {
        return sendJson(res, 400, { error: 'invalid request' });
      }
      pending ??= Promise.resolve(readQuota()).finally(() => {
        pending = undefined;
      });
      return sendJson(res, 200, { ok: true, data: await pending });
    } catch {
      return sendJson(res, 500, { error: 'service error' });
    }
  };
}

export function startServer() {
  const port = Number(process.env.OPENCHAMBER_SERVICE_PORT);
  const token = process.env.OPENCHAMBER_SERVICE_TOKEN ?? '';
  if (!port || !token) {
    throw new Error('OpenChamber service port and token are required');
  }
  const server = http.createServer(createRequestHandler({ token }));
  server.listen(port, '127.0.0.1');

  const shutdown = () => {
    server.close(() => process.exit(0));
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  return server;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  startServer();
}
