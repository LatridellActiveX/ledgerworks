// ============================================================================
// Stage 12 goods expansion: 64 more goods (111 in total), 17 more buildings
// and 2 more store types. All names and numbers are original.
//
// Each line is compact: [id, name, color, basePrice, glyph, research field,
// perHour, inputs, store?, dailyDemand?]. The glyph picks one of the crafted
// icons in src/ui/icons.tsx; the field picks which research notes improve it.
// data.ts merges these lists into RESOURCES / RECIPES / BUILDINGS.
// ============================================================================
import type { Resource, Recipe, BuildingType, StoreId } from './data'

type Field = 'farm' | 'food' | 'textile' | 'energy' | 'build' | 'tech'
type Row = [string, string, string, number, string, Field, number, Record<string, number>, StoreId?, number?]

const ROWS: Row[] = [
  // --- Plantation crops (farm) ---
  ['cane', 'Sugar cane', '#b7d98b', 0.9, 'grain', 'farm', 140, { seeds: 1, water: 2 }],
  ['cocoa', 'Cocoa pods', '#8a5a3c', 2.6, 'seed', 'farm', 50, { seeds: 1, water: 3 }],
  ['beans', 'Coffee cherries', '#a8433a', 2.8, 'berry', 'farm', 50, { seeds: 1, water: 3 }],
  ['grapes', 'Grapes', '#7d4f9e', 1.9, 'berry', 'farm', 70, { seeds: 1, water: 2 }, 'market', 500],
  ['potatoes', 'Potatoes', '#c9a66b', 0.8, 'rock', 'farm', 160, { seeds: 1, water: 1 }, 'market', 1100],
  ['tomatoes', 'Tomatoes', '#e8574a', 1.3, 'fruit', 'farm', 100, { seeds: 1, water: 1.5 }, 'market', 800],
  ['rice', 'Paddy rice', '#efe8cf', 1.3, 'grain', 'farm', 150, { seeds: 1, water: 3 }],
  ['corn', 'Sweet corn', '#f4cf4a', 0.8, 'grain', 'farm', 150, { seeds: 1, water: 1.5 }, 'market', 900],
  ['wool', 'Fleece', '#efe9e0', 3.5, 'boll', 'farm', 20, { feed: 3, water: 1 }],
  ['honey', 'Wild honey', '#f2b134', 4.5, 'jar', 'farm', 25, { greens: 0.5, water: 0.2 }, 'market', 250],
  // --- Kitchen and confectionery (food) ---
  ['sugar', 'Cane sugar', '#f7f3ea', 2.0, 'sack', 'food', 90, { cane: 1.5, power: 0.5 }],
  ['choc', 'Chocolate bar', '#6b3e26', 9, 'tile', 'food', 30, { cocoa: 1.5, sugar: 0.5, milk: 0.5, power: 1 }, 'market', 400],
  ['roast', 'Roasted coffee', '#5a3a28', 11, 'sack', 'food', 30, { beans: 2, power: 1 }, 'market', 350],
  ['wine', 'Grape wine', '#7b2140', 14, 'bottle', 'food', 20, { grapes: 4, power: 1 }, 'market', 200],
  ['crisps', 'Potato crisps', '#f2c66d', 3.2, 'bag', 'food', 70, { potatoes: 2, power: 0.6 }, 'market', 700],
  ['sauce', 'Tomato sauce', '#c8392b', 4, 'jar', 'food', 60, { tomatoes: 2, sugar: 0.2, power: 0.5 }, 'market', 500],
  ['ricebowl', 'Rice bowl', '#f1e7c9', 6.5, 'cheese', 'food', 40, { rice: 1, greens: 0.5, eggs: 1, power: 0.6 }, 'market', 450],
  ['flakes', 'Corn flakes', '#f2d38a', 5, 'bag', 'food', 50, { corn: 2, sugar: 0.3, power: 0.8 }, 'market', 400],
  ['pie', 'Apple pie', '#d39a55', 13, 'loaf', 'food', 20, { flour: 1, apples: 2, butter: 0.3, sugar: 0.5, power: 1 }, 'market', 180],
  ['cake', 'Sponge cake', '#f6d7c4', 16, 'loaf', 'food', 15, { flour: 1, eggs: 3, sugar: 1, butter: 0.4, power: 1 }, 'market', 150],
  ['butter', 'Butter block', '#f6e08b', 5.5, 'cheese', 'food', 40, { milk: 3, power: 0.6 }, 'market', 400],
  ['yogurt', 'Yogurt cup', '#f4f1f7', 2.8, 'jar', 'food', 70, { milk: 1.2, berries: 0.2, power: 0.4 }, 'market', 700],
  ['icecream', 'Ice cream tub', '#f7c6d9', 8, 'jar', 'food', 30, { milk: 2, sugar: 0.6, power: 2 }, 'market', 300],
  ['sandwich', 'Deli sandwich', '#e6b880', 7, 'loaf', 'food', 40, { bread: 0.4, cheese: 0.1, greens: 0.5, tomatoes: 0.5 }, 'market', 500],
  ['pizza', 'Flatbread pizza', '#e48b4a', 12, 'cheese', 'food', 20, { flour: 1, sauce: 0.5, cheese: 0.3, power: 1.5 }, 'market', 280],
  ['soda', 'Fizzy soda', '#58c4c6', 2.4, 'bottle', 'food', 120, { water: 1, sugar: 0.4, power: 0.3 }, 'market', 1000],
  // --- Fashion (textile) ---
  ['yarn', 'Yarn', '#e3d3e8', 7, 'roll', 'textile', 40, { wool: 1.5, power: 0.5 }],
  ['sweater', 'Knit sweater', '#b26e8a', 55, 'jacket', 'textile', 8, { yarn: 3, power: 1 }, 'outfitter', 60],
  ['jeans', 'Denim jeans', '#3d5a8a', 42, 'shirt', 'textile', 10, { cloth: 3, metal: 0.1, power: 1.5 }, 'outfitter', 80],
  ['handbag', 'Leather bag', '#8b5a3a', 85, 'hide', 'textile', 4, { hide: 3, metal: 0.2, power: 1 }, 'outfitter', 25],
  ['scarf', 'Wool scarf', '#cf5c5c', 22, 'roll', 'textile', 18, { yarn: 1, power: 0.4 }, 'outfitter', 90],
  ['sneakers', 'Canvas sneakers', '#e9eef2', 48, 'boot', 'textile', 8, { cloth: 1.5, rubber: 1, power: 1 }, 'outfitter', 70],
  ['dress', 'Sun dress', '#f29bb2', 50, 'shirt', 'textile', 8, { cloth: 3, power: 1.2 }, 'outfitter', 50],
  // --- Energy and chemicals ---
  ['gas', 'Natural gas', '#bcd7e8', 1.8, 'barrel', 'energy', 160, { power: 0.8 }],
  ['plastic', 'Plastic pellets', '#e6eef7', 3.4, 'pellets', 'energy', 80, { gas: 1, power: 0.6 }],
  ['rubber', 'Rubber sheet', '#2f3238', 4.5, 'pile', 'energy', 60, { crude: 0.8, gas: 0.4, power: 0.6 }],
  ['heavy', 'Heavy fuel', '#5a4b2f', 3.6, 'barrel', 'energy', 100, { crude: 1, power: 0.4 }],
  ['skyfuel', 'Sky fuel', '#9fc4e8', 9, 'pump', 'energy', 50, { crude: 1.5, gas: 0.5, power: 1 }, 'fuelstop', 250],
  ['solar', 'Solar panel', '#3c5ea8', 160, 'pane', 'energy', 3, { silica: 6, glass: 2, metal: 1, power: 4 }, 'buildmart', 20],
  // --- Construction and home ---
  ['bricks', 'Clay bricks', '#b5523b', 1.6, 'tile', 'build', 160, { clay: 1.5, power: 0.3 }, 'buildmart', 600],
  ['steel', 'Steel beam', '#7d8794', 26, 'ingot', 'build', 15, { metal: 2, power: 3 }, 'buildmart', 70],
  ['blocks', 'Concrete block', '#a3a3a3', 4.2, 'tile', 'build', 80, { cement: 0.5, sand: 1, water: 1 }, 'buildmart', 300],
  ['paint', 'Wall paint', '#6fb3d2', 12, 'jar', 'build', 30, { resin: 1, water: 1, power: 0.5 }, 'homegoods', 200],
  ['frame', 'Window frame', '#d6e7ee', 38, 'pane', 'build', 8, { glass: 2, boards: 1, power: 1 }, 'buildmart', 70],
  ['door', 'Front door', '#9c6b3f', 60, 'planks', 'build', 6, { boards: 4, metal: 0.3, power: 1 }, 'homegoods', 40],
  ['sofa', 'Sofa', '#8e7cc3', 240, 'crate', 'build', 2, { boards: 6, cloth: 8, power: 2 }, 'homegoods', 12],
  ['table', 'Oak table', '#b98652', 120, 'planks', 'build', 3, { boards: 8, power: 1 }, 'homegoods', 18],
  ['bed', 'Bed frame', '#c9a27a', 180, 'planks', 'build', 2, { boards: 10, cloth: 3, metal: 0.5, power: 1.5 }, 'homegoods', 14],
  // --- Devices (tech) ---
  ['copper', 'Copper wire', '#d98a4e', 8.5, 'roll', 'tech', 40, { ore: 2, power: 2 }],
  ['screen', 'Display panel', '#2c3e57', 45, 'pane', 'tech', 6, { glass: 1, chip: 0.5, plastic: 1, power: 3 }],
  ['motor', 'Electric motor', '#8c949e', 38, 'battery', 'tech', 8, { copper: 2, metal: 1.5, power: 2 }],
  ['laptop', 'Laptop', '#4a5568', 520, 'phone', 'tech', 1, { screen: 1, chip: 4, cell: 2, plastic: 2 }, 'gadget', 10],
  ['tablet', 'Slate tablet', '#334c7a', 300, 'phone', 'tech', 1.5, { screen: 1, chip: 2, cell: 1, glass: 1 }, 'gadget', 14],
  ['watch', 'Wrist computer', '#7e57c2', 150, 'chip', 'tech', 3, { chip: 1, cell: 0.5, glass: 0.3, metal: 0.3 }, 'gadget', 25],
  ['drone', 'Camera drone', '#5f7d8c', 380, 'speaker', 'tech', 1, { motor: 4, chip: 2, cell: 2, plastic: 2 }, 'gadget', 8],
  ['tv', 'Wall screen', '#1f2937', 640, 'pane', 'tech', 0.8, { screen: 3, chip: 2, plastic: 3, power: 4 }, 'gadget', 7],
  ['console', 'Game console', '#3b3f8f', 420, 'chip', 'tech', 1, { chip: 5, plastic: 3, cell: 1, power: 3 }, 'gadget', 9],
  ['headset', 'Headphones', '#c0392b', 90, 'speaker', 'tech', 5, { copper: 1, plastic: 1, chip: 0.5, power: 1 }, 'gadget', 35],
  // --- Vehicles (tech) ---
  ['tire', 'Tire', '#2b2b2b', 28, 'pile', 'tech', 12, { rubber: 4, metal: 0.3, power: 1 }],
  ['engine', 'Engine block', '#6a6f78', 420, 'ingot', 'tech', 1, { steel: 8, metal: 6, chip: 1, power: 8 }],
  ['ebike', 'E-bike', '#2eaf7d', 650, 'battery', 'tech', 1, { motor: 1, cell: 4, steel: 2, tire: 2 }, 'motors', 6],
  ['scooter', 'Kick scooter', '#e86a3a', 180, 'battery', 'tech', 3, { metal: 4, tire: 2, plastic: 2 }, 'motors', 15],
  ['car', 'City car', '#d64545', 9500, 'pump', 'tech', 0.08, { engine: 1, steel: 40, tire: 4, glass: 6, screen: 1, plastic: 20 }, 'motors', 1.2],
  ['van', 'Delivery van', '#f2f2f2', 14000, 'crate', 'tech', 0.05, { engine: 1, steel: 70, tire: 4, glass: 6, plastic: 25 }, 'motors', 0.8],
]

