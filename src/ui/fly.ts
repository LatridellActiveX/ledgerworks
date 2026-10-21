// Fly-to-HUD effect for collections: a copy of the bubble's icon arcs from
// the tap point to the cash pill (money) or the Warehouse tab (goods), and a
// "+amount" number pops where you tapped. Pure DOM + CSS transitions, so it
// costs nothing when idle.
export function flyTo(from: DOMRect, kind: 'goods' | 'cash', label: string, iconHTML: string) {
  const target = document.querySelector(kind === 'cash' ? '.pill.cash' : '.tabbar button:nth-child(2)') as HTMLElement | null
  const to = target?.getBoundingClientRect() ?? new DOMRect(innerWidth / 2, 0, 0, 0)
  const sx = from.left + from.width / 2, sy = from.top + from.height / 2
  // Number pop.
  const pop = document.createElement('div')
  pop.className = `num-pop ${kind}`; pop.textContent = label
  pop.style.left = `${sx}px`; pop.style.top = `${sy - 10}px`
  document.body.appendChild(pop)
  setTimeout(() => pop.remove(), 1100)
  // A few icons that fly in sequence.
  for (let k = 0; k < 5; k++) {
    const el = document.createElement('div')
    el.className = 'fly'; el.innerHTML = iconHTML
    el.style.left = `${sx}px`; el.style.top = `${sy}px`
    document.body.appendChild(el)
    const dx = to.left + to.width / 2 - sx, dy = to.top + to.height / 2 - sy
    el.animate([
      { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
      { transform: `translate(calc(-50% + ${dx * 0.5 + (k - 2) * 18}px), calc(-50% + ${dy * 0.5 - 60}px)) scale(1.15)`, opacity: 1, offset: 0.5 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.5)`, opacity: 0.2 },
    ], { duration: 650 + k * 70, easing: 'cubic-bezier(.5,0,.4,1)', delay: k * 45, fill: 'forwards' }).onfinish = () => {
      el.remove()
      if (target && k === 4) target.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.15)' }, { transform: 'scale(1)' }], { duration: 260 })
    }
  }
}
