'use client'

import { Search, Maximize2, GitBranch, AlertTriangle, LayoutGrid } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { GROUP_META, COUNTRY_META, type CountryCode, type Environment } from '@/lib/atlas-types'
import { cn } from '@/lib/utils'

export type MapFilters = {
  query: string
  groups: string[]
  countries: CountryCode[]
  environments: Environment['name'][]
  direction: 'todos' | 'extraccion' | 'inyeccion'
  showIssues: boolean
  onlyWithIssues: boolean
}

export type MultiNodeAction =
  | 'align-left'
  | 'align-center-x'
  | 'align-right'
  | 'align-top'
  | 'align-center-y'
  | 'align-bottom'
  | 'distribute-horizontal'
  | 'distribute-vertical'
  | 'same-width'
  | 'same-height'
  | 'same-size'

const DIRECTIONS: { key: MapFilters['direction']; label: string }[] = [
  { key: 'todos', label: 'Todo el flujo' },
  { key: 'extraccion', label: 'Extracción' },
  { key: 'inyeccion', label: 'Inyección' },
]

function ToolGlyph({
  kind,
}: {
  kind:
    | 'left' | 'center-x' | 'right'
    | 'top' | 'center-y' | 'bottom'
    | 'distribute-x' | 'distribute-y'
    | 'width' | 'height' | 'size'
}) {
  const common = { stroke: 'currentColor', strokeWidth: 1.4, fill: 'none' }
  if (kind === 'left') return <svg viewBox="0 0 18 18" className="h-4 w-4"><path d="M3 2v14M5 5h9M5 9h6M5 13h8" {...common}/></svg>
  if (kind === 'center-x') return <svg viewBox="0 0 18 18" className="h-4 w-4"><path d="M9 2v14M4 5h10M6 9h6M5 13h8" {...common}/></svg>
  if (kind === 'right') return <svg viewBox="0 0 18 18" className="h-4 w-4"><path d="M15 2v14M4 5h9M7 9h6M5 13h8" {...common}/></svg>
  if (kind === 'top') return <svg viewBox="0 0 18 18" className="h-4 w-4"><path d="M2 3h14M5 5v9M9 5v6M13 5v8" {...common}/></svg>
  if (kind === 'center-y') return <svg viewBox="0 0 18 18" className="h-4 w-4"><path d="M2 9h14M5 4v10M9 6v6M13 5v8" {...common}/></svg>
  if (kind === 'bottom') return <svg viewBox="0 0 18 18" className="h-4 w-4"><path d="M2 15h14M5 4v9M9 7v6M13 5v8" {...common}/></svg>
  if (kind === 'distribute-x') return <svg viewBox="0 0 18 18" className="h-4 w-4"><path d="M2 3v12M16 3v12M5 6v6M9 5v8M13 6v6M3.5 9h3M7.5 9h3M11.5 9h3" {...common}/></svg>
  if (kind === 'distribute-y') return <svg viewBox="0 0 18 18" className="h-4 w-4"><path d="M3 2h12M3 16h12M6 5h6M5 9h8M6 13h6M9 3.5v3M9 7.5v3M9 11.5v3" {...common}/></svg>
  if (kind === 'width') return <svg viewBox="0 0 18 18" className="h-4 w-4"><rect x="3" y="5" width="12" height="8" {...common}/><path d="M1.5 9h3M13.5 9h3M2.5 8l-1 1 1 1M15.5 8l1 1-1 1" {...common}/></svg>
  if (kind === 'height') return <svg viewBox="0 0 18 18" className="h-4 w-4"><rect x="5" y="3" width="8" height="12" {...common}/><path d="M9 1.5v3M9 13.5v3M8 2.5l1-1 1 1M8 15.5l1 1 1-1" {...common}/></svg>
  return <svg viewBox="0 0 18 18" className="h-4 w-4"><rect x="4" y="4" width="10" height="10" {...common}/><path d="M2 6V2h4M12 2h4v4M16 12v4h-4M6 16H2v-4" {...common}/></svg>
}

