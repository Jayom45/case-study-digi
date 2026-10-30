// One place that talks to the backend. Every error carries the backend's request_id
// so a user can quote it and we can find the exact log lines.
let notifyError = () => {};
export function onApiError(fn) {
  notifyError = fn;
}

export class ApiError extends Error {
  constructor(message, status, requestId, details) {
    super(message);
    this.status = status;
    this.requestId = requestId;
    this.details = details;
  }
}

async function request(method, path, body, { silent = false } = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    const err = new ApiError("Cannot reach the server. Is the backend running?", 0);
    if (!silent) notifyError(err);
    throw err;
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const e = data?.error || {};
    const err = new ApiError(e.message || `Request failed (${res.status})`, res.status,
      e.request_id || res.headers.get("X-Request-ID"), e.details);
    if (!silent) notifyError(err); // silent: caller handles it (e.g. an expected 404)
    throw err;
  }
  return data;
}

export const api = {
  get: (path, opts) => request("GET", path, null, opts),
  post: (path, body, opts) => request("POST", path, body ?? {}, opts),
  patch: (path, body, opts) => request("PATCH", path, body, opts),
};
