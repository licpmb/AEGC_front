'use client'

import { useState } from 'react'
import { Lock, Mail } from 'lucide-react'
import { Brand } from './brand'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'

function MicrosoftMark() {
  return (
    <span className="grid h-4 w-4 shrink-0 grid-cols-2 gap-px" aria-hidden>
      <span className="bg-[#f25022]" />
      <span className="bg-[#7fba00]" />
      <span className="bg-[#00a4ef]" />
      <span className="bg-[#ffb900]" />
    </span>
  )
}

export function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-4xl overflow-hidden rounded-xl border border-border bg-card md:grid md:grid-cols-[1.15fr_1fr]">
        {/* Panel visual: mini-mapa estático como firma de marca */}
        <div className="relative hidden overflow-hidden border-r border-border bg-sidebar p-8 md:flex md:flex-col md:justify-between">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.5]"
            style={{
              backgroundImage:
                'radial-gradient(oklch(0.98 0.01 264 / 12%) 1px, transparent 1px)',
              backgroundSize: '22px 22px',
            }}
            aria-hidden
          />
          <div className="relative">
            <Brand size="lg" />
            <h1 className="mt-6 text-3xl font-bold leading-tight text-balance">
              El mapa vivo de tus integraciones
            </h1>
            <p className="mt-3 text-[13.5px] leading-relaxed text-muted-foreground text-pretty">
              SAP S/4HANA, CPI, Web Dispatcher, interfaces con front, gateway y API, BigQuery,
              loaders, builders y los issues del sprint. Todo en un solo universo navegable.
            </p>
          </div>

          <div className="relative mt-8 flex flex-col gap-2 font-mono text-[11px]">
            {[
              { c: 'var(--chart-1)', t: 'SAP S/4HANA · 410 tablas replicadas' },
              { c: 'var(--chart-2)', t: 'CPI · 2.4M mensajes / mes' },
              { c: 'var(--chart-3)', t: 'GCC · Web de Pedidos · 620 pedidos / día' },
              { c: 'var(--chart-4)', t: 'BigQuery → Loaders → SQL Server' },
            ].map((r) => (
              <div key={r.t} className="flex items-center gap-2.5">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: r.c }} />
                <span className="text-muted-foreground">{r.t}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Panel de acceso */}
        <div className="flex flex-col justify-center gap-5 p-8">
          <div>
            <h2 className="text-xl font-semibold">Acceder</h2>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Usá tu cuenta corporativa o tus credenciales locales.
            </p>
          </div>

          <Button
            variant="outline"
            className="h-11 w-full justify-center gap-2.5 text-[13.5px]"
            onClick={onLogin}
          >
            <MicrosoftMark />
            Continuar con Microsoft Entra ID
          </Button>

          <div className="flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              o
            </span>
            <Separator className="flex-1" />
          </div>

          <form
            className="flex flex-col gap-3.5"
            onSubmit={(e) => {
              e.preventDefault()
              onLogin()
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email" className="text-[12.5px]">
                Usuario
              </Label>
              <div className="relative">
                <Mail
                  size={14}
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nombre@compania.com"
                  className="h-10 pl-8 text-[13px]"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pass" className="text-[12.5px]">
                Contraseña
              </Label>
              <div className="relative">
                <Lock
                  size={14}
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  id="pass"
                  type="password"
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                  placeholder="••••••••"
                  className="h-10 pl-8 text-[13px]"
                />
              </div>
            </div>
            <Button type="submit" className="mt-1 h-10 w-full text-[13.5px]">
              Ingresar al mapa
            </Button>
          </form>

          <p className="text-center font-mono text-[10.5px] text-muted-foreground">
            Prototipo de diseño · sin autenticación real
          </p>
        </div>
      </div>
    </main>
  )
}