const MULTI_TOOLS: Array<{ action: MultiNodeAction; title: string; glyph: Parameters<typeof ToolGlyph>[0]['kind'] }> = [
  { action: 'align-left', title: 'Alinear a la izquierda', glyph: 'left' },
  { action: 'align-center-x', title: 'Alinear centros verticales', glyph: 'center-x' },
  { action: 'align-right', title: 'Alinear a la derecha', glyph: 'right' },
  { action: 'align-top', title: 'Alinear arriba', glyph: 'top' },
  { action: 'align-center-y', title: 'Alinear centros horizontales', glyph: 'center-y' },
  { action: 'align-bottom', title: 'Alinear abajo', glyph: 'bottom' },
  { action: 'distribute-horizontal', title: 'Distribuir horizontalmente con igual espacio', glyph: 'distribute-x' },
  { action: 'distribute-vertical', title: 'Distribuir verticalmente con igual espacio', glyph: 'distribute-y' },
  { action: 'same-width', title: 'Mismo ancho que el primero', glyph: 'width' },
  { action: 'same-height', title: 'Mismo alto que el primero', glyph: 'height' },
  { action: 'same-size', title: 'Mismo tamaño que el primero', glyph: 'size' },
]

export function MapToolbar({
  filters,
  onChange,
  onFit,
  onArrange,
  selectionCount,
  onMultiNodeAction,
  nodeCount,
  totalCount,
}: {
  filters: MapFilters
  onChange: (f: MapFilters) => void
  onFit: () => void
  onArrange: () => void
  selectionCount: number
  onMultiNodeAction: (action: MultiNodeAction) => void
  nodeCount: number
  totalCount: number
}) {
  const toggleGroup = (g: string) => {
    const all = Object.keys(GROUP_META)
    const onlyThis = filters.groups.length === 1 && filters.groups[0] === g
    onChange({ ...filters, groups: onlyThis ? all : [g] })
  }

  const toggleCountry = (c: CountryCode) => {
    const has = filters.countries.includes(c)
    onChange({
      ...filters,
      countries: has ? filters.countries.filter((x) => x !== c) : [...filters.countries, c],
    })
  }

  const toggleEnvironment = (env: Environment['name']) => {
    const onlyThis = filters.environments.length === 1 && filters.environments[0] === env
    onChange({ ...filters, environments: onlyThis ? [] : [env] })
  }

  return (
    <div className="relative z-10 flex shrink-0 flex-col gap-2.5 border-b border-border bg-background/95 p-4">
      <div className="pointer-events-auto flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={filters.query}
            onChange={(e) => onChange({ ...filters, query: e.target.value })}
            placeholder="Buscar nodo, owner, repo, stack…"
            className="map-toolbar-surface h-9 w-72 pl-8 text-[13px]"
          />
        </div>

        <div className="map-toolbar-surface flex overflow-hidden rounded-md border">
          {DIRECTIONS.map((d) => (
            <button
              key={d.key}
              onClick={() => onChange({ ...filters, direction: d.key })}
              className={cn(
                'px-3 py-2 font-mono text-[10.5px] uppercase tracking-wider transition-colors',
                filters.direction === d.key
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              {d.label}
            </button>
          ))}
        </div>

        <div className="map-toolbar-surface flex items-center gap-2 rounded-md border px-3 py-1.5">
          <GitBranch size={13} className="text-muted-foreground" />
          <Label htmlFor="show-issues" className="cursor-pointer text-[12px]">
            Issues
          </Label>
          <Switch
            id="show-issues"
            checked={filters.showIssues}
            onCheckedChange={(v) => onChange({ ...filters, showIssues: Boolean(v) })}
          />
        </div>

        <Button
          variant={filters.onlyWithIssues ? 'default' : 'outline'}
          size="sm"
          onClick={() => onChange({ ...filters, onlyWithIssues: !filters.onlyWithIssues })}
          className="map-toolbar-surface h-9 data-[variant=default]:!bg-primary data-[variant=default]:!text-primary-foreground"
        >
          <AlertTriangle size={13} />
          Solo con issues
        </Button>

        {selectionCount >= 2 && (
          <div
            className="map-toolbar-surface flex items-center overflow-hidden rounded-md border"
            aria-label="Alinear y redimensionar selección"
          >
            {MULTI_TOOLS.map((tool, index) => (
              <button
                key={tool.action}
                type="button"
                onClick={() => onMultiNodeAction(tool.action)}
                disabled={
                  selectionCount < 3 &&
                  (tool.action === 'distribute-horizontal' || tool.action === 'distribute-vertical')
                }
                title={
                  selectionCount < 3 &&
                  (tool.action === 'distribute-horizontal' || tool.action === 'distribute-vertical')
                    ? `${tool.title} · seleccioná al menos 3 elementos`
                    : tool.title
                }
                className={cn(
                  'flex h-9 w-9 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent',
                  index > 0 && 'border-l border-border',
                )}
              >
                <ToolGlyph kind={tool.glyph} />
              </button>
            ))}
          </div>
        )}

        <Button
          variant="outline"
          size="icon"
          onClick={onArrange}
          title="Ordenar en cuadrícula respetando la posición actual"
          aria-label="Ordenar en cuadrícula"
          className="map-toolbar-surface h-9 w-9"
        >
          <LayoutGrid size={15} />
        </Button>

        <Button
          variant="outline"
          size="icon"
          onClick={onFit}
          title="Encuadrar todo el mapa"
          aria-label="Encuadrar todo el mapa"
          className="map-toolbar-surface h-9 w-9"
        >
          <Maximize2 size={15} />
        </Button>

        <span className="map-toolbar-surface ml-auto rounded-md border px-2.5 py-2 font-mono text-[10.5px] text-muted-foreground">
          {nodeCount}/{totalCount} nodos
        </span>
      </div>

      <div className="pointer-events-auto flex flex-wrap items-center gap-1.5">
        {Object.entries(GROUP_META).map(([key, meta]) => {
          const active = filters.groups.includes(key)
          return (
            <button
              key={key}
              onClick={() => toggleGroup(key)}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] transition-colors',
                active
                  ? 'map-toolbar-surface border'
                  : 'map-toolbar-surface border opacity-60 text-muted-foreground',
              )}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: active ? meta.color : 'var(--muted-foreground)' }}
              />
              {meta.label}
            </button>
          )
        })}

        <div className="mx-1 h-4 w-px bg-border" />

        <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground">
          País
        </span>
        {(Object.keys(COUNTRY_META) as CountryCode[]).map((c) => {
          const active = filters.countries.includes(c)
          return (
            <button
              key={c}
              onClick={() => toggleCountry(c)}
              title={COUNTRY_META[c].label}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] transition-colors',
                active
                  ? 'border-[var(--chart-3)] bg-[color-mix(in_oklab,var(--chart-3)_16%,transparent)]'
                  : 'map-toolbar-surface border text-muted-foreground',
              )}
            >
              <span aria-hidden>{COUNTRY_META[c].flag}</span>
              {c}
            </button>
          )
        })}
        {filters.countries.length > 0 && (
          <button
            onClick={() => onChange({ ...filters, countries: [] })}
            className="rounded-full px-2 py-1 text-[11px] text-muted-foreground underline-offset-2 hover:underline"
          >
            Limpiar
          </button>
        )}

        <div className="mx-1 h-4 w-px bg-border" />

        <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground">
          Ambiente
        </span>
        {(['Desarrollo', 'QA', 'Producción'] as Environment['name'][]).map((env) => {
          const active = filters.environments.includes(env)
          const short = env === 'Desarrollo' ? 'DEV' : env === 'Producción' ? 'PRD' : 'QAS'
          return (
            <button
              key={env}
              onClick={() => toggleEnvironment(env)}
              title={env}
              className={cn(
                'rounded-full border px-2.5 py-1 text-[11.5px] transition-colors',
                active
                  ? 'border-[var(--chart-3)] bg-[color-mix(in_oklab,var(--chart-3)_16%,transparent)] font-semibold text-foreground'
                  : 'map-toolbar-surface border text-muted-foreground',
              )}
            >
              {short}
            </button>
          )
        })}
        {filters.environments.length > 0 && (
          <button
            onClick={() => onChange({ ...filters, environments: [] })}
            className="rounded-full px-2 py-1 text-[11px] text-muted-foreground underline-offset-2 hover:underline"
          >
            Todos
          </button>
        )}
      </div>
    </div>
  )
}
