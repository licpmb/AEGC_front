'use client'

import { startTransition, useState } from 'react'
import { LoginScreen } from './login-screen'
import { AtlasShell } from './atlas-shell'

export function AtlasApp() {
  const [authed, setAuthed] = useState(false)

  if (!authed) {
    return <LoginScreen onLogin={() => startTransition(() => setAuthed(true))} />
  }
  return <AtlasShell onLogout={() => startTransition(() => setAuthed(false))} />
}
