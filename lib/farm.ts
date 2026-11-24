import type { SnapshotProtocol } from './model.ts';

type Route = { setup: string; enter: string; monitor: string; exit: string };

function route(category: string, size: string): Route {
  switch (category) {
    case 'Risk Curators':
    case 'Onchain Capital Allocator':
      return {
        setup: 'Find a vault managed by the named curator in its host app. Check underlying collateral, allocation caps, fees and immediately redeemable liquidity.',
        enter: `Supply ${size} of the vault’s quoted underlying asset to an open public vault. Save the receipt-share balance and initial share price.`,
        monitor: 'Compare share price and available withdrawal liquidity weekly. Check for new allocations or a curator change before adding exposure.',
        exit: 'Redeem a small fraction of shares first. If redemptions queue, record the queue position before scheduling the rest.',
      };
    case 'Lending':
    case 'Uncollateralized Lending':
      return {
        setup: 'Open the supply market and inspect collateral rules, borrower concentration, market caps and available cash.',
        enter: `Supply ${size} in an enabled stablecoin market and record the receipt balance. Leave borrowing disabled for this pilot.`,
        monitor: 'Check utilization and bad-debt disclosures weekly. Bring the exit forward if available cash falls below your intended withdrawal.',
        exit: 'Withdraw a small portion of the supplied asset, then close the position once the withdrawal settles.',
      };
    case 'Dexs':
    case 'Liquidity Manager':
      return {
        setup: 'Check the pool’s token contracts and compare trading depth, fee tier and recent volume against liquidity. Use a pair you are willing to hold individually.',
        enter: `Allocate ${size} total to one pool. For a two-sided pool, acquire both assets in the quoted ratio and choose full range if available.`,
        monitor: 'Check the position weekly for range drift and compare fees earned with the change in value versus holding both assets outright.',
        exit: 'Remove liquidity and collect fees. Review swap slippage before converting the returned assets.',
      };
    case 'Derivatives':
    case 'Interest Rate Derivatives':
    case 'Options Vault':
      return {
        setup: 'Check regional access, collateral rules, funding or premium, and the fee to close. Use the venue’s demo if available.',
        enter: `Set a trial ceiling of ${size} for collateral. Use isolated margin near 1× exposure where supported, or cap maximum loss at entry for options.`,
        monitor: 'Review margin and funding daily while exposed. Keep a reduce-only exit ready where the venue supports it.',
        exit: 'Close the position and withdraw unused collateral. Check that the venue shows zero open exposure.',
      };
    case 'Prediction Market':
      return {
        setup: 'Confirm access in your jurisdiction and read one liquid market’s resolution rules, deadline and dispute process.',
        enter: `Set aside ${size} as a ceiling and place a single $5–$15 limit order using the market’s listed settlement asset.`,
        monitor: 'Check the spread and resolution status weekly. Keep open orders within the initial maximum loss.',
        exit: 'Cancel unfilled orders and sell the filled position into available depth or redeem after settlement.',
      };
    case 'CDP':
    case 'CDP Manager':
    case 'Dual-Token Stablecoin':
      return {
        setup: 'Check supported collateral, minimum debt, stability fee and liquidation ratio. Stop at a quote if the minimum exceeds your budget.',
        enter: `Test with ${size} of supported collateral where allowed. If minting debt, target a collateral ratio at least 1.5× the liquidation threshold and retain the borrowed asset for repayment.`,
        monitor: 'Track the peg, collateral ratio and accrued fees daily while debt is open. Repay early if the safety buffer narrows.',
        exit: 'Repay principal and accrued fees, then withdraw the unlocked collateral and verify the position is closed.',
      };
    case 'RWA':
    case 'Basis Trading':
    case 'CeDeFi':
      return {
        setup: 'Read the product’s eligibility, issuer or custodian, minimum subscription and redemption calendar. Use a quote only if access or liquidity terms are unclear.',
        enter: `Subscribe with ${size} of the accepted asset only if the public minimum fits. Record the units received, issue price and next available redemption date.`,
        monitor: 'Check the latest reported NAV, price or backing weekly. Review changes to redemption terms and counterparty exposure.',
        exit: 'Submit a test redemption at the next window and reconcile the cash received with the quoted NAV.',
      };
    case 'Restaking':
    case 'Staking Pool':
    case 'Collateral Markets':
    case 'Insurance':
      return {
        setup: 'Review the public staking, collateral or coverage terms. Identify the operator or insured event, slashing or loss conditions, and the exit date.',
        enter: `Allocate up to ${size} only to an eligible native staking pool, a supported collateral vault or a cover quote within budget. Record the lockup or coverage expiry.`,
        monitor: 'Review operator status, accrued rewards or coverage status weekly. Keep the receipt or policy ID available for withdrawal or claims.',
        exit: 'Request unstaking or collateral withdrawal after the lockup, or record policy expiry and the deadline for claims.',
      };
    case 'Chain':
    case 'Payments':
    case 'Governance Incentives':
    case 'Crypto Card Issuer':
      return {
        setup: 'Check the documented wallet, supported asset and public user route. For an infrastructure-only listing, identify a supported app on the network first.',
        enter: `Keep ${size} as the wallet ceiling and test one $5–$15 native transfer, supported payment or eligible incentive deposit. Save the confirmation.`,
        monitor: 'Check receipts and any published incentive terms weekly. Keep unused funds in your wallet while assessing repeat use.',
        exit: 'Withdraw any incentive position or move the unused balance to your own wallet. Reconcile network and routing fees.',
      };
    case 'Yield':
    case 'Farm':
    case 'Yield Aggregator':
    case 'Stablecoin Wrapper':
    case 'Leveraged Farming':
      return {
        setup: 'Find a public vault or tranche and inspect its underlying strategy, redemption delay and allowance target. Start with an unlevered option if available.',
        enter: `Deposit ${size} of the selected vault’s quoted underlying or use a quote if minimums are higher. Record assets in and share units out.`,
        monitor: 'Record the weekly share price and redemption quote. Recheck any strategy migration or change in withdrawal conditions.',
        exit: 'Redeem a small portion first, allowing for the documented withdrawal queue, then settle the rest.',
      };
    default:
      return {
        setup: 'Identify the documented public product and confirm asset contracts, wallet support, access rules and fee schedule before connecting.',
        enter: `Quote the smallest supported mint, purchase or deposit within ${size}. Send a test transaction only if the quoted fees and withdrawal route are clear.`,
        monitor: 'Use the wallet receipt to check position status and quote an exit weekly. Continue with read-only checks when a public route is unavailable.',
        exit: 'Reverse the test through the documented redemption or withdrawal route. Confirm settlement in the wallet.',
      };
  }
}

