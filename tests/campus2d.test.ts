// Every building type must render a detailed 2D model at several levels.
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { BLD } from '../src/game/data'
import { Model2D } from '../src/ui/campus2d'

describe('2D models', () => {
  it('all types render with detail at levels 1, 6 and 14, day and night', () => {
    for (const t of Object.keys(BLD)) for (const level of [1, 6, 14]) for (const night of [false, true]) {
      const svg = renderToStaticMarkup(createElement('svg', null, createElement(Model2D, { type: t, level, busy: true, night, x: 0, y: 0 })))
      expect((svg.match(/<(polygon|path|line|circle|ellipse|rect)/g) ?? []).length, `${t} L${level}`).toBeGreaterThan(25)
    }
  })
  it('buildings grow with level', () => {
    const n = (l: number) => renderToStaticMarkup(createElement('svg', null, createElement(Model2D, { type: 'kitchen', level: l, busy: false, night: false, x: 0, y: 0 }))).length
    expect(n(14)).toBeGreaterThan(n(1))
  })
})