export const EXTRA_RESOURCES: Resource[] = ROWS.map(([id, name, color, basePrice, , , , , store, dailyDemand]) =>
  ({ id, name, color, basePrice, ...(store ? { store, dailyDemand } : {}), ...(basePrice > 2000 ? { ship: 10 } : {}) }))
export const EXTRA_RECIPES: Recipe[] = ROWS.map(([output, , , , , , perHour, inputs]) => ({ output, perHour, inputs }))
export const EXTRA_GLYPH: Record<string, string> = Object.fromEntries(ROWS.map(r => [r[0], r[4]]))
export const EXTRA_FIELD: Record<string, Field> = Object.fromEntries(ROWS.map(r => [r[0], r[5]])) as Record<string, Field>

const P = (id: string, name: string, color: string, cost: number, wage: number, recipes: string[], unlockLevel: number): BuildingType =>
  ({ id, name, color, kind: 'production', cost, wage, recipes, unlockLevel })
export const EXTRA_BUILDINGS: BuildingType[] = [
  P('plantation', 'Plantation', '#b7d98b', 18000, 70, ['cane', 'cocoa', 'beans', 'grapes', 'potatoes', 'tomatoes', 'rice', 'corn'], 3),
  P('ranch', 'Hill ranch', '#efe9e0', 20000, 75, ['wool', 'honey'], 4),
  P('confect', 'Sweet works', '#f7c6d9', 32000, 110, ['sugar', 'choc', 'roast', 'cake', 'pie', 'icecream'], 6),
  P('dairy', 'Dairy', '#f6e08b', 24000, 90, ['butter', 'yogurt'], 5),
  P('bottler', 'Bottling hall', '#58c4c6', 30000, 100, ['wine', 'soda'], 6),
  P('deli', 'Deli kitchen', '#e6b880', 28000, 100, ['crisps', 'sauce', 'ricebowl', 'flakes', 'sandwich', 'pizza'], 5),
  P('knit', 'Knit mill', '#e3d3e8', 30000, 105, ['yarn', 'sweater', 'scarf', 'dress'], 6),
  P('fashion', 'Fashion house', '#3d5a8a', 42000, 140, ['jeans', 'handbag', 'sneakers'], 8),
  P('gasrig', 'Gas rig', '#bcd7e8', 34000, 110, ['gas'], 6),
  P('polymer', 'Polymer plant', '#e6eef7', 52000, 160, ['plastic', 'rubber', 'heavy', 'skyfuel'], 7),
  P('solarworks', 'Solar works', '#3c5ea8', 90000, 230, ['solar'], 10),
  P('brickworks', 'Brickworks', '#b5523b', 20000, 75, ['bricks', 'blocks', 'paint'], 4),
  P('steelmill', 'Steel mill', '#7d8794', 60000, 180, ['steel', 'copper'], 8),
  P('joinery', 'Joinery', '#b98652', 38000, 120, ['frame', 'door', 'sofa', 'table', 'bed'], 7),
  P('displayfab', 'Display fab', '#2c3e57', 110000, 260, ['screen', 'motor'], 10),
  P('devices', 'Device works', '#4a5568', 140000, 300, ['laptop', 'tablet', 'watch', 'drone', 'tv', 'console', 'headset'], 11),
  P('motorworks', 'Motor works', '#d64545', 200000, 380, ['tire', 'engine', 'ebike', 'scooter', 'car', 'van'], 13),
  { id: 'homestore', name: 'Home store', color: '#8e7cc3', kind: 'retail', cost: 26000, wage: 80, store: 'homegoods', unlockLevel: 6 },
  { id: 'carlot', name: 'Car lot', color: '#d64545', kind: 'retail', cost: 60000, wage: 140, store: 'motors', unlockLevel: 13 },
]