function executionChain(chains: string[]): string | undefined {
  // Prefer a named low-cost network over Ethereum when the snapshot lists both.
  const lowerCost = new Set(['Base', 'Arbitrum', 'Optimism', 'Polygon', 'Ink', 'Solana']);
  return chains.find((chain) => lowerCost.has(chain)) ?? chains[0];
}

export function farmSteps(protocol: SnapshotProtocol, floor: number): string[] {
  const { name, category, chains, tvl_usd } = protocol;
  const chain = executionChain(chains);
  const location = chain ?? 'a network named in its public docs';
  const capital = tvl_usd >= 250_000_000 ? '$100–$250' : tvl_usd >= floor ? '$50–$150' : '$25–$75';
  const horizon = tvl_usd >= 250_000_000 ? 28 : tvl_usd >= floor ? 21 : 14;
  const fees = chain === 'Ethereum' ? '$5–$25 gas' : chain === 'Bitcoin' ? '$1–$15 network fees' : '$0.10–$5 network fees';
  const plan = route(category ?? '', capital);
  const networks = chains.length > 1 ? `Compare the ${chains.length} listed deployments and start on ${location} if the route is open there.` : `Check the public route on ${location}.`;
  return [
    `Open the official ${name} app or docs. ${networks} ${plan.setup} | Cost: $0 | Time: 10–15 min`,
    `Fund the wallet on ${location} with the quoted input asset and fee currency. If a transfer is needed, quote the route first and send a small test. | Cost: ${fees} plus any quoted transfer charge | Time: 5–20 min`,
    `${plan.enter} | Cost: up to ${capital} capital plus ${fees} and quoted product fees | Time: 10–20 min`,
    `${plan.monitor} Log transaction IDs and check published points terms. | Cost: $0 to review | Time: about 5 min per check over ${horizon} days`,
    `${plan.exit} | Cost: ${fees} plus quoted exit fees | Time: 10–20 min hands-on plus settlement or cooldown`,
  ];
}
