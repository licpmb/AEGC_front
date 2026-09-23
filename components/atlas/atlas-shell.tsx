'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Map as MapIcon,
  Database,
  LogOut,
  AlertTriangle,
  ShieldCheck,
  FileText,
  DownloadCloud,
  Network,
} from 'lucide-react'
import { AtlasMap } from './atlas-map'
import { DataEntry } from './data-entry'
import { RolesAdmin } from './roles-admin'
import { DocCoverage } from './doc-coverage'
import { ImportReconcile } from './import-reconcile'
import { Brand } from './brand'
import { NativeArchiWorkspace } from './native-archi-workspace'
import { Button } from '@/components/ui/button'
import { ATLAS_ISSUES, ATLAS_NODES } from '@/lib/atlas-data'
import { cn } from '@/lib/utils'
import { parseNativeArchi, type NativeModel } from '@/lib/native-archi'

const VIEWS = [
  { key: 'mapa', label: 'Mapa', icon: MapIcon },
  { key: 'archi', label: 'Modelo Archi', icon: Network },
  { key: 'documentacion', label: 'Documentación', icon: FileText },
  { key: 'importar', label: 'Importar', icon: DownloadCloud },
  { key: 'datos', label: 'Cargar datos', icon: Database },
  { key: 'roles', label: 'Roles y accesos', icon: ShieldCheck },
] as const

export function AtlasShell({ onLogout }: { onLogout: () => void }) {
  const [view, setView] = useState<(typeof VIEWS)[number]['key']>('mapa')
  const [native, setNative] = useState<{ model: NativeModel; xml: string } | null>(null)
  const [showDemoMap, setShowDemoMap] = useState(false)
  useEffect(() => {
    const request = indexedDB.open('aegc-archi-local', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('models')
    request.onsuccess = () => {
      const db = request.result
      const read = db.transaction('models').objectStore('models').get('active')
      read.onsuccess = () => { if (typeof read.result === 'string') { try { setNative({ model: parseNativeArchi(read.result), xml: read.result }) } catch { /* Invalid local cache: user can reopen the file. */ } } db.close() }
      read.onerror = () => db.close()
    }
  }, [])
  function acceptModel(model: NativeModel, xml: string) {
    setNative({ model, xml })
    setShowDemoMap(false)
    const request = indexedDB.open('aegc-archi-local', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('models')
    request.onsuccess = () => { const db = request.result; const write = db.transaction('models', 'readwrite').objectStore('models').put(xml, 'active'); write.onsuccess = () => db.close(); write.onerror = () => db.close() }
  }

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
              <span className="text-foreground">{native ? native.model.elements.size : stats.nodos}</span> {native ? 'elementos' : 'nodos'}
            </span>
            <span>
              <span className="text-foreground">{native ? native.model.relationships.size : stats.interfaces}</span> {native ? 'relaciones' : 'interfaces'}
            </span>
            <span>
              <span className="text-foreground">{stats.issues}</span> issues
            </span>
          </div>

          {!native && stats.bloqueantes > 0 && (
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
            <span className="rounded border border-amber-500/50 px-2 py-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300" title="Las otras secciones conservan datos ilustrativos">{native && !showDemoMap ? 'ARCHI · Modelo local' : 'DEMO · Datos ilustrativos'}</span>
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
              Usuario de demostración
            </span>
            <Button variant="ghost" size="icon" onClick={onLogout} aria-label="Salir">
              <LogOut size={15} />
            </Button>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {view === 'mapa' && (native && !showDemoMap ? <div className="flex min-h-0 flex-1 flex-col"><div className="flex items-center justify-between border-b border-border px-5 py-2 text-xs"><span>Mapa principal · {native.model.name} · relaciones del archivo Archi</span><Button variant="outline" size="sm" onClick={() => setShowDemoMap(true)}>Ver mapa ilustrativo</Button></div><NativeArchiWorkspace initialModel={native.model} initialXml={native.xml} onModelLoaded={acceptModel}/></div> : <div className="flex min-h-0 flex-1 flex-col"><div className="flex items-center justify-between border-b border-border px-5 py-2 text-xs"><span>{native ? 'Mapa ilustrativo, separado del modelo Archi' : 'Este mapa contiene datos de demostración. Abrí tu .archimate para mostrar KETAN y sus relaciones reales.'}</span><Button variant="outline" size="sm" onClick={() => native ? setShowDemoMap(false) : setView('archi')}>{native ? 'Volver al modelo real' : 'Abrir modelo Archi'}</Button></div><div className="min-h-0 flex-1"><AtlasMap /></div></div>)}
        {view === 'archi' && <NativeArchiWorkspace initialModel={native?.model} initialXml={native?.xml} onModelLoaded={acceptModel} />}
        {view === 'documentacion' && <DocCoverage />}
        {view === 'importar' && <ImportReconcile />}
        {view === 'datos' && <DataEntry />}
        {view === 'roles' && <RolesAdmin />}
      </div>
    </div>
  )
}
