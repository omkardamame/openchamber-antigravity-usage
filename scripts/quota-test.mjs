import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { findAgy, parseUsage, readUsage } from '../service/src/quota.js';
import { createRequestHandler } from '../service/src/main.js';

const sample = JSON.stringify({
  status: 'SUCCESS',
  command: {
    name: 'usage',
    data: {
      groups: [
        {
          name: 'Gemini Models',
          buckets: [
            {
              id: 'gemini-weekly',
              name: 'Weekly Limit Remaining',
              window: 'weekly',
              remaining_fraction: 0.9998233318,
              reset_time: '2026-12-02T12:18:21Z',
            },
            {
              id: 'gemini-5h',
              name: 'Five Hour Limit Remaining',
              window: '5h',
              remaining_fraction: 0.9992934465,
              reset_time: '2026-11-25T17:18:21Z',
            },
          ],
        },
        {
          name: 'Claude and GPT models',
          buckets: [
            {
              id: '3p-weekly',
              name: 'Weekly Limit Remaining',
              window: 'weekly',
              remaining_fraction: 1,
              reset_time: '1970-01-01T00:00:00Z',
            },
            {
              id: '3p-5h',
              name: 'Five Hour Limit Remaining',
              window: '5h',
              remaining_fraction: 0.225,
              reset_time: '1970-01-01T00:00:00Z',
            },
          ],
        },
      ],
    },
  },
});

test('four named quota windows, ordering, and unknown resets', () => {
  const windows = parseUsage(sample).usage.windows;
  assert.equal(windows['Weekly'].valueLabel, '0.02%');
  assert.equal(windows['5-Hour'].valueLabel, '0.07%');
  assert.equal(windows['Claude/GPT | 5-Hour'].usedPercent, 77.5);
  assert.equal(windows['Claude/GPT | Weekly'].valueLabel, '0.00%');
  assert.equal(windows['Claude/GPT | Weekly'].resetAt, null);
  assert.deepEqual(Object.keys(windows), ['5-Hour', 'Weekly', 'Claude/GPT | 5-Hour', 'Claude/GPT | Weekly']);
});

test('falls back to group and bucket names when bucket ids are absent', () => {
  const withoutIds = JSON.parse(sample);
  for (const group of withoutIds.command.data.groups) {
    for (const bucket of group.buckets) delete bucket.id;
  }
  const windows = parseUsage(JSON.stringify(withoutIds)).usage.windows;
  assert.equal(windows['5-Hour'].valueLabel, '0.07%');
  assert.equal(windows['Claude/GPT | 5-Hour'].usedPercent, 77.5);
});

test('rejects incomplete, unknown, duplicated and invalid data', () => {
  const parsed = JSON.parse(sample);
  const incomplete = structuredClone(parsed);
  incomplete.command.data.groups[0].buckets.pop();
  const duplicate = structuredClone(parsed);
  duplicate.command.data.groups[0].buckets.push(duplicate.command.data.groups[0].buckets[0]);
  const renamedOnly = JSON.parse(sample.replace('Gemini Models', 'unexpected'));
  for (const group of renamedOnly.command.data.groups) {
    for (const bucket of group.buckets) delete bucket.id;
  }

  for (const input of [
    '',
    JSON.stringify(incomplete),
    JSON.stringify(duplicate),
    JSON.stringify(renamedOnly),
    sample.replace('0.9998233318', '1.01'),
    sample.replace('SUCCESS', 'ERROR'),
  ]) {
    assert.throws(() => parseUsage(input));
  }
});

test('findAgy searches PATH when standard locations are absent', () => {
  const found = findAgy({
    env: { PATH: '/custom/bin:/other/bin' },
    access: (path) => {
      if (path !== '/other/bin/agy') throw new Error('ENOENT');
    },
  });
  assert.equal(found, '/other/bin/agy');
  assert.equal(
    findAgy({
      env: { PATH: '' },
      access: () => {
        throw new Error('ENOENT');
      },
    }),
    null
  );
});

test('errors fail closed, report timeout, and child receives no service token', async () => {
  process.env.OPENCHAMBER_SERVICE_TOKEN = 'test-token';
  const result = await readUsage({
    binary: '/test/agy',
    run: async (bin, args, options) => {
      assert.equal(bin, '/test/agy');
      assert.deepEqual(args, ['-p', '/usage', '--output-format', 'json']);
      assert.equal(options.env.OPENCHAMBER_SERVICE_TOKEN, undefined);
      return { stdout: sample };
    },
  });
  assert.equal(result.ok, true);

  const missing = await readUsage({ binary: null });
  assert.equal(missing.ok, false);
  assert.equal(missing.configured, true);

  const timedOut = await readUsage({
    binary: '/test/agy',
    run: async () => {
      const err = new Error('timeout');
      err.killed = true;
      throw err;
    },
  });
  assert.equal(timedOut.ok, false);
  assert.match(timedOut.error, /timed out/i);

  const failed = await readUsage({
    binary: '/test/agy',
    run: async () => {
      throw new Error('secret');
    },
  });
  assert.equal(failed.ok, false);
  assert.doesNotMatch(failed.error, /secret/);
});

function invokeHandler(handler, { method = 'GET', url = '/health', headers = {}, body = '' } = {}) {
  return new Promise((resolvePromise) => {
    const req = Readable.from(body ? [Buffer.from(body)] : []);
    req.method = method;
    req.url = url;
    req.headers = headers;
    const res = {
      statusCode: 0,
      headers: {},
      writeHead(status, hdrs) {
        this.statusCode = status;
        this.headers = hdrs;
      },
      end(chunk) {
        resolvePromise({ status: this.statusCode, body: JSON.parse(String(chunk)) });
      },
    };
    handler(req, res);
  });
}

test('HTTP handler enforces auth, validates payload, and coalesces concurrent /quota calls', async () => {
  let calls = 0;
  const handler = createRequestHandler({
    token: 'secret-tok',
    readQuota: async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 10));
      return { ok: true, configured: true, usage: { windows: {} } };
    },
  });

  const unauth = await invokeHandler(handler, { url: '/health' });
  assert.equal(unauth.status, 401);

  const health = await invokeHandler(handler, {
    url: '/health',
    headers: { authorization: 'Bearer secret-tok' },
  });
  assert.equal(health.status, 200);
  assert.equal(health.body.ok, true);

  const badBody = await invokeHandler(handler, {
    method: 'POST',
    url: '/quota',
    headers: { authorization: 'Bearer secret-tok' },
    body: '{"bad":true}',
  });
  assert.equal(badBody.status, 400);

  const validBody = JSON.stringify({
    v: 1,
    requestId: 'req-1',
    method: 'usage.read',
    provider: 'ext-antigravity-usage',
    input: { credentials: {} },
  });
  const [r1, r2] = await Promise.all([
    invokeHandler(handler, {
      method: 'POST',
      url: '/quota',
      headers: { authorization: 'Bearer secret-tok' },
      body: validBody,
    }),
    invokeHandler(handler, {
      method: 'POST',
      url: '/quota',
      headers: { authorization: 'Bearer secret-tok' },
      body: validBody,
    }),
  ]);
  assert.equal(r1.status, 200);
  assert.equal(r2.status, 200);
  assert.equal(calls, 1);
});
