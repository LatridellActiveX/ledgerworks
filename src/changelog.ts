// In-game change log. Newest entry on TOP. Every commit adds an entry
// with a unique, descriptive id.
export interface ChangeEntry { id: string; date: string; title: string; notes: string[] }

export const CHANGELOG: ChangeEntry[] = [
  {
    id: 'stage9-executives-achievements',
    date: '2026-10-21',
    title: 'The board and your goals',
    notes: ['Executives from level 12: Operations (cuts overhead), Finance (raises the tax-free cash line), Marketing (faster shops) and Technology (better patent odds) chiefs. Each seat also gets a quarter of the matching skill from the rest of the board.', 'New candidates every week; signing bonus, daily salary and training.', '11 tiered achievements with cash rewards, shown on the new Board & goals tab.'],
  },
  {
    id: 'gfx-overhaul-iso-campus',
    date: '2026-10-21',
    title: 'A whole new look',
    notes: ['Isometric campus: every building type has its own model (windmill, water tower, orchard, barn, pumpjack, quarry, refinery tanks, research dome, factories, shops) and grows with its level.', 'Live details: smoke, spinning blades, nodding pumpjacks, conveyor belts, trucks on the ring road, and a sky that follows day, dusk and night with lit windows.', 'Hand-drawn icons for every good, price charts on the Exchange, progress rings and level badges, smoother buttons, cards and toasts.'],
  },
  {
    id: 'fix-autosave-interval',
    date: '2026-10-21',
    title: 'Autosave fixed',
    notes: ['The 5-second autosave now really runs. Before, only your own actions saved the game.'],
  },
  {
    id: 'stage8-research-patents-quality',
    date: '2026-10-21',
    title: 'Research labs and patents',
    notes: ['New Research lab (level 6) makes notes in six fields: farm, kitchen, textile, energy, builder and tech.', 'Spend notes on a product: each has a 1-in-7 chance to become a patent. Patents unlock Q1 to Q12 (10, 50, 450, 2,050 ... patents).', 'You now make the best researched quality, capped at your lowest-quality input + 1. The old quality-by-level cap is gone.', 'wrangler.toml now carries the D1, Durable Object and cron settings.'],
  },
  {
    id: 'stage7-overhead-accounting-phases',
    date: '2026-10-21',
    title: 'Overhead, accounting and the business cycle',
    notes: ['Admin overhead: every wage bill rises 0.55% per building level beyond the first.', 'Accounting fee: cash above $2.5M is charged daily, 0.4% per extra $2.5M (max 2.4%).', 'Economy phases (Recession, Steady, Boom) can shift one step each game week, shared by everyone online. Booms sell faster in shops but slow factories, recessions the reverse, and fancier industries swing more.'],
  },
  {
    id: 'stage6-cloud-world-server',
    date: '2026-10-21',
    title: 'Shared world server',
    notes: ['Exchange prices now come from one shared server market, stepped every 15 minutes, and everyone who sells moves them.', 'Cloud save and load, with a cloud key to carry your company to another device.', 'Online/offline badge; the game still runs fully offline.'],
  },
  {
    id: 'stage5-exchange-order-book',
    date: '2026-10-21',
    title: 'The Exchange opens',
    notes: ['Order book per good: cheapest first, then higher quality, then oldest.', 'Trader NPCs sell every good and buy your listings each hour; prices drift daily and dip if you flood a market.', 'Selling needs shipping crates (new good, made at the Crate yard). 3% fee on sales; cancelling within 48 h costs the fee; orders expire after 7 days.', 'Quick sell to traders at the bid price, limited per day. The wholesaler is gone.'],
  },
  {
    id: 'fix-price-cents-display',
    date: '2026-10-21',
    title: 'Prices show cents',
    notes: ['Prices under $10,000 now show cents ($2.40 instead of $2).'],
  },
  {
    id: 'mvp-plot-grid-layout-fix',
    date: '2026-10-21',
    title: 'Tidier plot grid',
    notes: ['Plots no longer spill over the tabs; only one row of locked plots is shown.'],
  },
  {
    id: 'stage4-retail-saturation-mvp',
    date: '2026-10-21',
    title: 'Shops open: sell to the public',
    notes: ['Shops sell your goods; price and quality set how fast they sell.', 'Each game day, markets you flood sell slower and quiet ones recover.', 'Public demand tab, XP from work and sales, quality cap grows with level.'],
  },
  {
    id: 'stage3-company-build-produce',
    date: '2026-10-21',
    title: 'Run your own company',
    notes: ['24 plots, unlocking with company level.', 'Build, upgrade and scrap buildings (full refund up to level 2).', 'Timed production that pays wages up front; output quality follows inputs.', 'A wholesaler sells starter goods. The game saves in your browser and keeps running while you are away.'],
  },
  {
    id: 'stage2-static-game-data',
    date: '2026-10-21',
    title: 'Goods, recipes and buildings',
    notes: ['40 goods across food, clothing, energy, construction and gadgets.', '19 building types: 14 production, 5 shops.'],
  },
  {
    id: 'stage1-setup-hello',
    date: '2026-10-21',
    title: 'Ledgerworks is born',
    notes: ['Project skeleton with Vite, React and TypeScript.', 'Single-file build served by a Cloudflare Worker.'],
  },
]
