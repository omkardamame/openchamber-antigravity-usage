// service/src/main.js
import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
// node_modules/@openchamber/sdk/dist/scrollbar-style.js
var GUEST_SCROLLING_ATTRIBUTE = "data-oc-scrolling";
var GUEST_SCROLLBAR_CSS = `
:root {
  /* Quiet at rest like the app's own thumbs; hover gives a clear grab target. */
  --oc-scrollbar-thumb: color-mix(in srgb, var(--oc-muted, currentColor) 18%, transparent);
  --oc-scrollbar-thumb-hover: color-mix(in srgb, var(--oc-muted, currentColor) 36%, transparent);
  scrollbar-gutter: stable;
}
* {
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}
:hover, [${GUEST_SCROLLING_ATTRIBUTE}] {
  scrollbar-color: var(--oc-scrollbar-thumb) transparent;
}
/* Chromium's standard scrollbar properties otherwise override its pseudo-elements. */
@supports selector(::-webkit-scrollbar) {
  *, :hover, [${GUEST_SCROLLING_ATTRIBUTE}] { scrollbar-width: auto; scrollbar-color: auto; }
  ::-webkit-scrollbar { width: 6px; height: 6px; background: transparent; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb {
    background: transparent;
    border-radius: 999px;
    min-width: 24px;
    min-height: 24px;
  }
  :hover::-webkit-scrollbar-thumb, [${GUEST_SCROLLING_ATTRIBUTE}]::-webkit-scrollbar-thumb { background: var(--oc-scrollbar-thumb); }
  ::-webkit-scrollbar-thumb:hover { background: var(--oc-scrollbar-thumb-hover); }
  ::-webkit-scrollbar-corner { background: transparent; }
  ::-webkit-scrollbar-button { display: none; width: 0; height: 0; }
}
@media (forced-colors: active) {
  *, :hover, [${GUEST_SCROLLING_ATTRIBUTE}] { scrollbar-color: auto; }
  ::-webkit-scrollbar-thumb, ::-webkit-scrollbar-thumb:hover { background: CanvasText; }
}
`;
function installGuestScrollbarActivity(doc) {
  const root = doc.documentElement;
  if (root.hasAttribute("data-oc-scrollbar-activity"))
    return;
  root.setAttribute("data-oc-scrollbar-activity", "");
  const timers = new WeakMap;
  doc.addEventListener("scroll", (event) => {
    const target = event.target === doc ? root : event.target;
    if (!(target instanceof Element))
      return;
    if (!target.hasAttribute("data-oc-scrolling"))
      target.setAttribute("data-oc-scrolling", "");
    const pending = timers.get(target);
    if (pending !== undefined)
      clearTimeout(pending);
    timers.set(target, setTimeout(() => {
      timers.delete(target);
      target.removeAttribute("data-oc-scrolling");
    }, 1000));
  }, { capture: true, passive: true });
}
var GUEST_SCROLLBAR_SCRIPT = `(${installGuestScrollbarActivity.toString()})(document);`;
// node_modules/@openchamber/sdk/dist/manifest.js
var TRACKER_URL_TOKENS = ["{id}", "{segment}", "{segments+}"];
var TRACKER_URL_TOKEN_SET = new Set(TRACKER_URL_TOKENS);
// node_modules/@openchamber/sdk/dist/session-events.js
var GUEST_SESSION_EVENT_TYPES = [
  "turn-finished",
  "turn-failed",
  "permission-asked",
  "question-asked",
  "turn-started",
  "session-created",
  "session-archived",
  "session-deleted"
];
var SESSION_EVENTS_IDLE_MS = 10 * 60000;
var EVENT_TYPES = new Set(GUEST_SESSION_EVENT_TYPES);
// node_modules/@openchamber/sdk/dist/service-host.js
var SERVICE_SCHEDULE_IDLE_MS = 10 * 60000;
var MENTIONS_IDLE_MS = 10 * 60000;
// node_modules/@openchamber/sdk/dist/file-editor.js
var patternExpressions = new Map;
// node_modules/@openchamber/sdk/dist/contract.js
var GUEST_FILE_STAT_KINDS = ["file", "directory", "other", "missing"];
var GUEST_GENERATE_LATE_KEEP_MS = 60 * 60000;
var HOST_REQUEST_ERROR_CODES = [
  "HOST_UNAVAILABLE",
  "HOST_TIMEOUT",
  "HOST_REJECTED",
  "DISCONNECTED",
  "DISABLED",
  "BAD_PATH",
  "NO_INTEGRATION",
  "NO_SERVICE",
  "SERVICE_FAILED",
  "REQUEST_FAILED",
  "RESPONSE_TOO_LARGE",
  "NO_SESSION",
  "SESSION_BUSY",
  "NOT_GRANTED",
  "NO_DIRECTORY",
  "NOT_FOUND",
  "FILE_TOO_LARGE",
  "DENIED",
  "NO_MODEL",
  "MODEL_FAILED",
  "UNSUPPORTED"
];
var SERVICE_STATUS_VALUES = ["stopped", "starting", "ready", "failed"];
var hostRequestErrorCodeSet = new Set(HOST_REQUEST_ERROR_CODES);
var serviceStatusSet = new Set(SERVICE_STATUS_VALUES);
var fileStatKindSet = new Set(GUEST_FILE_STAT_KINDS);
var HOST_PUSH_TYPES = new Set([
  "workspace",
  "shells",
  "ready",
  "directory",
  "session",
  "connection",
  "settings",
  "session-lifecycle",
  "item",
  "resolve",
  "action",
  "service-event",
  "status-control-event",
  "popover-closed",
  "file-open",
  "file-snapshot",
  "file-saved",
  "generate-late"
]);
// node_modules/@openchamber/sdk/dist/service-providers.js
var BROWSER_CONTROL_ACTIONS = [
  "browser.open",
  "browser.snapshot",
  "browser.click",
  "browser.type",
  "browser.select",
  "browser.scroll",
  "browser.back",
  "browser.forward",
  "browser.inspect",
  "browser.capture",
  "browser.resize",
  "browser.close"
];
var BROWSER_PROVIDER_IDLE_MS = 10 * 60000;
var CONTROL_ACTIONS = new Set(BROWSER_CONTROL_ACTIONS);
var SOURCE_CONTROL_PROVIDER_IDLE_MS = 10 * 60000;
var NOTIFICATIONS_PROVIDER_IDLE_MS = 10 * 60000;
var TRACKER_PROVIDER_IDLE_MS = 10 * 60000;
var QUOTA_PROVIDER_WIRE_VERSION = 1;
var QUOTA_PROVIDER_METHODS = ["usage.read"];
var QUOTA_PROVIDER_IDLE_MS = 10 * 60000;
var isQuotaProviderMethod = (value) => QUOTA_PROVIDER_METHODS.some((method) => method === value);
var readQuotaProviderRequest = (body) => {
  let wire;
  try {
    const parsed = JSON.parse(body);
    if (Object(parsed) !== parsed || parsed === null)
      return null;
    wire = parsed;
  } catch {
    return null;
  }
  const { v, requestId, method, provider, input } = wire;
  if (v !== QUOTA_PROVIDER_WIRE_VERSION)
    return null;
  if (String(requestId) !== requestId || requestId.length === 0)
    return null;
  if (String(provider) !== provider || provider.length === 0)
    return null;
  if (String(method) !== method || !isQuotaProviderMethod(method))
    return null;
  if (Object(input) !== input || input === null || input === undefined || Array.isArray(input))
    return null;
  const { credentials } = input;
  if (Object(credentials) !== credentials || credentials === null || Array.isArray(credentials))
    return null;
  if (Object.values(Object(credentials)).some((credential) => Object(credential) !== credential || credential === null || Array.isArray(credential)))
    return null;
  return { v: QUOTA_PROVIDER_WIRE_VERSION, requestId, method, provider, input: { credentials } };
};
// node_modules/@openchamber/sdk/dist/service-surface.js
var SURFACE_CONTROLLERS = ["none", "agent", "user"];
var CONTROLLERS = new Set(SURFACE_CONTROLLERS);
// service/src/quota.js
import { accessSync, constants } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
var execFileAsync = promisify(execFile);
var WINDOW_ORDER = ["5-Hour", "Weekly", "Claude/GPT | 5-Hour", "Claude/GPT | Weekly"];
var MIN_VALID_RESET_MS = Date.UTC(2000, 0, 1);
var DEFAULT_TIMEOUT_MS = 18000;
var MAX_BUFFER_BYTES = 262144;
var ALLOWED_ENV_KEYS = ["HOME", "PATH", "LANG", "LC_ALL", "TMPDIR", "USER"];
var BUCKET_IDS = {
  "gemini-5h": ["5-Hour", 18000],
  "gemini-weekly": ["Weekly", 604800],
  "3p-5h": ["Claude/GPT | 5-Hour", 18000],
  "3p-weekly": ["Claude/GPT | Weekly", 604800]
};
var GROUP_PREFIXES = {
  "Gemini Models": "Gemini",
  "Claude and GPT models": "Claude/GPT"
};
var PERIOD_SPECS = {
  "5h": ["5-Hour", 18000],
  weekly: ["Weekly", 604800],
  "Five Hour Limit Remaining": ["5-Hour", 18000],
  "Weekly Limit Remaining": ["Weekly", 604800]
};
var cachedBinary;
function resolveWindowSpec(groupName, bucket) {
  if (typeof bucket?.id === "string" && Object.hasOwn(BUCKET_IDS, bucket.id)) {
    return BUCKET_IDS[bucket.id];
  }
  const prefix = Object.hasOwn(GROUP_PREFIXES, groupName) ? GROUP_PREFIXES[groupName] : null;
  if (!prefix)
    return null;
  const period = typeof bucket?.window === "string" && Object.hasOwn(PERIOD_SPECS, bucket.window) && PERIOD_SPECS[bucket.window] || typeof bucket?.name === "string" && Object.hasOwn(PERIOD_SPECS, bucket.name) && PERIOD_SPECS[bucket.name] || null;
  if (!period)
    return null;
  return [prefix === "Gemini" ? period[0] : `${prefix} | ${period[0]}`, period[1]];
}
function buildChildEnv(sourceEnv = process.env) {
  const env = {};
  for (const key of ALLOWED_ENV_KEYS) {
    if (sourceEnv[key] !== undefined)
      env[key] = sourceEnv[key];
  }
  return env;
}
function parseUsage(text) {
  let output;
  try {
    output = JSON.parse(text);
  } catch {
    throw new Error("Invalid agy JSON output");
  }
  const groups = output?.command?.data?.groups;
  if (output?.status !== "SUCCESS" || output?.command?.name !== "usage" || !Array.isArray(groups)) {
    throw new Error("Unexpected agy quota output");
  }
  const windows = {};
  for (const group of groups) {
    if (!Array.isArray(group?.buckets))
      throw new Error("Unexpected quota group");
    for (const bucket of group.buckets) {
      const spec = resolveWindowSpec(group.name, bucket);
      const fraction = bucket?.remaining_fraction;
      if (!spec || typeof fraction !== "number" || !Number.isFinite(fraction) || fraction < 0 || fraction > 1) {
        throw new Error("Invalid quota window");
      }
      const [key, windowSeconds] = spec;
      if (Object.hasOwn(windows, key))
        throw new Error("Duplicate quota window");
      const parsedReset = typeof bucket.reset_time === "string" ? Date.parse(bucket.reset_time) : NaN;
      const used = Math.max(0, Math.min(100, (1 - fraction) * 100));
      windows[key] = {
        usedPercent: Number(used.toFixed(4)),
        valueLabel: `${used.toFixed(2)}%`,
        windowSeconds,
        resetAt: Number.isFinite(parsedReset) && parsedReset >= MIN_VALID_RESET_MS ? parsedReset : null
      };
    }
  }
  if (Object.keys(windows).length !== WINDOW_ORDER.length) {
    throw new Error("Incomplete quota output from agy");
  }
  const ordered = {};
  for (const key of WINDOW_ORDER)
    ordered[key] = windows[key];
  return { ok: true, configured: true, usage: { windows: ordered } };
}
function findAgy({ env = process.env, access = accessSync } = {}) {
  const candidates = [
    join(homedir(), ".local/bin/agy"),
    "/opt/homebrew/bin/agy",
    "/usr/local/bin/agy"
  ];
  if (typeof env?.PATH === "string") {
    for (const dir of env.PATH.split(delimiter)) {
      if (dir)
        candidates.push(join(dir, "agy"));
    }
  }
  const seen = new Set;
  for (const candidate of candidates) {
    if (seen.has(candidate))
      continue;
    seen.add(candidate);
    try {
      access(candidate, constants.X_OK);
      return candidate;
    } catch {}
  }
  return null;
}
async function readUsage({
  binary,
  run = execFileAsync,
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
  const resolved = binary === undefined ? cachedBinary ??= findAgy() : binary;
  if (!resolved) {
    return {
      ok: false,
      configured: true,
      error: "Antigravity CLI (agy) was not found in PATH or standard locations.",
      usage: null
    };
  }
  try {
    const { stdout } = await run(resolved, ["-p", "/usage", "--output-format", "json"], {
      timeout: timeoutMs,
      maxBuffer: MAX_BUFFER_BYTES,
      encoding: "utf8",
      env: buildChildEnv()
    });
    return parseUsage(stdout);
  } catch (err) {
    if (err?.code === "ENOENT" && binary === undefined)
      cachedBinary = undefined;
    const message = err?.killed || err?.code === "ETIMEDOUT" ? "Antigravity CLI timed out while reading quota." : "Could not read Antigravity quota. Check agy sign-in and run agy -p /usage.";
    return { ok: false, configured: true, error: message, usage: null };
  }
}

// service/src/main.js
var MAX_BODY_BYTES = 65536;
function sendJson(res, status, data) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(data));
}
function isAuthorized(authHeader, token) {
  const supplied = Buffer.from(String(authHeader ?? ""));
  const expected = Buffer.from(`Bearer ${token}`);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
function createRequestHandler({ token, readQuota = readUsage }) {
  let pending;
  return async (req, res) => {
    if (!isAuthorized(req.headers.authorization, token)) {
      return sendJson(res, 401, { error: "unauthorized" });
    }
    const { pathname } = new URL(req.url ?? "/", "http://127.0.0.1");
    if (req.method === "GET" && pathname === "/health") {
      return sendJson(res, 200, { ok: true });
    }
    if (req.method !== "POST" || pathname !== "/quota") {
      return sendJson(res, 404, { error: "not found" });
    }
    let body = "";
    let size = 0;
    try {
      for await (const chunk of req) {
        size += Buffer.byteLength(chunk);
        if (size > MAX_BODY_BYTES)
          return sendJson(res, 413, { error: "request too large" });
        body += chunk;
      }
      if (!readQuotaProviderRequest(body)) {
        return sendJson(res, 400, { error: "invalid request" });
      }
      pending ??= Promise.resolve(readQuota()).finally(() => {
        pending = undefined;
      });
      return sendJson(res, 200, { ok: true, data: await pending });
    } catch {
      return sendJson(res, 500, { error: "service error" });
    }
  };
}
function startServer() {
  const port = Number(process.env.OPENCHAMBER_SERVICE_PORT);
  const token = process.env.OPENCHAMBER_SERVICE_TOKEN ?? "";
  if (!port || !token) {
    throw new Error("OpenChamber service port and token are required");
  }
  const server = http.createServer(createRequestHandler({ token }));
  server.listen(port, "127.0.0.1");
  const shutdown = () => {
    server.close(() => process.exit(0));
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  return server;
}
var isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  startServer();
}
export {
  startServer,
  createRequestHandler
};
