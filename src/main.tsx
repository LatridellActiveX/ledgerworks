// Entry point: mounts <App/> into #root.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './fonts/fredoka.css'
import './index.css'
import App from './App'
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
