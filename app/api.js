// make.fun's public API: read-only GET requests, open to any origin (CORS).
// The full API is described at https://make.fun/api/openapi.json.
//
// Responses are cached in sessionStorage and revalidated against the server's
// ETag (the data changes about once a minute): a navigation that sees the same
// data gets a 304 and reuses the cached body instead of downloading it again,
// and a failed network still renders the last cached body.

const API = 'https://make.fun/api';
const PREFIX = 'makefun:';

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

async function get(path) {
  const cached = read(path);
  const headers = {};
  if (cached?.etag) headers['If-None-Match'] = cached.etag;

  let res;
  try {
    res = await fetch(API + path, { headers });
  } catch {
    if (cached) return cached.body;
    throw new Error('network');
  }

  if (res.status === 304) return cached.body;

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  write(path, { etag: res.headers.get('ETag'), body });
  return body;
}

/** The open bounties: { items: [...], next_cursor }. */
export const getBounties = () => get('/competitions?status=open&activity=times');

/** One bounty, by its slug. */
export const getBounty = (slug) => get(`/competitions/${encodeURIComponent(slug)}`);

/** A bounty's leaderboard. */
export const getLeaderboard = (slug) => get(`/competitions/${encodeURIComponent(slug)}/leaderboard`);

/** An account's public profile, by handle. */
export const getProfile = (handle) => get(`/profiles/${encodeURIComponent(handle)}`);
