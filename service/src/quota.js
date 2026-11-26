import { accessSync, constants } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const WINDOW_ORDER = ['5-Hour', 'Weekly', 'Claude/GPT | 5-Hour', 'Claude/GPT | Weekly'];
const MIN_VALID_RESET_MS = Date.UTC(2000, 0, 1);
const DEFAULT_TIMEOUT_MS = 18000;
const MAX_BUFFER_BYTES = 262144;
const ALLOWED_ENV_KEYS = ['HOME', 'PATH', 'LANG', 'LC_ALL', 'TMPDIR', 'USER'];

const BUCKET_IDS = {
  'gemini-5h': ['5-Hour', 18000],
  'gemini-weekly': ['Weekly', 604800],
  '3p-5h': ['Claude/GPT | 5-Hour', 18000],
  '3p-weekly': ['Claude/GPT | Weekly', 604800],
};

const GROUP_PREFIXES = {
  'Gemini Models': 'Gemini',
  'Claude and GPT models': 'Claude/GPT',
};

const PERIOD_SPECS = {
  '5h': ['5-Hour', 18000],
  weekly: ['Weekly', 604800],
  'Five Hour Limit Remaining': ['5-Hour', 18000],
  'Weekly Limit Remaining': ['Weekly', 604800],
};

let cachedBinary;

function resolveWindowSpec(groupName, bucket) {
  if (typeof bucket?.id === 'string' && Object.hasOwn(BUCKET_IDS, bucket.id)) {
    return BUCKET_IDS[bucket.id];
  }
  const prefix = Object.hasOwn(GROUP_PREFIXES, groupName) ? GROUP_PREFIXES[groupName] : null;
  if (!prefix) return null;
  const period =
    (typeof bucket?.window === 'string' && Object.hasOwn(PERIOD_SPECS, bucket.window) && PERIOD_SPECS[bucket.window]) ||
    (typeof bucket?.name === 'string' && Object.hasOwn(PERIOD_SPECS, bucket.name) && PERIOD_SPECS[bucket.name]) ||
    null;
  if (!period) return null;
  return [prefix === 'Gemini' ? period[0] : `${prefix} | ${period[0]}`, period[1]];
}

function buildChildEnv(sourceEnv = process.env) {
  const env = {};
  for (const key of ALLOWED_ENV_KEYS) {
    if (sourceEnv[key] !== undefined) env[key] = sourceEnv[key];
  }
  return env;
}

/**
 * Parse `agy -p /usage --output-format json` stdout into OpenChamber quota windows.
 */
export function parseUsage(text) {
  let output;
  try {
    output = JSON.parse(text);
  } catch {
    throw new Error('Invalid agy JSON output');
  }
  const groups = output?.command?.data?.groups;
  if (output?.status !== 'SUCCESS' || output?.command?.name !== 'usage' || !Array.isArray(groups)) {
    throw new Error('Unexpected agy quota output');
  }

  const windows = {};
  for (const group of groups) {
    if (!Array.isArray(group?.buckets)) throw new Error('Unexpected quota group');
    for (const bucket of group.buckets) {
      const spec = resolveWindowSpec(group.name, bucket);
      const fraction = bucket?.remaining_fraction;
      if (!spec || typeof fraction !== 'number' || !Number.isFinite(fraction) || fraction < 0 || fraction > 1) {
        throw new Error('Invalid quota window');
      }
      const [key, windowSeconds] = spec;
      if (Object.hasOwn(windows, key)) throw new Error('Duplicate quota window');

      const parsedReset = typeof bucket.reset_time === 'string' ? Date.parse(bucket.reset_time) : NaN;
      const used = Math.max(0, Math.min(100, (1 - fraction) * 100));
      windows[key] = {
        usedPercent: Number(used.toFixed(4)),
        valueLabel: `${used.toFixed(2)}%`,
        windowSeconds,
        resetAt: Number.isFinite(parsedReset) && parsedReset >= MIN_VALID_RESET_MS ? parsedReset : null,
      };
    }
  }

  if (Object.keys(windows).length !== WINDOW_ORDER.length) {
    throw new Error('Incomplete quota output from agy');
  }
  const ordered = {};
  for (const key of WINDOW_ORDER) ordered[key] = windows[key];
  return { ok: true, configured: true, usage: { windows: ordered } };
}

/**
 * Locate an executable `agy` binary across standard install paths and PATH.
 */
export function findAgy({ env = process.env, access = accessSync } = {}) {
  const candidates = [
    join(homedir(), '.local/bin/agy'),
    '/opt/homebrew/bin/agy',
    '/usr/local/bin/agy',
  ];
  if (typeof env?.PATH === 'string') {
    for (const dir of env.PATH.split(delimiter)) {
      if (dir) candidates.push(join(dir, 'agy'));
    }
  }
  const seen = new Set();
  for (const candidate of candidates) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    try {
      access(candidate, constants.X_OK);
      return candidate;
    } catch {}
  }
  return null;
}

/**
 * Execute `agy -p /usage --output-format json` with a minimal environment and parse quota.
 */
export async function readUsage({
  binary,
  run = execFileAsync,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const resolved = binary === undefined ? (cachedBinary ??= findAgy()) : binary;
  if (!resolved) {
    return {
      ok: false,
      configured: true,
      error: 'Antigravity CLI (agy) was not found in PATH or standard locations.',
      usage: null,
    };
  }
  try {
    const { stdout } = await run(resolved, ['-p', '/usage', '--output-format', 'json'], {
      timeout: timeoutMs,
      maxBuffer: MAX_BUFFER_BYTES,
      encoding: 'utf8',
      env: buildChildEnv(),
    });
    return parseUsage(stdout);
  } catch (err) {
    if (err?.code === 'ENOENT' && binary === undefined) cachedBinary = undefined;
    const message =
      err?.killed || err?.code === 'ETIMEDOUT'
        ? 'Antigravity CLI timed out while reading quota.'
        : 'Could not read Antigravity quota. Check agy sign-in and run agy -p /usage.';
    return { ok: false, configured: true, error: message, usage: null };
  }
}
