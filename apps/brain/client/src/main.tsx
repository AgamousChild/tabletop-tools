import './index.css'

import { renderApp } from '@tabletop-tools/ui'

import App from './App'
import { initFactionNames } from './lib/faction-names'

// Start fetching faction display names from the server immediately
initFactionNames()

renderApp(App)
