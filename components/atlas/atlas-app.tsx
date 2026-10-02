'use client'

import { useState } from 'react'
import { loginWithMicrosoft, logoutMicrosoft, type MicrosoftSession } from '@/lib/entra-auth'
import { LoginScreen } from './login-screen'
import { AtlasShell } from './atlas-shell'

export function AtlasApp() {
  const [authed, setAuthed] = useState(false)
  const [microsoftSession, setMicrosoftSession] = useState<MicrosoftSession | null>(null)

  if (!authed) {
    return (
      <LoginScreen
        onMicrosoftLogin={async () => {
          const session = await loginWithMicrosoft()
          setMicrosoftSession(session)
          setAuthed(true)
          return session
        }}
        onLocalLogin={() => {
          setMicrosoftSession(null)
          setAuthed(true)
        }}
      />
    )
  }

  return (
    <AtlasShell
      microsoftSession={microsoftSession}
      onLogout={() => {
        void logoutMicrosoft()
        setMicrosoftSession(null)
        setAuthed(false)
      }}
    />
  )
}
