import { farmSteps } from './farm.ts';

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

const MIN_PEERS = 5;
const EXCLUDED = new Set([
  'Bridge', 'Canonical Bridge', 'Cross Chain Bridge', 'Liquid Staking',
  'Liquid Restaking', 'Restaked BTC', 'Anchor BTC', 'Stablecoin Wrapper', 'CEX',
]);

function recordsNoToken(protocol: SnapshotProtocol): boolean {
  return protocol.gecko_id === null && protocol.symbol === null;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return (sorted[Math.floor((sorted.length - 1) / 2)]! + sorted[Math.floor(sorted.length / 2)]!) / 2;
}

function peerMultiples(protocols: SnapshotProtocol[]) {
  const groups = new Map<string, number[]>();
  const ratios: number[] = [];
  for (const protocol of protocols) {
    const { mcap_usd, tvl_usd } = protocol;
    if (recordsNoToken(protocol) || mcap_usd === null || mcap_usd <= 0 || tvl_usd <= 0) continue;
    const ratio = mcap_usd / tvl_usd;
    const category = protocol.category ?? 'Uncategorized';
    const group = groups.get(category) ?? [];
    group.push(ratio);
    groups.set(category, group);
    ratios.push(ratio);
  }
  const global = median(ratios);
  if (global === null) throw new SnapshotError('snapshot has no positive market-cap/TVL peers');
  const categories = [...new Set(protocols.map((p) => p.category ?? 'Uncategorized'))].sort();
  return {
    global,
    sample: ratios.length,
    min_peers: MIN_PEERS,
    categories: categories.map((category) => {
      const group = groups.get(category) ?? [];
      const observed = median(group);
      const fallback = group.length < MIN_PEERS;
      return { category, sample: group.length, median: observed, fallback, multiple: fallback ? global : observed! };
    }),
  };
}

function isRankable(protocol: SnapshotProtocol, tokenPrefixes: Set<string>): boolean {
  if (!recordsNoToken(protocol) || EXCLUDED.has(protocol.category ?? '')) return false;
  if (/\b(?:wrapped|staked|staking)\b|\s(?:v\d+(?:\.\d+)*|\d+(?:\.\d+)+)$/i.test(protocol.name)) return false;
  if (/^(?:Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i.test(protocol.name)) return false;
  // Product slugs inherit a tokenized parent prefix. The sealed watchlist independently
  // encodes parent checks for its members. Below that floor parent metadata is unavailable.
  return ![...tokenPrefixes].some((prefix) => protocol.slug.startsWith(prefix + '-'));
}

function score(protocol: SnapshotProtocol, asOf: string, baseMultiple: number) {
  const listed = protocol.listed_at === null ? NaN : Date.parse(protocol.listed_at + 'T00:00:00Z');
  const days = (Date.parse(asOf + 'T00:00:00Z') - listed) / 86_400_000;
  const age = Number.isFinite(days) ? Math.max(0, Math.floor(days)) : null;
  // Seven-day TVL change is in percentage points. Cap at ±50, then add
  // 0.005 per point to 1.0 (0.75–1.25×). Missing change gives 1.0×.
  const growth = Math.max(-50, Math.min(50, protocol.change_7d ?? 0));
  const growthMultiplier = 1 + growth / 200;
  // Tracking age as of the snapshot adds a linear premium to 1.0×,
  // capped at +20% after 1,095 days. Missing listing date gives 1.0×.
  const maturityMultiplier = 1 + 0.20 * Math.min(age ?? 0, 1095) / 1095;
  return {
    age_days: age,
    implied_value_usd: Math.max(1, Math.round(protocol.tvl_usd * baseMultiple * growthMultiplier * maturityMultiplier)),
    model: {
      base_multiple: baseMultiple,
      growth_pct: growth,
      growth_multiplier: growthMultiplier,
      maturity_multiplier: maturityMultiplier,
    },
  };
}

export function buildRadar(snapshot: Snapshot) {
  const peers = peerMultiples(snapshot.protocols);
  const multiples = new Map(peers.categories.map((p) => [p.category, p.multiple]));
  const watchlist = new Set(snapshot.watchlist);
  const live = snapshot.protocols.filter((p) => !recordsNoToken(p))
    .sort((a, b) => (b.mcap_usd ?? -1) - (a.mcap_usd ?? -1) || b.tvl_usd - a.tvl_usd);
  const tokenPrefixes = new Set(live.map((p) => p.slug));
  for (const { slug, symbol } of live) {
    // Some families only list product slugs, e.g. a chain deployment. Use a
    // matching ticker and slug prefix as evidence that the family has a token.
    const ticker = symbol?.toLowerCase();
    if (ticker && ticker.length >= 3 && slug.startsWith(ticker + '-')) tokenPrefixes.add(ticker);
  }
  const board = snapshot.protocols
    .filter((p) => watchlist.has(p.slug) || isRankable(p, tokenPrefixes))
    .map((p) => ({
      ...p,
      on_watchlist: watchlist.has(p.slug),
      ...score(p, snapshot.as_of, multiples.get(p.category ?? 'Uncategorized')!),
      farm_steps: farmSteps(p, snapshot.floor_usd),
    }))
    .sort((a, b) => b.implied_value_usd - a.implied_value_usd || (a.slug < b.slug ? -1 : 1))
    .map((p, i) => ({ rank: i + 1, ...p }));
  const radar = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    early_size: board.filter((p) => p.tvl_usd < snapshot.floor_usd).length,
    watchlist_size: watchlist.size,
    live_size: live.length,
    peers,
    rows: board,
    live,
  };
  return { board, radar };
}

type BoardRow = ReturnType<typeof buildRadar>['board'][number];
type RadarData = ReturnType<typeof buildRadar>['radar'];

class SnapshotError extends Error {}
/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `board has ${board.length} rows`;
  const knownSlugs = new Set(snapshot.protocols.map((p) => p.slug));
  const slugs = new Set(board.map((r) => r.slug));
  if (slugs.size !== board.length) return 'board has duplicate slugs';
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    if (!knownSlugs.has(r.slug) || !/^\S{1,128}$/.test(r.slug) || !r.name.trim()) return `invalid protocol row ${r.rank}`;
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.trim().length < 20 || s.trim().length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 100_000_000_000_000) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
