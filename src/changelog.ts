// In-game change log. Newest entry on TOP. Every commit adds an entry
// with a unique, descriptive id.
export interface ChangeEntry { id: string; date: string; title: string; notes: string[] }

export const CHANGELOG: ChangeEntry[] = [
  {
    id: 'fix-2d-bubble-tap',
    date: '2026-10-21',
    title: 'Collect bubbles tap reliably in 2D',
    notes: ['Tapping a collect bubble near the edge of the 2D map could slide it out from under your finger, so nothing was collected. Bubbles now stay put when you tap them, in both views.'],
  },
  {
    id: 'detailed-2d-campus',
    date: '2026-10-21',
    title: 'A more detailed 2D view',
    notes: ['The 2D map now draws every building type in the same detail as the 3D view: framed windows, cornices, rooftop air units, vents and pipes, loading docks, name signs, striped awnings and soft shadows.', 'Each type has its own props: crop rows, tanks and silos, cranes, pumpjacks, solar panels, animals, a car lot with cars, conveyor belts and more. Buildings gain floors, wings and rooftop gear as they level up.', 'Plots have sidewalks, planters and street lamps. At night buildings darken and their windows light up.', 'Busy buildings show smoke, shoppers, coin sparkles and sparks in 2D too, along with the same progress rings, status chips and easy-to-tap collect bubbles.', 'If your device is set to reduce motion, these animations are turned off.'],
  },
  {
    id: 'activity-animations-busy-states',
    date: '2026-10-21',
    title: 'Busy buildings come alive',
    notes: ['Every building now shows what it is doing. Producing: a progress ring with the product icon, a green Producing chip, a pulsing ground ring and a gentle working motion, plus smoke, turning blades and nodding pumpjacks. Mills throw sparks.', 'Selling: a gold ring with a coin and a ka-ching pulse, shoppers walking in and out, and coin sparkles above the shop. Idle buildings stay calm with a sleepy zZ. A finished job pops a small celebration.', 'The building panel has a colored status chip (Producing, Selling, Idle, Done), a shimmering progress bar and live counters for output and revenue.', 'Collect bubbles now have a larger tap area that stays still while the bubble bobs, so taps land reliably.', 'If your device is set to reduce motion, these animations are turned off.'],
  },
  {
    id: 'collect-bubbles-partial-collection',
    date: '2026-10-21',
    title: 'Tap to collect',
    notes: ['Production and shop sales now build up as the job runs. Every 2 real minutes a bubble pops up over the building with the goods icon (or a coin) and how much is ready. Tap it to collect: goods go to your warehouse at the job quality and money goes to your cash, with a fly-to-counter animation.', 'Bubbles keep counting up until you tap them. Anything left over is paid automatically when the job ends, including progress made while you were away.', 'The building panel shows job progress with Collect and Stop buttons. Stopping keeps everything made or sold so far and puts unsold shop goods back in the warehouse.', 'Partial collections always add up to exactly the full job (whole units, money to the cent). Wages and inputs are unchanged.'],
  },
  {
    id: 'qty-picker-fine-grained-amounts',
    date: '2026-10-21',
    title: 'Pick exact amounts',
    notes: ['Every amount (production, shop sales, exchange buy, list and quick sell, the trade floor, government deliveries, bond lots) now uses one picker: type a number, drag the slider, or tap the -/+ buttons (hold to repeat, Shift for x10). Quick buttons: 1, 10, 100, 25%, 50% and Max.', 'Any whole number from 1 up to the most you can do right now, with the reason for the limit (inputs, stock, cash for wages, crates, trader demand).', 'Production now asks for an amount rather than a time, and shows a live preview of time, wages per unit and the inputs needed.', 'The shortest possible job is 6 game minutes, so tiny jobs still take time and pay wages. Fractional and zero amounts are refused everywhere, including on the server.'],
  },
  {
    id: 'iso-pass-high-detail-models-account-delete',
    date: '2026-10-21',
    title: 'Isometric campus with detailed buildings',
    notes: ['The campus is now a crisp 2.5D isometric view: drag to pan, scroll or pinch to zoom, and turn it in 90-degree steps with the arrow buttons or Q / E.', 'Every one of the 40 building types has a new, highly detailed model: framed windows with mullions and sills, cornices and parapets, entrances with steps, loading docks with roll-up doors, rooftop air units, vents, ladders, catwalks, riveted tanks, chimneys, fences, pallets and readable signs.', 'Type-specific scenes: orchard rows, crop fields and a greenhouse, animal pens and beehives, pumpjacks, gas derricks, distillation columns, cranes, conveyors, test tracks and a car lot full of cars.', 'Buildings grow with level: more floors, side wings and rooftop gear.', 'Brick, concrete, metal and wood surfaces, plus glass that reflects. Every plot gets sidewalks, planters and a street lamp.', 'Owners can delete their own trading account from the Trade floor.'],
  },
  {
    id: 'stage12-111-goods-seasons-realm',
    date: '2026-10-21',
    title: '111 goods and the Seasons realm',
    notes: ['64 new goods (111 in total): plantation crops, sweets, dairy, deli food, fashion, gas and plastics, solar panels, bricks and furniture, laptops, drones, game consoles, e-bikes, city cars and delivery vans.', '17 new buildings and 2 new stores: the Home store and the Car lot.', 'Metal bars now sell for $11, so smelting turns a profit.', 'New Seasons realm, picked from the header. Everyone shares 28-day seasons with spring, summer, autumn and winter phases that change farm speed and what sells. When a season ends you see your final value and start fresh.', 'Each realm keeps its own save, both locally and in the cloud.'],
  },
  {
    id: 'stage11-accounts-p2p-trading',
    date: '2026-10-21',
    title: 'Trade with other players',
    notes: ['New Trade floor tab. Create an account with a username; the server gives you a secret key you can use to sign in on other devices.', 'A trading wallet and depot are kept on the server. Move cash and goods in from your company and take them back home at any time.', 'A shared player board: list goods from your depot, and buy from other players (sellers pay a 3% fee).', 'Contracts: offer goods to a named player at your price. They can accept or decline, and you can withdraw the offer.', 'A company rating (AAA to C) from company value and trading, plus a leaderboard.'],
  },
  {
    id: 'gfx2-3d-campus-premium-ui',
    date: '2026-10-21',
    title: 'A real 3D campus',
    notes: ['The campus is now a live 3D scene: soft shadows, a sky that follows the sun and moon, glowing windows and street lamps at night, hills, trees and a pond.', 'Every building has its own model that grows with its level, with smoke from the chimneys and trucks and workers on the roads.', 'Drag to orbit, scroll or pinch to zoom, right-drag to pan, and click a plot to select it.', 'A 2D view button switches back to the flat map, and older devices use it automatically.', 'New font, glass panels, an animated cash counter and optional sounds (muted by default).'],
  },
  {
    id: 'polish-rough-edges-after-stage10',
    date: '2026-10-21',
    title: 'Polish',
    notes: ['Zero amounts show as $0.', 'Exchange charts start with two weeks of price history.', 'The page background now reaches the bottom of long tabs.', 'Executive salaries are lower, so a first hire is affordable.'],
  },
  {
    id: 'stage10-bonds-gov-abundance',
    date: '2026-10-21',
    title: 'Bonds, government orders and running-out mines',
    notes: ['Oil wells and gravel pits roll an abundance per good (15-100%) that sets their speed and slowly runs out. Scrap and rebuild to roll again.', 'Bonds from level 8: borrow in $5,000 lots at a daily rate your credit rating allows, or buy bonds from NPC firms for interest (they can default). Repay after 14 days.', 'Government orders from level 14: weekly big orders with a 10% deposit, minimum quality, paid deliveries and a 6-day deadline.', 'New Finance tab.'],
  },
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
