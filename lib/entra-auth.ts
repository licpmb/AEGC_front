'use client'

export interface MicrosoftSession {
  accountId: string
  username: string
  name?: string
  tenantId?: string
}

type AccountInfo = {
  homeAccountId: string
  username?: string
  name?: string
  tenantId?: string
}

type MsalInstance = {
  initialize: () => Promise<void>
  getAllAccounts: () => AccountInfo[]
  setActiveAccount?: (account: AccountInfo | null) => void
  getActiveAccount?: () => AccountInfo | null
  loginPopup: (request: unknown) => Promise<{ account?: AccountInfo }>
  acquireTokenSilent: (request: unknown) => Promise<{ accessToken: string; account?: AccountInfo }>
  acquireTokenPopup: (request: unknown) => Promise<{ accessToken: string; account?: AccountInfo }>
  logoutPopup?: (request?: unknown) => Promise<void>
}

let instancePromise: Promise<MsalInstance> | null = null

function getConfig() {
  const clientId = process.env.NEXT_PUBLIC_ENTRA_CLIENT_ID?.trim()
  const tenantId = process.env.NEXT_PUBLIC_ENTRA_TENANT_ID?.trim()

  if (!clientId || !tenantId) {
    throw new Error(
      'Microsoft Entra todavía no está configurado para AEGC. Faltan NEXT_PUBLIC_ENTRA_CLIENT_ID y/o NEXT_PUBLIC_ENTRA_TENANT_ID en el deployment.',
    )
  }

  return { clientId, tenantId }
}

function loadScript(src: string, marker: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('Sólo disponible en navegador.'))
  const w = window as unknown as Record<string, unknown>
  if (w[marker]) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const selector = 'script[data-aegc-lib="' + marker + '"]'
    const existing = document.querySelector<HTMLScriptElement>(selector)
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('No se pudo cargar ' + marker + '.')), { once: true })
      return
    }
    const script = document.createElement('script')
    script.src = src
    script.async = true
    script.dataset.aegcLib = marker
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('No se pudo cargar ' + marker + '.'))
    document.head.appendChild(script)
  })
}

async function getMsal(): Promise<MsalInstance> {
  if (instancePromise) return instancePromise

  instancePromise = (async () => {
    const config = getConfig()
    await loadScript('https://cdn.jsdelivr.net/npm/@azure/msal-browser@4.22.0/lib/msal-browser.min.js', 'msal')

    const w = window as unknown as {
      msal?: {
        PublicClientApplication: new (config: unknown) => MsalInstance
      }
    }
    if (!w.msal) throw new Error('Microsoft Authentication Library no quedó disponible.')

    const app = new w.msal.PublicClientApplication({
      auth: {
        clientId: config.clientId,
        authority: 'https://login.microsoftonline.com/' + config.tenantId,
        redirectUri: window.location.origin,
      },
      cache: {
        cacheLocation: 'sessionStorage',
      },
    })
    await app.initialize()

    const account = app.getAllAccounts()[0] ?? null
    app.setActiveAccount?.(account)
    return app
  })()

  return instancePromise
}

function toSession(account: AccountInfo): MicrosoftSession {
  return {
    accountId: account.homeAccountId,
    username: account.username ?? account.name ?? 'Cuenta Microsoft',
    name: account.name,
    tenantId: account.tenantId,
  }
}

export async function getMicrosoftSession(): Promise<MicrosoftSession | null> {
  try {
    const app = await getMsal()
    const account = app.getActiveAccount?.() ?? app.getAllAccounts()[0] ?? null
    return account ? toSession(account) : null
  } catch {
    return null
  }
}

export async function loginWithMicrosoft(): Promise<MicrosoftSession> {
  const app = await getMsal()
  const result = await app.loginPopup({
    scopes: ['openid', 'profile', 'email', 'User.Read'],
    prompt: 'select_account',
  })
  const account = result.account ?? app.getAllAccounts()[0]
  if (!account) throw new Error('Microsoft no devolvió una cuenta autenticada.')
  app.setActiveAccount?.(account)
  return toSession(account)
}

export async function acquireGraphAccessToken(): Promise<string> {
  const app = await getMsal()
  const account = app.getActiveAccount?.() ?? app.getAllAccounts()[0] ?? null
  if (!account) {
    throw new Error('No hay una sesión Microsoft activa. Ingresá a AEGC con “Continuar con Microsoft Entra ID”.')
  }

  const request = {
    scopes: ['User.Read', 'Files.Read.All', 'Sites.Read.All'],
    account,
  }

  try {
    const result = await app.acquireTokenSilent(request)
    return result.accessToken
  } catch {
    const result = await app.acquireTokenPopup(request)
    return result.accessToken
  }
}

export async function logoutMicrosoft() {
  try {
    const app = await getMsal()
    const account = app.getActiveAccount?.() ?? app.getAllAccounts()[0] ?? null
    if (account && app.logoutPopup) {
      await app.logoutPopup({ account })
    }
  } catch {
    // Si Entra no está configurado o el logout remoto falla, AtlasApp igual cierra la sesión local.
  }
}
