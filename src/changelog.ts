// In-game change log. Newest entry on TOP. Every commit adds an entry
// with a unique, descriptive id.
export interface ChangeEntry { id: string; date: string; title: string; notes: string[] }

export const CHANGELOG: ChangeEntry[] = [
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
