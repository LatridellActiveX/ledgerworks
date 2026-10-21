// ============================================================================
// Static game data: resources, buildings and recipes.
// All names, numbers and descriptions are original to Ledgerworks.
//
// Units:
//  - money is in dollars ($)
//  - `perHour` is how many units a LEVEL 1 building makes per game hour
//  - `wage` is dollars per game hour per building level
// ============================================================================

/** A tradeable good. */
export interface Resource {
  id: string
  name: string
  /** Fill color used by the flat SVG icon. */
  color: string
  /** Typical market price at quality 0; anchor for retail pricing. */
  basePrice: number
  /** Where it can be sold to the public, if anywhere. */
  store?: StoreId
  /** Public demand per game day at "normal" saturation (whole server == us). */
  dailyDemand?: number
  /** Shipping crates needed per unit when sold on the exchange (default 1). */
  ship?: number
}

export type StoreId = 'market' | 'outfitter' | 'fuelstop' | 'gadget' | 'buildmart'

/** A production recipe: what one unit needs. */
export interface Recipe {
  output: string
  perHour: number
  inputs: Record<string, number>
}

export interface BuildingType {
  id: string
  name: string
  color: string
  kind: 'production' | 'retail'
  /** Cash to construct level 1. Upgrading to level N costs cost * N. */
  cost: number
  /** Dollars per game hour per level while working. */
  wage: number
  /** Recipes it can run (production) or the store it acts as (retail). */
  recipes?: string[]
  store?: StoreId
  /** Company level needed to build it. */
  unlockLevel: number
}

