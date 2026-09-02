import { render } from 'preact'
import './index.css'
import './layout.css'
import { App } from './app.tsx'
import { AuthProvider } from './auth.tsx'

render(
  <AuthProvider>
    <App />
  </AuthProvider>,
  document.getElementById('app')!
)
