'use client'

import { Search, Maximize2, GitBranch, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { GROUP_META, COUNTRY_META, type CountryCode } from '@/lib/atlas-types'
import { cn } from '@/lib/utils'

export type MapFilters = {
  query: string
  groups: string[]
  countries: CountryCode[]
  direction: 'todos' | 'extraccion' | 'inyeccion'
  showIssues: boolean
  onlyWithIssues: boolean
}

const DIRECTIONS: { key: MapFilters['direction']; label: string }[] = [
  { key: 'todos', label: 'Todo el flujo' },
  { key: 'extraccion', label: 'Extracción' },
  { key: 'inyeccion', label: 'Inyección' },
]

export function MapToolbar({
  filters,
  onChange,
  onFit,
  nodeCount,
  totalCount,
}: {
  filters: MapFilters
  onChange: (f: MapFilters) => void
  onFit: () => void
  nodeCount: number
  totalCount: number
}) {
  const toggleGroup = (g: string) => {
    const has = filters.groups.includes(g)
    const next = has ? filters.groups.filter((x) => x !== g) : [...filters.groups, g]
    onChange({ ...filters, groups: next.length ? next : filters.groups })
  }

  const toggleCountry = (c: CountryCode) => {
    const has = filters.countries.includes(c)
    onChange({
      ...filters,
      countries: has ? filters.countries.filter((x) => x !== c) : [...filters.countries, c],
    })
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col gap-2.5 p-4">
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
            className="h-9 w-72 border-border bg-card/90 pl-8 text-[13px] backdrop-blur-sm"
          />
        </div>

        <div className="flex overflow-hidden rounded-md border border-border bg-card/90 backdrop-blur-sm">
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

        <div className="flex items-center gap-2 rounded-md border border-border bg-card/90 px-3 py-1.5 backdrop-blur-sm">
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
          className="h-9 bg-card/90 backdrop-blur-sm data-[variant=default]:bg-primary"
        >
          <AlertTriangle size={13} />
          Solo con issues
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={onFit}
          className="h-9 bg-card/90 backdrop-blur-sm"
        >
          <Maximize2 size={13} />
          Encuadrar
        </Button>

        <span className="ml-auto rounded-md border border-border bg-card/90 px-2.5 py-2 font-mono text-[10.5px] text-muted-foreground backdrop-blur-sm">
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
                'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] backdrop-blur-sm transition-all',
                active
                  ? 'border-border bg-card/90'
                  : 'border-transparent bg-card/50 text-muted-foreground opacity-60',
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
                'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] backdrop-blur-sm transition-all',
                active
                  ? 'border-[var(--chart-3)] bg-[color-mix(in_oklab,var(--chart-3)_16%,transparent)]'
                  : 'border-border bg-card/50 text-muted-foreground',
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
      </div>
    </div>
  )
}
