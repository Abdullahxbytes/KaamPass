import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '@fontsource-variable/noto-nastaliq-urdu'

import { App } from './app/App'
import { initializeI18n } from './i18n/i18n'
import './styles.css'

async function bootstrap() {
  await initializeI18n()

  const rootElement = document.getElementById('root')

  if (!rootElement) {
    throw new Error('Unable to find the application root element.')
  }

  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void bootstrap()
