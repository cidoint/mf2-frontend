// The pages, each a function from API data to HTML.

import { date, esc, money, ordinal, statusLabel, timeLeft } from './format.js';

/** The bounty's live pot: the reward plus any entry fees paid in so far. */
const pot = (b) => money(b.potUsd ?? b.rewardAmount);

/** Whether this bounty's reward is boosted by paid entry fees. */
const livePot = (b) => Number(b.entryFeePayers) > 0;

/** The entry fee when the bounty charges one. */
const fee = (b) =>
  b.entryFeeUsd != null && Number(b.entryFeeUsd) > 0 ? money(b.entryFeeUsd) : '';

const count = (n) => (n == null ? 0 : n);

/** Resolve an API-relative path (avatars, share cards) to an absolute URL. */
function abs(path) {
  if (!path) return '';
  return /^https?:\/\//.test(path) ? path : 'https://make.fun' + (path.startsWith('/') ? path : `/${path}`);
}

/* --- a small markdown renderer for the bounty's description and rules --- */

function inline(text) {
  return esc(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" rel="noopener">$1</a>');
}

function md(src) {
  const lines = String(src ?? '').split('\n');
  const out = [];
  let para = [];
  let list = null; // { ordered, items }
  let i = 0;

  const flushPara = () => {
    if (para.length) {
      out.push(`<p>${inline(para.join(' '))}</p>`);
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      const tag = list.ordered ? 'ol' : 'ul';
      out.push(`<${tag}>${list.items.map((item) => `<li>${inline(item)}</li>`).join('')}</${tag}>`);
      list = null;
    }
  };
  const blank = () => {
    flushPara();
    flushList();
  };

  while (i < lines.length) {
    const line = lines[i];

    if (/^\s*```/.test(line)) {
      blank();
      i += 1;
      const code = [];
      while (i < lines.length && !/^\s*```/.test(lines[i])) {
        code.push(lines[i]);
        i += 1;
      }
      i += 1; // closing fence
      out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`);
      continue;
    }

    const heading = /^(#{1,4})\s+(.+)$/.exec(line);
    if (heading) {
      blank();
      const level = Math.min(heading[1].length + 1, 5);
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      i += 1;
      continue;
    }

    const ul = /^\s*[-*+]\s+(.+)$/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.+)$/.exec(line);
    if (ul || ol) {
      flushPara();
      const ordered = Boolean(ol);
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push((ul || ol)[1]);
      i += 1;
      continue;
    }

    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      blank();
      out.push('<hr>');
      i += 1;
      continue;
    }

    if (!line.trim()) {
      blank();
      i += 1;
      continue;
    }

    flushList();
    para.push(line.trim());
    i += 1;
  }

  blank();
  return out.join('');
}

/* --- the board --- */

export function board(data) {
  const items = data.items ?? [];
  const rows = items
    .map((b) => {
      const f = fee(b);
      const live = livePot(b);
      return `
      <li>
        <span class="title">
          <a href="#/bounty/${encodeURIComponent(b.slug)}">${esc(b.title)}</a>
          <span class="cat">${esc(b.category ?? '')}</span>
        </span>
        <span class="num">${pot(b)}${live ? ' <span class="tag">live</span>' : ''}</span>
        <span class="num">${f || 'free'}</span>
        <span class="time">${timeLeft(b.deadline)}</span>
        <span class="num">${count(b.submissionCount)}</span>
      </li>`;
    })
    .join('');

  return `
    <h1>Open bounties</h1>
    <div class="board-head" aria-hidden="true">
      <span>Bounty</span><span class="num">Reward / pot</span><span class="num">Entry fee</span><span>Time left</span><span class="num">Entries</span>
    </div>
    <ul class="board">${rows}</ul>
    ${items.length ? '' : '<p>No open bounties right now.</p>'}`;
}

/* --- one bounty --- */

export function bounty(b) {
  const f = fee(b);
  const live = livePot(b);
  return `
    <p class="crumb"><a href="#/">← All bounties</a></p>
    <h1>${esc(b.title)}</h1>
    <p class="summary">${esc(b.summary)}</p>

    <dl class="meta">
      <dt>Status</dt><dd><span class="chip ${esc(b.status)}">${esc(statusLabel(b.status))}</span></dd>
      <dt>Reward</dt><dd>${pot(b)}${live ? ' <span class="tag">live pot</span>' : ''}</dd>
      ${f ? `<dt>Entry fee</dt><dd>${f} <span class="muted">· ${count(b.entryFeePayers)} paid</span></dd>` : ''}
      <dt>Entries</dt><dd>${count(b.submissionCount)}</dd>
      <dt>Opened</dt><dd>${date(b.opensAt ?? b.publishedAt)}</dd>
      <dt>Deadline</dt><dd>${date(b.deadline)} · ${timeLeft(b.deadline)}</dd>
      ${b.category ? `<dt>Category</dt><dd>${esc(b.category)}</dd>` : ''}
      ${b.sponsor?.name ? `<dt>Sponsor</dt><dd>${esc(b.sponsor.name)}</dd>` : ''}
    </dl>

    <p><a class="lb-link" href="#/bounty/${encodeURIComponent(b.slug)}/leaderboard">View leaderboard →</a></p>

    ${rewards(b)}

    <h2>Description</h2>
    <div class="prose">${md(b.description)}</div>
    ${b.rules ? `<h2>Rules</h2><div class="prose">${md(b.rules)}</div>` : ''}`;
}

function rewards(b) {
  const live = livePot(b);
  const now = Array.isArray(b.rewardsNow) && b.rewardsNow.length ? b.rewardsNow : null;

  if (!now) {
    const map = b.rewards ?? {};
    const places = Object.keys(map).sort((x, y) => Number(x) - Number(y));
    if (!places.length) return '';
    const rows = places
      .map((p) => `<tr><td>${ordinal(p)}</td><td class="num">${money(map[p])}</td></tr>`)
      .join('');
    return `<h2>Rewards</h2><table class="rewards"><thead><tr><th>Place</th><th class="num">Prize</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  const rows = now
    .map(
      (r) => `
      <tr>
        <td>${ordinal(r.place)}</td>
        <td class="num">${money(r.baseUsd)}</td>
        ${live ? `<td class="num">+ ${money(r.feeShareUsd)}</td><td class="num live">${money(r.amountUsd)}</td>` : `<td class="num">${money(r.amountUsd)}</td>`}
      </tr>`,
    )
    .join('');

  return `
    <h2>Rewards${live ? ` <span class="muted">· live pot ${pot(b)}</span>` : ''}</h2>
    <table class="rewards">
      <thead><tr><th>Place</th><th class="num">Base</th>${live ? '<th class="num">Entry fees</th><th class="num">Live total</th>' : '<th class="num">Total</th>'}</tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

/* --- a bounty's leaderboard --- */

export function leaderboard(data) {
  const comp = data.competition ?? {};
  const phase = data.phase ?? {};
  const cols = (data.columns ?? []).filter((c) => !c.hidden);
  const all = data.entries ?? [];
  const shown = all.slice(0, 100);
  const note = all.length > shown.length ? `Showing the top ${shown.length} of ${all.length} entries.` : '';

  const rows = shown
    .map(
      (e) => `
      <tr>
        <td class="num rank">${e.rank ?? ''}</td>
        <td class="handle"><a href="#/account/${encodeURIComponent(e.handle)}">${esc(e.handle)}</a></td>
        <td class="entry">${esc(e.title ?? '')}</td>
        ${cols.map((c) => `<td class="num">${cell(e, c)}</td>`).join('')}
      </tr>`,
    )
    .join('');

  const phaseNote = [
    phase.scores === 'live' ? 'live scores' : '',
    data.metrics_withheld ? 'provisional' : '',
    phase.placements_held ? 'placements held until final' : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return `
    <p class="crumb"><a href="#/bounty/${encodeURIComponent(comp.slug)}">← ${esc(comp.title)}</a></p>
    <h1>Leaderboard</h1>
    <p class="lb-meta">${esc(phase.title ?? '')}${phaseNote ? ` · ${esc(phaseNote)}` : ''}</p>
    ${note ? `<p class="muted">${esc(note)}</p>` : ''}
    <div class="table-wrap">
      <table class="leaderboard">
        <thead><tr>
          <th class="num">Rank</th><th>Handle</th><th>Entry</th>
          ${cols.map((c) => `<th class="num">${esc(c.title)}</th>`).join('')}
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function cell(e, c) {
  const d = e.display?.[c.key];
  if (d != null) return esc(d);
  const v = e.values?.[c.key];
  return v != null ? esc(String(v)) : '—';
}

/* --- an account's public profile --- */

export function profile(p) {
  const rec = p.record ?? {};
  const avatar = abs(p.avatar?.url_small ?? p.avatar?.url ?? p.image);
  const name = p.display_name ?? p.handle;

  return `
    <p class="crumb"><a href="#/">← All bounties</a></p>
    <div class="profile-head">
      ${avatar ? `<img class="avatar" src="${esc(avatar)}" alt="" width="64" height="64">` : ''}
      <div>
        <h1>${esc(name)}</h1>
        ${p.display_name && p.display_name !== p.handle ? `<p class="handle">@${esc(p.handle)}</p>` : ''}
      </div>
    </div>
    ${p.bio ? `<p class="bio">${esc(p.bio)}</p>` : ''}

    <dl class="meta">
      <dt>Bounties entered</dt><dd>${count(rec.competitions_entered)}</dd>
      <dt>Placed</dt><dd>${count(rec.competitions_placed)}</dd>
      <dt>Won</dt><dd>${count(rec.competitions_won)}</dd>
      <dt>Best placement</dt><dd>${rec.best_placement ? ordinal(rec.best_placement) : '—'}</dd>
      <dt>Prize money</dt><dd>${money(rec.prize_usd)}</dd>
    </dl>

    ${payouts(p)}
    ${entries(p)}`;
}

function payouts(p) {
  const list = p.payouts ?? [];
  if (!list.length) return '';
  const rows = list
    .map(
      (x) => `
      <li>
        <span class="amount">${money(x.amount_usd)}</span>
        <span>${ordinal(x.place)} place · ${esc(x.competition?.title ?? '')}</span>
        <span class="muted">${date(x.paid_at)}</span>
      </li>`,
    )
    .join('');
  return `<h2>Prizes</h2><ul class="list payouts">${rows}</ul>`;
}

function entries(p) {
  const list = p.solutions ?? [];
  if (!list.length) return '<h2>Entries</h2><p>No entries yet.</p>';
  const rows = list
    .map(
      (s) => `
      <li>
        <a href="#/bounty/${encodeURIComponent(s.competition?.slug ?? '')}">${esc(s.title)}</a>
        <span class="muted">${esc(s.competition?.title ?? '')} · ${date(s.entered_at)}${s.prize_usd != null && Number(s.prize_usd) > 0 ? ` · won ${money(s.prize_usd)}` : s.placement != null ? ` · ${ordinal(s.placement)} place` : ''}</span>
      </li>`,
    )
    .join('');
  return `<h2>Entries (${list.length})</h2><ul class="list entries">${rows}</ul>`;
}
