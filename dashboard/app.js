'use strict';

const data = window.RADAR;
const byId = (id) => document.getElementById(id);
const category = (row) => row.category ?? 'Uncategorized';
const format = new Intl.NumberFormat('en-US');
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 });
const money = (n) => n == null ? '—' : '$' + compact.format(n);
const exact = (n) => '$' + format.format(n);
const multiple = (n, precision = 3) => n == null ? '—' : n.toFixed(precision) + '×';
const percent = (n) => n == null ? '—' : (n > 0 ? '+' : '') + n.toFixed(2) + '%';
const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

const rows = data.rows;
const lookup = new Map(rows.map((row) => [row.slug, row]));
const state = { scope: 'all', sort: 'rank', direction: 1, page: 1 };
const pageSize = 8;
const tiers = [
  { label: 'Below ' + money(data.floor_usd), min: 0, max: data.floor_usd },
  { label: money(data.floor_usd) + ' to $100M', min: data.floor_usd, max: 100e6 },
  { label: '$100M to $250M', min: 100e6, max: 250e6 },
  { label: '$250M and above', min: 250e6, max: Infinity },
];
const columns = [
  { key: 'rank', title: 'Rank', read: (r) => r.rank },
  { key: 'name', title: 'Protocol', read: (r) => r.name },
  { key: 'category', title: 'Category', read: category },
  { key: 'chains', title: 'Chains', read: (r) => r.chains.length },
  { key: 'tvl', title: 'TVL', read: (r) => r.tvl_usd, numeric: true },
  { key: 'growth', title: '7d TVL', read: (r) => r.change_7d, numeric: true },
  { key: 'value', title: 'Implied value', read: (r) => r.implied_value_usd, numeric: true },
  { key: 'multiple', title: 'Value / TVL', read: (r) => r.implied_value_usd / r.tvl_usd, numeric: true },
];

function mount() {
  byId('date').textContent = data.as_of;
  byId('floor').textContent = money(data.floor_usd);
  byId('all-count').textContent = rows.length;
  byId('watch-count').textContent = data.watchlist_size;
  byId('foot-watch').textContent = data.watchlist_size;
  byId('early-count').textContent = data.early_size;
  byId('overview').innerHTML = [
    ['Ranked', rows.length], ['Watchlist', data.watchlist_size],
    ['Early', data.early_size],
  ].map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('');
  for (const label of [...new Set(rows.map(category))].sort()) {
    byId('category').add(new Option(label, label));
  }
  tiers.forEach((tier, i) => byId('tier').add(new Option(tier.label, i)));
  byId('min-peers').textContent = data.peers.min_peers;
  byId('global').textContent = multiple(data.peers.global);
  byId('sample').textContent = data.peers.sample;
  byId('peers').innerHTML = data.peers.categories.map((peer) => `<tr>
    <td>${escape(peer.category)}</td><td>${peer.sample}</td><td>${multiple(peer.median)}</td>
    <td class="value">${multiple(peer.multiple)}</td><td>${peer.fallback ? 'Global median' : 'Category median'}</td>
  </tr>`).join('');
  byId('live-count').textContent = data.live_size;
  byId('live-rows').innerHTML = data.live.map((row) => `<tr>
    <td><strong>${escape(row.name)}</strong></td><td>${escape(category(row))}</td>
    <td class="num">${money(row.tvl_usd)}</td><td class="num">${money(row.mcap_usd)}</td>
    <td class="num">${multiple(row.mcap_usd > 0 ? row.mcap_usd / row.tvl_usd : null)}</td>
  </tr>`).join('');
  byId('columns').innerHTML = columns.map((col) => `<th scope="col" class="${col.numeric ? 'num' : ''}">
    <button type="button" data-sort="${col.key}">${col.title}<span aria-hidden="true" class="sort-icon"></span></button>
  </th>`).join('');
}

function matches(row, query, selectedCategory, tier) {
  if (state.scope === 'watch' && !row.on_watchlist) return false;
  if (state.scope === 'early' && row.tvl_usd >= data.floor_usd) return false;
  if (selectedCategory && category(row) !== selectedCategory) return false;
  if (tier && (row.tvl_usd < tier.min || row.tvl_usd >= tier.max)) return false;
  return [row.name, row.slug, category(row), ...row.chains].join(' ').toLowerCase().includes(query);
}

function compareRows(read, a, b) {
  const x = read(a);
  const y = read(b);
  if (x == null || y == null) return x == null && y == null ? a.rank - b.rank : x == null ? 1 : -1;
  const comparison = typeof x === 'string' ? x.localeCompare(y, 'en') : x - y;
  return comparison * state.direction || a.rank - b.rank;
}

function boardRow(row) {
  const marker = row.on_watchlist ? '<span class="chip watch">WATCHLIST</span>'
    : row.tvl_usd < data.floor_usd ? '<span class="chip">EARLY</span>' : '';
  const extra = row.chains.length > 1 ? `<b>+${row.chains.length - 1}</b>` : '';
  return `<tr data-slug="${escape(row.slug)}">
    <td class="rank">${String(row.rank).padStart(2, '0')}</td>
    <td class="name-cell"><button type="button">${escape(row.name)}</button>${marker}</td>
    <td>${escape(category(row))}</td>
    <td class="chain" title="${escape(row.chains.join(', '))}">${escape(row.chains[0] ?? '—')}${extra}</td>
    <td class="num" title="${exact(row.tvl_usd)}">${money(row.tvl_usd)}</td>
    <td class="num ${row.change_7d > 0 ? 'up' : row.change_7d < 0 ? 'down' : 'muted'}">${percent(row.change_7d)}</td>
    <td class="num value" title="${exact(row.implied_value_usd)}">${money(row.implied_value_usd)}</td>
    <td class="num">${multiple(row.implied_value_usd / row.tvl_usd)}</td>
  </tr>`;
}

