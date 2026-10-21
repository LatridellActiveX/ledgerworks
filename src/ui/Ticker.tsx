// Animated number: eases from the old value to the new one, flashing green
// on gains and red on losses. Used for the cash counter.
import { useEffect, useRef, useState } from 'react'
import { money } from './fmt'

export function Ticker({ value }: { value: number }) {
  const [shown, setShown] = useState(value)
  const [flash, setFlash] = useState<'' | 'up' | 'down'>('')
  const from = useRef(value)
  useEffect(() => {
    const start = performance.now(), a = from.current, b = value
    if (Math.abs(b - a) < 0.5) { setShown(b); from.current = b; return }
    setFlash(b > a ? 'up' : 'down')
    let raf = 0
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / 600), e = 1 - Math.pow(1 - k, 3)
      setShown(a + (b - a) * e)
      if (k < 1) raf = requestAnimationFrame(step); else { from.current = b; setTimeout(() => setFlash(''), 250) }
    }
    raf = requestAnimationFrame(step)
    return () => { cancelAnimationFrame(raf); from.current = b }
  }, [value])
  return <span className={`ticker ${flash}`}>{money(shown)}</span>
}
