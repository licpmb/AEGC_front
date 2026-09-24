'use client'

import { useState } from 'react'
import { LoginScreen } from './login-screen'
import { AtlasShell } from './atlas-shell'

export function AtlasApp() {
  const [authed, setAuthed] = useState(false)

  if (!authed) return <LoginScreen onLogin={() => setAuthed(true)} />
  return <AtlasShell onLogout={() => setAuthed(false)} />
}
