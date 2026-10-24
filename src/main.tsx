// Entry point: mounts <App/> into #root.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './fonts/fredoka.css'
import './index.css'
import App from './App'
import { reportError } from './game/cloud'
// Send uncaught errors (message + file:line only) to the server's error log.
window.addEventListener('error', e => reportError(`${e.message} @ ${String(e.filename).split('/').pop()}:${e.lineno}`))
window.addEventListener('unhandledrejection', e => reportError(String((e.reason as Error)?.message ?? e.reason), 'promise'))
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
