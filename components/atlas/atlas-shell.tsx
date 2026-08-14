'use client'

import { useMemo, useState } from 'react'
import {
  Map as MapIcon,
  Database,
  LogOut,
  AlertTriangle,
  ShieldCheck,
  FileText,
  DownloadCloud,
} from 'lucide-react'
import { AtlasMap } from './atlas-map'
import { DataEntry } from './data-entry'
import { RolesAdmin } from './roles-admin'
import { DocCoverage } from './doc-coverage'
import { ImportReconcile } from './import-reconcile'
import { Brand } from './brand'
import { Button } from '@/components/ui/button'
import { ATLAS_ISSUES, ATLAS_NODES } from '@/lib/atlas-data'
import { cn } from '@/lib/utils'

const VIEWS = [
  { key: 'mapa', label: 'Mapa', icon: MapIcon },
  { key: 'documentacion', label: 'Documentación', icon: FileText },
  { key: 'importar', label: 'Importar', icon: DownloadCloud },
  { key: 'datos', label: 'Cargar datos', icon: Database },
  { key: 'roles', label: 'Roles y accesos', icon: ShieldCheck },
] as const

export function AtlasShell({ onLogout }: { onLogout: () => void }) {
  const [view, setView] = useState<(typeof VIEWS)[number]['key']>('mapa')

  const stats = useMemo(() => {
    const open = ATLAS_ISSUES.filter((i) => i.state !== 'cerrado')
    return {
      nodos: ATLAS_NODES.length,
      interfaces: ATLAS_NODES.filter((n) => n.kind === 'interface').length,
      issues: open.length,
      bloqueantes: open.filter((i) => i.severity === 'bloqueante').length,
    }
  }, [])

  return (
    <div className="flex h-svh flex-col overflow-hidden bg-background">
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-border bg-sidebar px-4">
        <Brand size="sm" />
        <div className="hidden h-6 w-px bg-border lg:block" />

        <nav className="flex items-center gap-1" aria-label="Vistas">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              onClick={() => setView(v.key)}
              className={cn(
                'flex items-center gap-2 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors',
                view === v.key
                  ? 'bg-secondary text-secondary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              <v.icon size={14} />
              {v.label}
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-4">
          <div className="hidden items-center gap-4 font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground md:flex">
            <span>
              <span className="text-foreground">{stats.nodos}</span> nodos
            </span>
            <span>
              <span className="text-foreground">{stats.interfaces}</span> interfaces
            </span>
            <span>
              <span className="text-foreground">{stats.issues}</span> issues
            </span>
          </div>

          {stats.bloqueantes > 0 && (
            <span
              className="flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10.5px] font-semibold"
              style={{
                background: 'color-mix(in oklab, var(--destructive) 18%, transparent)',
                color: 'var(--destructive)',
              }}
            >
              <AlertTriangle size={11} />
              {stats.bloqueantes} bloqueantes
            </span>
          )}

          <div className="flex items-center gap-2 border-l border-border pl-4">
            <span className="hidden items-center gap-1.5 text-[12.5px] text-muted-foreground sm:inline-flex">
              <span
                className="rounded-sm px-1.5 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-wide"
                style={{
                  background: 'color-mix(in oklab, var(--chart-3) 20%, transparent)',
                  color: 'var(--chart-3)',
                }}
              >
                Admin
              </span>
              m.duarte@grupocepas.com
            </span>
            <Button variant="ghost" size="icon" onClick={onLogout} aria-label="Salir">
              <LogOut size={15} />
            </Button>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {view === 'mapa' && <AtlasMap />}
        {view === 'documentacion' && <DocCoverage />}
        {view === 'importar' && <ImportReconcile />}
        {view === 'datos' && <DataEntry />}
        {view === 'roles' && <RolesAdmin />}
      </div>
    </div>
  )
}
