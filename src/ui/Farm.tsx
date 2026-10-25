// Orchard plot: a drawn field that shows what is growing, how far along it
// is, the soil and the weather, with the hands-on actions: tend, harvest,
// irrigate and graft. Used inside the building panel for farm buildings.
import { TurboTag } from './TurboChip'
import * as E from '../game/engine'
import * as FM from '../game/farm'
import { RES } from '../game/data'
import { money } from './fmt'

type Act = (f: (st: E.GameState) => string | null | void) => void

/** Fruit and leaf colours per crop. */
const CROP: Record<string, { fruit: string; leaf: string }> = {
  seeds: { fruit: '#c9b37e', leaf: '#9bb35a' },
  wheat: { fruit: '#e6c15a', leaf: '#c9a53a' },
  apples: { fruit: '#d9483b', leaf: '#4f9d4a' },
  berries: { fruit: '#7b2fa3', leaf: '#3f8a4a' },
  greens: { fruit: '#5fae4c', leaf: '#3c8a3a' },
  cotton: { fruit: '#f4f1ea', leaf: '#7fae62' },
}

/** Soil colour from dark (rich) to pale (worn out). */
const soilColor = (soil: number) => {
  const t = Math.min(1, Math.max(0, (soil - FM.SOIL_MIN) / (FM.SOIL_MAX - FM.SOIL_MIN)))
  const mix = (a: number, b: number) => Math.round(a + (b - a) * t)
  return `rgb(${mix(190, 98)}, ${mix(160, 62)}, ${mix(120, 40)})`
}
const SKY: Record<FM.Weather, [string, string]> = {
  clear: ['#bfe6ff', '#effaff'], rain: ['#a9b8c9', '#dfe6ee'], frost: ['#c9dcef', '#f4fbff'], heat: ['#ffd9a0', '#fff4df'],
}

