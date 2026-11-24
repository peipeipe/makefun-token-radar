# Token Radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![Rank](https://make.fun/badge/token-radar-01/peipeipe/makefun-token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard)
[![Reward](https://make.fun/badge/token-radar-01/peipeipe/makefun-token-radar/reward.svg)](https://make.fun/bounty/token-radar-01)

Token Radar ranks protocols with no recorded token in the sealed DefiLlama snapshot. Each row includes a valuation breakdown and a five-step farm plan. The dashboard runs offline and includes the underlying peer multiples and a separate tokenized-protocol view.

## Run locally

With Node.js 22.18 or later, pass the competition kit’s snapshot directory and a fresh output directory.

```sh
node main.ts --input /path/to/token-radar-01-kit/input --output /tmp/token-radar-output
```

Open `/tmp/token-radar-output/dashboard/index.html` in a browser. The same run produces `board.json` and the judge’s `dossier.json`.