// ---------------------------------------------------------------------------
// Resources (47). Grouped by chain for readability.
// ---------------------------------------------------------------------------
export const RESOURCES: Resource[] = [
  // Utilities
  { id: 'power', name: 'Power', color: '#f7d774', basePrice: 0.3, ship: 0.1 },
  { id: 'water', name: 'Water', color: '#8ec9e8', basePrice: 0.25, ship: 0.2 },
  // Logistics: crates are spent whenever goods ship through the exchange.
  { id: 'crates', name: 'Shipping crate', color: '#c8a46e', basePrice: 0.4, ship: 0 },
  // Farm & food
  { id: 'seeds', name: 'Seeds', color: '#c9b37e', basePrice: 0.2 },
  { id: 'wheat', name: 'Wheat', color: '#e8c872', basePrice: 1.1 },
  { id: 'apples', name: 'Apples', color: '#ef8a8a', basePrice: 1.6, store: 'market', dailyDemand: 900 },
  { id: 'berries', name: 'Berries', color: '#b48ad6', basePrice: 2.0, store: 'market', dailyDemand: 700 },
  { id: 'greens', name: 'Greens', color: '#9fd49a', basePrice: 1.4, store: 'market', dailyDemand: 800 },
  { id: 'feed', name: 'Animal feed', color: '#bfa57a', basePrice: 0.9 },
  { id: 'hens', name: 'Hens', color: '#f2e2c4', basePrice: 12 },
  { id: 'eggs', name: 'Eggs', color: '#fff3d6', basePrice: 0.8, store: 'market', dailyDemand: 1200 },
  { id: 'milk', name: 'Milk', color: '#f7f7f2', basePrice: 1.3, store: 'market', dailyDemand: 900 },
  { id: 'flour', name: 'Flour', color: '#f1e9d8', basePrice: 2.2 },
  { id: 'bread', name: 'Bread loaf', color: '#d9a066', basePrice: 4.5, store: 'market', dailyDemand: 600 },
  { id: 'cheese', name: 'Cheese wheel', color: '#f5c94c', basePrice: 9, store: 'market', dailyDemand: 300 },
  { id: 'juice', name: 'Fruit juice', color: '#f5a65b', basePrice: 3.8, store: 'market', dailyDemand: 500 },
  { id: 'jam', name: 'Berry jam', color: '#9b4f8f', basePrice: 6, store: 'market', dailyDemand: 300 },
  // Textiles
  { id: 'cotton', name: 'Cotton', color: '#f4f0ea', basePrice: 1.5 },
  { id: 'cloth', name: 'Cloth', color: '#a7c4d9', basePrice: 4 },
  { id: 'tshirt', name: 'T-shirt', color: '#7fb3d5', basePrice: 14, store: 'outfitter', dailyDemand: 160 },
  { id: 'jacket', name: 'Jacket', color: '#5c7c99', basePrice: 60, store: 'outfitter', dailyDemand: 40 },
  { id: 'hide', name: 'Hide', color: '#a67b5b', basePrice: 5 },
  { id: 'boots', name: 'Boots', color: '#7a5a43', basePrice: 45, store: 'outfitter', dailyDemand: 50 },
  // Energy
  { id: 'crude', name: 'Crude', color: '#4a4a52', basePrice: 2.5 },
  { id: 'fuel', name: 'Road fuel', color: '#e3b23c', basePrice: 4, store: 'fuelstop', dailyDemand: 1000 },
  { id: 'resin', name: 'Resin', color: '#c7d3dd', basePrice: 3 },
  // Construction
  { id: 'sand', name: 'Sand', color: '#e6d3a3', basePrice: 0.6 },
  { id: 'clay', name: 'Clay', color: '#c98b6b', basePrice: 0.7 },
  { id: 'timber', name: 'Timber', color: '#b08356', basePrice: 2.4 },
  { id: 'boards', name: 'Boards', color: '#d7b48a', basePrice: 6, store: 'buildmart', dailyDemand: 200 },
  { id: 'tiles', name: 'Roof tiles', color: '#d0705a', basePrice: 3, store: 'buildmart', dailyDemand: 300 },
  { id: 'cement', name: 'Cement', color: '#b8b8b8', basePrice: 5, store: 'buildmart', dailyDemand: 150 },
  { id: 'glass', name: 'Glass pane', color: '#cdeef2', basePrice: 7 },
  // Electronics
  { id: 'ore', name: 'Ore', color: '#8a8f99', basePrice: 3 },
  { id: 'metal', name: 'Metal bar', color: '#b9c0c9', basePrice: 9 },
  { id: 'silica', name: 'Silica', color: '#e9e4f5', basePrice: 2 },
  { id: 'chip', name: 'Microchip', color: '#6dbf9e', basePrice: 30 },
  { id: 'cell', name: 'Battery cell', color: '#8fd16a', basePrice: 18 },
  { id: 'phone', name: 'Pocket phone', color: '#5d6bd4', basePrice: 220, ship: 0.5, store: 'gadget', dailyDemand: 20 },
  { id: 'lamp', name: 'Desk lamp', color: '#f2c94c', basePrice: 35, store: 'gadget', dailyDemand: 60 },
  { id: 'speaker', name: 'Speaker', color: '#e07a5f', basePrice: 70, store: 'gadget', dailyDemand: 35 },
  // Research notes: spent on patents to raise the quality you can make.
  { id: 'rn_farm', name: 'Farm notes', color: '#cde8b5', basePrice: 45, ship: 0 },
  { id: 'rn_food', name: 'Kitchen notes', color: '#f8d3a8', basePrice: 50, ship: 0 },
  { id: 'rn_textile', name: 'Textile notes', color: '#c9d9ea', basePrice: 40, ship: 0 },
  { id: 'rn_energy', name: 'Energy notes', color: '#f3e3a1', basePrice: 70, ship: 0 },
  { id: 'rn_build', name: 'Builder notes', color: '#e8cdb8', basePrice: 55, ship: 0 },
  { id: 'rn_tech', name: 'Tech notes', color: '#bfe3d5', basePrice: 85, ship: 0 },
]

