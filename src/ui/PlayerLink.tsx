// Any place that names a player can use <PlayerLink name="..."/>: tapping it
// opens that player's public profile (ui/Players.tsx) from anywhere in the game.
// App.tsx provides the opener through PlayerCtx.
import { createContext, useContext, type ReactNode } from 'react'

export const PlayerCtx = createContext<(name: string) => void>(() => {})

export function PlayerLink({ name, children }: { name: string; children?: ReactNode }) {
  const open = useContext(PlayerCtx)
  return <button type="button" className="plink" title={`See @${name}`} onClick={e => { e.stopPropagation(); open(name) }}>{children ?? `@${name}`}</button>
}