export function FarmPlot({ s, plot, act }: { s: E.GameState; plot: number; act: Act }) {
  const bd = E.unitAt(s, plot)! // plot ref: the farm itself or one of its extra fields
  const j = bd.job?.kind === 'make' ? bd.job : undefined
  const weather: FM.Weather = s.weather ?? 'clear'
  const soil = bd.soil ?? 1
  const stars = FM.starsOf(bd) // 1-5 soil stars (add-ons, farm.ts)
  const farm = E.farmOf(s, plot) // main farm building: owns the tractor
  const rotateReady = (bd.streak ?? 0) >= FM.ROTATE_AFTER && stars < FM.STAR_MAX
  const crop = CROP[j?.res ?? ''] ?? CROP.seeds
  const ripe = j?.ripeH !== undefined
  const late = ripe && s.hour - j!.ripeH! >= FM.LATE_H
  const progress = j && !ripe ? FM.growFrac(j, s.hour) : 1
  const stage = !j ? 'bare' : ripe ? (late ? 'late' : 'ripe') : progress < 0.33 ? 'sprout' : progress < 0.7 ? 'young' : 'mature'
  const gap = j?.tendH === undefined ? 0 : Math.max(0, FM.TEND_GAP_H - (s.hour - j.tendH))
  const [sky, horizon] = SKY[weather]
  const W = 320, H = 170, rows = 2, cols = 6
  const plants = Array.from({ length: rows * cols }, (_, i) => ({ x: 34 + (i % cols) * 50, y: 100 + Math.floor(i / cols) * 34 }))
  const kids = stage === 'bare' ? 0 : stage === 'sprout' ? 0.35 : stage === 'young' ? 0.6 : 1
  return <div className={`farm farm-${stage}`}>
    <svg className="farm-scene" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Orchard plot: ${stage}, soil ${Math.round(soil * 100)}%, ${FM.WEATHER[weather].label}`}>
      <defs>
        <linearGradient id={`fsky${plot}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={sky} /><stop offset="1" stopColor={horizon} /></linearGradient>
        <linearGradient id={`fsoil${plot}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={soilColor(soil)} /><stop offset="1" stopColor={soilColor(soil * 0.8)} /></linearGradient>
      </defs>
      <rect width={W} height={H} fill={`url(#fsky${plot})`} />
      {weather === 'rain' && Array.from({ length: 14 }, (_, i) => <line key={i} className="fx-rain" x1={10 + i * 22} y1={10 + (i % 3) * 14} x2={6 + i * 22} y2={24 + (i % 3) * 14} stroke="#6f8fb3" strokeWidth="1.4" />)}
      {weather === 'frost' && <rect width={W} height={H} fill="#ffffff" opacity="0.12" />}
      {weather === 'heat' && <circle cx={W - 34} cy={30} r="18" fill="#ffb13b" opacity="0.6" className="fx-sun" />}
      {weather === 'clear' && <circle cx={W - 34} cy={30} r="14" fill="#ffd54a" />}
      <path d={`M0 ${H - 84} Q ${W / 2} ${H - 102} ${W} ${H - 84} L${W} ${H} L0 ${H}Z`} fill="#8fc27a" />
      <rect y={H - 74} width={W} height={74} fill={`url(#fsoil${plot})`} />
      {bd.irrigated && <g stroke="#3a8fd0" strokeWidth="2" strokeDasharray="4 3" className="fx-drip">
        {[0, 1].map(r => <line key={r} x1="18" x2={W - 18} y1={106 + r * 34} y2={106 + r * 34} />)}
      </g>}
      {stage !== 'bare' && plants.map((p, i) => {
        const on = i < Math.round(plants.length * (kids || 0)) || kids === 1
        if (!on) return null
        const sway = `${(i % 3) * 0.4}s`
        return <g key={i} className="plant" style={{ animationDelay: sway }}>
          <line x1={p.x} y1={p.y} x2={p.x} y2={p.y - (stage === 'sprout' ? 8 : 22)} stroke="#5b7b3a" strokeWidth="2.5" />
          <ellipse cx={p.x - 6} cy={p.y - (stage === 'sprout' ? 8 : 20)} rx="6" ry="3.5" fill={crop.leaf} transform={`rotate(-25 ${p.x - 6} ${p.y})`} />
          <ellipse cx={p.x + 6} cy={p.y - (stage === 'sprout' ? 8 : 20)} rx="6" ry="3.5" fill={crop.leaf} transform={`rotate(25 ${p.x + 6} ${p.y})`} />
          {(stage === 'ripe' || stage === 'late') && <circle cx={p.x} cy={p.y - 26} r="5" fill={stage === 'late' ? '#a88f6a' : crop.fruit} stroke="#fff" strokeWidth="1" />}
        </g>
      })}
      {/* Greenhouse: a pale glass pane with frame lines over the whole scene. */}
      {bd.greenhouse && <g className="fx-glass"><rect x="4" y="40" width={W - 8} height={H - 44} fill="#dff4fb" opacity="0.28" stroke="#9cc9d6" strokeWidth="2" />
        {[1, 2, 3, 4, 5].map(i => <line key={i} x1={4 + i * (W - 8) / 6} y1="40" x2={4 + i * (W - 8) / 6} y2={H - 4} stroke="#9cc9d6" strokeWidth="1" opacity="0.7" />)}</g>}
      {/* Sprinkler heads on the drip line. */}
      {bd.sprinkler && [60, 160, 260].map(x => <g key={x}><line x1={x} y1={H - 70} x2={x} y2={H - 82} stroke="#3a8fd0" strokeWidth="2" /><circle cx={x} cy={H - 84} r="3" fill="#3a8fd0" /></g>)}
      {/* Tractor prop (farm-wide). */}
      {farm?.tractor && <g transform={`translate(10 ${H - 30})`}><rect x="0" y="0" width="26" height="11" rx="2" fill="#3f9a3a" /><rect x="14" y="-9" width="10" height="9" fill="#cfe3f3" stroke="#2f6b2a" /><circle cx="20" cy="13" r="7" fill="#222" /><circle cx="5" cy="14" r="4" fill="#222" /></g>}
      {bd.graft && <g><circle cx={W - 18} cy={H - 96} r="10" fill="#fff" stroke="#7b61ff" strokeWidth="2" /><text x={W - 18} y={H - 92} fontSize="11" textAnchor="middle" fill="#7b61ff" fontWeight="700">G</text></g>}
      <text x="8" y="18" fontSize="12" fill="#2c3e2a" fontWeight="700">{j ? `${RES[j.res].name} Q${ripe ? FM.ripeQuality(j.q, j.ripeH!, s.hour) : j.q}` : 'Bare soil'}</text>
      <text x={W - 8} y="66" fontSize="11" textAnchor="end" fill="#2c3e2a">{FM.WEATHER[weather].icon} {FM.WEATHER[weather].label}</text>
    </svg>
    <div className="farm-stats">
      <div>Soil <span className="bar"><i style={{ width: `${Math.min(100, (soil / FM.SOIL_MAX) * 100)}%` }} /></span> {Math.round(soil * 100)}%</div>
      <div aria-label={`Soil ${stars.toFixed(1)} of 5 stars`}>Soil stars <span className="stars">{'★'.repeat(Math.round(stars))}{'☆'.repeat(5 - Math.round(stars))}</span> {stars.toFixed(1)} · output {Math.round((FM.outMult(bd) - 1) * 100) >= 0 ? '+' : ''}{Math.round((FM.outMult(bd) - 1) * 100)}%</div>
      {bd.lastCrop && <div className="muted">{rotateReady ? `Rotation ready: plant something other than ${RES[bd.lastCrop]?.name ?? bd.lastCrop} for +1 star free.` : `Last crop ${RES[bd.lastCrop]?.name ?? bd.lastCrop} ×${bd.streak ?? 0}. Switch after ${FM.ROTATE_AFTER} for a free star.`}</div>}
      <div className="muted">{bd.greenhouse ? 'Greenhouse: weather and slumps can’t reach this field.' : FM.WEATHER[weather].note}</div>
      {j && !ripe && <div>Ripens in {Math.ceil(E.jobLeft(s, j) * 60)} min <TurboTag on={E.boosts(j)} /> · tended {j.tends ?? 0}×</div>}
      {ripe && <div className={late ? 'err' : 'ok-note'}>{late ? 'Late: losing quality. Harvest now.' : 'Ripe. Harvest now before it loses value.'}</div>}
    </div>
    <div className="row farm-actions">
      {j && !ripe && <button disabled={gap > 0} onClick={() => act(st => E.tend(st, plot))}>{gap > 0 ? `Tend in ${Math.ceil(gap * 60)} min` : 'Tend 💧'}</button>}
      {ripe && <button className="primary" onClick={() => act(st => E.harvest(st, plot))}>Harvest 🧺</button>}
      {!bd.irrigated && <button onClick={() => act(st => E.irrigate(st, plot))}>Drip line {money(Math.round(2500 * bd.level))}</button>}
      {!bd.graft && !j && <button onClick={() => act(st => E.graft(st, plot))}>Graft {money(Math.round(300 * bd.level))} · 3 seeds · {Math.round(FM.GRAFT_CHANCE * 100)}%</button>}
    </div>
    {/* Farm add-ons: soil care is consumable; kit counts toward building value. */}
    <div className="row farm-actions farm-addons">
      {stars < FM.STAR_MAX && <button onClick={() => act(st => E.feedSoil(st, plot, 'compost'))}>Compost +1★ {money(FM.COMPOST_COST)}</button>}
      {stars < FM.STAR_MAX && <button onClick={() => act(st => E.feedSoil(st, plot, 'fertilizer'))}>Fertilizer +2★ {money(FM.FERTILIZER_COST)}</button>}
      {!bd.greenhouse && <button onClick={() => act(st => E.buildGreenhouse(st, plot))}>Greenhouse {money(FM.GREENHOUSE_COST)}</button>}
      {bd.irrigated && !bd.sprinkler && <button onClick={() => act(st => E.addSprinkler(st, plot))}>Sprinkler +15% {money(FM.sprinklerCost(bd.level))}</button>}
      {farm && !farm.tractor && <button onClick={() => act(st => E.buyTractor(st, plot))}>Tractor (farm) {money(FM.TRACTOR_COST)}</button>}
    </div>
    <small className="muted">Add-ons: each soil star is ±10% output vs 3★, and harvests slowly wear it. Greenhouse: no weather or slumps, +15% growth. Tractor: −20% time to harvest on every field. Sprinkler (needs the drip line): +15% output. Kit counts toward Company Value; compost and fertilizer don't.</small>
    <small className="muted">Tending speeds growth; three tends during a crop give it +1 quality. Unharvested crops slowly lose value. Frost spares plots tended in the last day. Irrigation saves a third of the water.</small>
  </div>
}
