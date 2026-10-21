// In-game change log. Newest entry on TOP. Every commit adds an entry
// with a unique, descriptive id.
export interface ChangeEntry { id: string; date: string; title: string; notes: string[] }

export const CHANGELOG: ChangeEntry[] = [
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