// ---------------------------------------------------------------------------
// Recipes. Inputs are per ONE unit of output.
// ---------------------------------------------------------------------------
export const RECIPES: Recipe[] = [
  { output: 'power', perHour: 600, inputs: {} },
  { output: 'crates', perHour: 150, inputs: { boards: 0.05, power: 0.2 } },
  { output: 'water', perHour: 500, inputs: { power: 0.2 } },
  { output: 'seeds', perHour: 400, inputs: { water: 0.1 } },
  { output: 'wheat', perHour: 120, inputs: { seeds: 1, water: 1 } },
  { output: 'apples', perHour: 80, inputs: { seeds: 1, water: 2 } },
  { output: 'berries', perHour: 70, inputs: { seeds: 1, water: 2 } },
  { output: 'greens', perHour: 90, inputs: { seeds: 1, water: 1.5 } },
  { output: 'cotton', perHour: 90, inputs: { seeds: 1, water: 2 } },
  { output: 'feed', perHour: 200, inputs: { wheat: 0.5 } },
  { output: 'hens', perHour: 6, inputs: { feed: 6, water: 3 } },
  { output: 'eggs', perHour: 150, inputs: { feed: 0.4, water: 0.2 } },
  { output: 'milk', perHour: 100, inputs: { feed: 0.6, water: 0.5 } },
  { output: 'hide', perHour: 10, inputs: { feed: 3, water: 1 } },
  { output: 'flour', perHour: 100, inputs: { wheat: 1.5, power: 0.5 } },
  { output: 'bread', perHour: 50, inputs: { flour: 0.6, eggs: 0.5, power: 1 } },
  { output: 'cheese', perHour: 15, inputs: { milk: 5, power: 2 } },
  { output: 'juice', perHour: 45, inputs: { apples: 1.5, water: 0.5, power: 0.5 } },
  { output: 'jam', perHour: 30, inputs: { berries: 2, power: 0.5 } },
  { output: 'cloth', perHour: 60, inputs: { cotton: 2, power: 1 } },
  { output: 'tshirt', perHour: 20, inputs: { cloth: 2, power: 1 } },
  { output: 'jacket', perHour: 5, inputs: { cloth: 4, hide: 2, power: 3 } },
  { output: 'boots', perHour: 6, inputs: { hide: 3, resin: 1, power: 2 } },
  { output: 'crude', perHour: 150, inputs: { power: 1 } },
  { output: 'fuel', perHour: 100, inputs: { crude: 1, power: 0.5 } },
  { output: 'resin', perHour: 80, inputs: { crude: 0.8, power: 0.5 } },
  { output: 'sand', perHour: 300, inputs: { power: 0.2 } },
  { output: 'clay', perHour: 250, inputs: { power: 0.2 } },
  { output: 'timber', perHour: 120, inputs: { water: 0.5 } },
  { output: 'boards', perHour: 50, inputs: { timber: 2, power: 1 } },
  { output: 'tiles', perHour: 90, inputs: { clay: 3, power: 1 } },
  { output: 'cement', perHour: 50, inputs: { sand: 3, clay: 2, power: 1.5 } },
  { output: 'glass', perHour: 40, inputs: { sand: 4, power: 2 } },
  { output: 'ore', perHour: 120, inputs: { power: 0.5 } },
  { output: 'metal', perHour: 40, inputs: { ore: 3, power: 3 } },
  { output: 'silica', perHour: 100, inputs: { sand: 2, power: 1 } },
  { output: 'chip', perHour: 8, inputs: { silica: 4, metal: 0.5, power: 5 } },
  { output: 'cell', perHour: 12, inputs: { metal: 1, resin: 1, power: 3 } },
  { output: 'phone', perHour: 2, inputs: { chip: 3, cell: 1, glass: 1, resin: 1 } },
  { output: 'lamp', perHour: 8, inputs: { metal: 1, glass: 1, power: 1 } },
  { output: 'rn_farm', perHour: 4, inputs: { power: 20, seeds: 10 } },
  { output: 'rn_food', perHour: 4, inputs: { power: 20, eggs: 5 } },
  { output: 'rn_textile', perHour: 4, inputs: { power: 20, cotton: 5 } },
  { output: 'rn_energy', perHour: 3, inputs: { power: 30, crude: 5 } },
  { output: 'rn_build', perHour: 4, inputs: { power: 20, clay: 10 } },
  { output: 'rn_tech', perHour: 2, inputs: { power: 40, metal: 2 } },
  { output: 'speaker', perHour: 5, inputs: { chip: 1, boards: 1, metal: 1, power: 1 } },
]

