import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import Playground from './Playground.jsx'

// Manual testing: append #/playground to the URL for the full-API playground.
const isPlayground = location.hash.startsWith('#/playground')

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isPlayground ? <Playground /> : <App />}
  </StrictMode>,
)
