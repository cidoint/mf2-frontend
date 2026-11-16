// make.fun's public API: read-only GET requests, open to any origin (CORS).
// The full API is described at https://make.fun/api/openapi.json.
//
// Responses are cached in sessionStorage keyed by URL with a 60-second TTL,
// and concurrent requests for the same URL are deduped so only one network
// call is in flight at a time. A failed network still renders the last cached
// body, even after its TTL has expired.

const API = 'https://make.fun/api';
const PREFIX = 'makefun:';
const TTL = 60 * 1000; // 60 seconds

function read(key) {
  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    sessionStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    try {
      sessionStorage.clear();
    } catch {
      // no storage available; the cache is optional
    }
  }
}

const inflight = new Map();

async function get(path) {
  const cached = read(path);
  if (cached && Date.now() - cached.ts < TTL) return cached.body;

  const pending = inflight.get(path);
  if (pending) return pending;

  const request = (async () => {
    let res;
    try {
      res = await fetch(API + path);
    } catch {
      if (cached) return cached.body;
      throw new Error('network');
    }

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    write(path, { ts: Date.now(), body });
    return body;
  })();

  inflight.set(path, request);
  try {
    return await request;
  } finally {
    inflight.delete(path);
  }
}

/** The open bounties: { items: [...], next_cursor }. */
export const getBounties = () => get('/competitions?status=open&activity=times');

/** One bounty, by its slug. */
export const getBounty = (slug) => get(`/competitions/${encodeURIComponent(slug)}`);

/** A bounty's leaderboard. */
export const getLeaderboard = (slug) => get(`/competitions/${encodeURIComponent(slug)}/leaderboard`);

/** An account's public profile, by handle. */
export const getProfile = (handle) => get(`/profiles/${encodeURIComponent(handle)}`);
