import { render } from 'preact'
import './index.css'
import './layout.css'
import { App } from './app.tsx'
import { StoreProvider } from './store.tsx'

render(
  <StoreProvider>
    <App />
  </StoreProvider>,
  document.getElementById('app')!
)