// ---------------------------------------------------------------------------
// Buildings. Production buildings list recipes; retail ones list a store.
// ---------------------------------------------------------------------------
export const BUILDINGS: BuildingType[] = [
  { id: 'generator', name: 'Windmill', color: '#f7d774', kind: 'production', cost: 9000, wage: 40, recipes: ['power'], unlockLevel: 1 },
  { id: 'pump', name: 'Pump house', color: '#8ec9e8', kind: 'production', cost: 7000, wage: 35, recipes: ['water'], unlockLevel: 1 },
  { id: 'orchard', name: 'Orchard', color: '#9fd49a', kind: 'production', cost: 12000, wage: 60, recipes: ['seeds', 'wheat', 'apples', 'berries', 'greens', 'cotton'], unlockLevel: 1 },
  { id: 'barnyard', name: 'Barnyard', color: '#e9c9a3', kind: 'production', cost: 15000, wage: 70, recipes: ['feed', 'hens', 'eggs', 'milk', 'hide'], unlockLevel: 2 },
  { id: 'kitchen', name: 'Food works', color: '#f5a65b', kind: 'production', cost: 20000, wage: 90, recipes: ['flour', 'bread', 'cheese', 'juice', 'jam'], unlockLevel: 3 },
  { id: 'loom', name: 'Loom hall', color: '#a7c4d9', kind: 'production', cost: 22000, wage: 95, recipes: ['cloth', 'tshirt', 'jacket', 'boots'], unlockLevel: 4 },
  { id: 'well', name: 'Oil well', color: '#6b6b75', kind: 'production', cost: 30000, wage: 110, recipes: ['crude'], unlockLevel: 5 },
  { id: 'refinery', name: 'Refinery', color: '#e3b23c', kind: 'production', cost: 40000, wage: 140, recipes: ['fuel', 'resin'], unlockLevel: 5 },
  { id: 'pit', name: 'Gravel pit', color: '#e6d3a3', kind: 'production', cost: 14000, wage: 60, recipes: ['sand', 'clay', 'ore'], unlockLevel: 3 },
  { id: 'sawmill', name: 'Sawmill', color: '#b08356', kind: 'production', cost: 16000, wage: 70, recipes: ['timber', 'boards'], unlockLevel: 3 },
  { id: 'kiln', name: 'Kiln works', color: '#d0705a', kind: 'production', cost: 25000, wage: 100, recipes: ['tiles', 'cement', 'glass'], unlockLevel: 4 },
  { id: 'foundry', name: 'Foundry', color: '#b9c0c9', kind: 'production', cost: 45000, wage: 150, recipes: ['metal', 'silica'], unlockLevel: 6 },
  { id: 'fab', name: 'Circuit lab', color: '#6dbf9e', kind: 'production', cost: 80000, wage: 220, recipes: ['chip', 'cell'], unlockLevel: 8 },
  { id: 'assembly', name: 'Gadget line', color: '#5d6bd4', kind: 'production', cost: 90000, wage: 240, recipes: ['phone', 'lamp', 'speaker'], unlockLevel: 8 },
  { id: 'crateyard', name: 'Crate yard', color: '#c8a46e', kind: 'production', cost: 15000, wage: 55, recipes: ['crates'], unlockLevel: 2 },
  { id: 'lab', name: 'Research lab', color: '#bfe3d5', kind: 'production', cost: 50000, wage: 160, recipes: ['rn_farm', 'rn_food', 'rn_textile', 'rn_energy', 'rn_build', 'rn_tech'], unlockLevel: 6 },
  // Retail
  { id: 'market', name: 'Corner market', color: '#ef8a8a', kind: 'retail', cost: 10000, wage: 50, store: 'market', unlockLevel: 1 },
  { id: 'outfitter', name: 'Outfitter', color: '#7fb3d5', kind: 'retail', cost: 18000, wage: 70, store: 'outfitter', unlockLevel: 4 },
  { id: 'fuelstop', name: 'Fuel stop', color: '#e3b23c', kind: 'retail', cost: 20000, wage: 60, store: 'fuelstop', unlockLevel: 5 },
  { id: 'buildmart', name: 'Build mart', color: '#d7b48a', kind: 'retail', cost: 16000, wage: 60, store: 'buildmart', unlockLevel: 3 },
  { id: 'gadget', name: 'Gadget shop', color: '#5d6bd4', kind: 'retail', cost: 30000, wage: 90, store: 'gadget', unlockLevel: 8 },
]

// Fast lookups by id.
export const RES = Object.fromEntries(RESOURCES.map(r => [r.id, r])) as Record<string, Resource>
export const REC = Object.fromEntries(RECIPES.map(r => [r.output, r])) as Record<string, Recipe>
export const BLD = Object.fromEntries(BUILDINGS.map(b => [b.id, b])) as Record<string, BuildingType>