function renderBoard() {
  const query = byId('query').value.trim().toLowerCase();
  const tier = tiers[byId('tier').value];
  const column = columns.find((col) => col.key === state.sort);
  const filtered = rows.filter((row) => matches(row, query, byId('category').value, tier))
    .sort((a, b) => compareRows(column.read, a, b));
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  state.page = Math.min(state.page, pages);
  const start = (state.page - 1) * pageSize;
  const shown = filtered.slice(start, start + pageSize);
  byId('rows').innerHTML = shown.length ? shown.map(boardRow).join('') :
    '<tr><td colspan="8">No matching protocols. Try clearing a filter.</td></tr>';
  for (const button of document.querySelectorAll('[data-sort]')) {
    const active = button.dataset.sort === state.sort;
    const th = button.closest('th');
    if (active) th.setAttribute('aria-sort', state.direction === 1 ? 'ascending' : 'descending');
    else th.removeAttribute('aria-sort');
    button.querySelector('.sort-icon').textContent = active ? (state.direction === 1 ? '↑' : '↓') : '↕';
  }
  for (const button of document.querySelectorAll('[data-scope]')) {
    button.setAttribute('aria-pressed', String(button.dataset.scope === state.scope));
  }
  byId('results').textContent = shown.length ? `${start + 1}–${start + shown.length} of ${filtered.length} protocols` : '0 protocols';
  byId('page').textContent = `${state.page} / ${pages}`;
  byId('prev').disabled = state.page === 1;
  byId('next').disabled = state.page === pages;
}

function factor(label, value, description = '') {
  return `<div class="factor"><dt>${label}</dt><dd>${value}</dd>${description ? `<small>${description}</small>` : ''}</div>`;
}

function showDetail(row) {
  const model = row.model;
  const peer = data.peers.categories.find((p) => p.category === category(row));
  const steps = row.farm_steps.map((step) => {
    const [action, cost, time] = step.split(' | ');
    return `<li>${escape(action)}<div class="step-meta"><span>${escape(cost)}</span><span>${escape(time)}</span></div></li>`;
  }).join('');
  byId('detail-content').innerHTML = `
    <header class="detail-head">
      <p class="eyebrow">RANK ${String(row.rank).padStart(2, '0')} / ${row.on_watchlist ? 'OFFICIAL WATCHLIST' : row.tvl_usd < data.floor_usd ? 'EARLY RADAR' : 'RADAR'} / NO TOKEN RECORDED</p>
      <h2 id="detail-title">${escape(row.name)}</h2>
      <p>${escape(category(row))} · ${escape(row.chains.join(' · ') || 'Network unreported')}</p>
      <button type="button" class="close" aria-label="Close details" autofocus>×</button>
    </header>
    <div class="detail-grid">
      <section class="breakdown">
        <h3>Implied launch value</h3><p class="total">${exact(row.implied_value_usd)}</p>
        <dl>
          ${factor('Snapshot TVL', exact(row.tvl_usd))}
          ${factor('Base multiple', multiple(model.base_multiple, 5), peer.fallback ? `Global median · ${data.peers.sample} peers · category n=${peer.sample}` : `Category median · ${peer.sample} qualifying peers`)}
          ${factor('Growth factor', multiple(model.growth_multiplier, 5), row.change_7d == null ? '7d TVL change unreported' : `7d TVL change ${percent(row.change_7d)} · model uses ${percent(model.growth_pct)}`)}
          ${factor('Maturity factor', multiple(model.maturity_multiplier, 5), row.age_days == null ? 'Listing date unreported' : `${format.format(row.age_days)} days tracked · listed ${escape(row.listed_at)}`)}
          ${factor('Implied value / TVL', multiple(row.implied_value_usd / row.tvl_usd))}
        </dl>
      </section>
      <section class="farm"><h3>Farm plan</h3><p>Pilot size, indicative costs and a review window. Check published eligibility.</p><ol>${steps}</ol></section>
    </div>`;
  byId('detail').showModal();
}

function showView() {
  const hash = location.hash.slice(1);
  const view = ['radar', 'model', 'live'].includes(hash) ? hash : 'radar';
  for (const id of ['radar', 'model', 'live']) byId(id).hidden = id !== view;
  for (const button of document.querySelectorAll('nav [data-view]')) {
    if (button.dataset.view === view) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  window.scrollTo(0, 0);
}

function restart() {
  state.page = 1;
  renderBoard();
}

document.addEventListener('click', (event) => {
  const view = event.target.closest('[data-view]');
  if (view) location.hash = view.dataset.view;
  const scope = event.target.closest('[data-scope]');
  if (scope) {
    state.scope = scope.dataset.scope;
    restart();
  }
  const sort = event.target.closest('[data-sort]');
  if (sort) {
    const key = sort.dataset.sort;
    state.direction = state.sort === key ? -state.direction : ['name', 'category', 'rank'].includes(key) ? 1 : -1;
    state.sort = key;
    restart();
  }
  const row = event.target.closest('[data-slug]');
  if (row) showDetail(lookup.get(row.dataset.slug));
  if (event.target.closest('.close') || event.target === byId('detail')) byId('detail').close();
});
byId('query').addEventListener('input', restart);
byId('category').addEventListener('change', restart);
byId('tier').addEventListener('change', restart);
byId('prev').addEventListener('click', () => { state.page--; renderBoard(); });
byId('next').addEventListener('click', () => { state.page++; renderBoard(); });
byId('reset').addEventListener('click', () => {
  byId('query').value = byId('category').value = byId('tier').value = '';
  state.scope = 'all';
  restart();
});
window.addEventListener('hashchange', showView);

mount();
renderBoard();
showView();
