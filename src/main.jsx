// RazeKit entry — activates the shared app shell and v1 visual system.
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import RazeKitErrorBoundary from '@/components/RazeKitErrorBoundary.jsx'
import '@/index.css'
import '@/styles/razekit-v1.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <RazeKitErrorBoundary>
    <App />
  </RazeKitErrorBoundary>
)
