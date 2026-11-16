// A make.fun frontend: the board of open bounties, a page per bounty, each
// bounty's leaderboard, and an account's public profile, on hash routes:
//
//   #/                                  the board
//   #/bounty/<slug>                     one bounty
//   #/bounty/<slug>/leaderboard         its leaderboard
//   #/account/<handle>                  an account's public profile
//
// window.__shotReady is false while a page loads and true once its data is on
// screen (and any avatars have settled), so a screenshot script knows when to
// capture.

import { getBounties, getBounty, getLeaderboard, getProfile } from './api.js';
import { board, bounty, leaderboard, profile } from './views.js';

const app = document.getElementById('app');

function path() {
  const raw = location.hash.slice(1) || '/';
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** Resolve once the page's images have loaded or failed, so a screenshot waits for avatars. */
function settled(root) {
  const images = Array.from(root.querySelectorAll('img'));
  if (!images.length) return Promise.resolve();
  return Promise.all(
    images.map((img) => {
      if (img.complete) return Promise.resolve();
      return new Promise((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          resolve();
        };
        img.addEventListener('load', finish, { once: true });
        img.addEventListener('error', finish, { once: true });
        setTimeout(finish, 3000);
      });
    }),
  );
}

async function render() {
  window.__shotReady = false;
  app.innerHTML = '<p class="loading">Loading…</p>';

  try {
    const p = path();
    let match;

    if ((match = p.match(/^\/bounty\/([^/]+)\/leaderboard\/?$/))) {
      const data = await getLeaderboard(match[1]);
      document.title = `Leaderboard · ${data.competition?.title ?? match[1]} | make.fun`;
      app.innerHTML = leaderboard(data);
    } else if ((match = p.match(/^\/bounty\/([^/]+)\/?$/))) {
      const b = await getBounty(match[1]);
      document.title = `${b.title} | make.fun bounties`;
      app.innerHTML = bounty(b);
    } else if ((match = p.match(/^\/account\/([^/]+)\/?$/))) {
      const p = await getProfile(match[1]);
      document.title = `${p.display_name ?? p.handle} | make.fun`;
      app.innerHTML = profile(p);
    } else {
      document.title = 'make.fun bounties';
      app.innerHTML = board(await getBounties());
    }
  } catch {
    document.title = 'make.fun bounties';
    app.innerHTML = '<p class="error">That page could not be loaded. <a href="#/">Back to the board</a></p>';
  }

  window.scrollTo(0, 0);
  await settled(app);
  window.__shotReady = true;
}

window.addEventListener('hashchange', render);
render();
