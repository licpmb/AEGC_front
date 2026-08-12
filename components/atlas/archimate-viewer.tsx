'use client'

import { X, GitBranch } from 'lucide-react'
import {
  ARCHI_LAYER_META,
  getArchiView,
  type ArchiElement,
  type ArchiView,
} from '@/lib/archimate-data'

const REL_DASH: Record<string, string> = {
  flow: '5 4',
  serving: '',
  realization: '3 3',
  assignment: '',
  composition: '',
  trigger: '',
}

function centerOf(el: ArchiElement) {
  const w = el.w ?? 160
  const h = el.h ?? 60
  return { cx: el.x + w / 2, cy: el.y + h / 2, w, h }
}

function ElementBox({ el }: { el: ArchiElement }) {
  const meta = ARCHI_LAYER_META[el.layer]
  const w = el.w ?? 160
  const h = el.h ?? 60
  return (
    <g>
      <rect
        x={el.x}
        y={el.y}
        width={w}
        height={h}
        rx={6}
        fill={meta.fill}
        stroke="oklch(0.3 0.02 260)"
        strokeWidth={1}
      />
      <text
        x={el.x + 10}
        y={el.y + 18}
        fontSize={8}
        fontFamily="var(--font-mono)"
        fill={meta.text}
        opacity={0.7}
      >
        {el.type}
      </text>
      <text
        x={el.x + w / 2}
        y={el.y + h / 2 + 8}
        fontSize={12}
        fontWeight={600}
        textAnchor="middle"
        fill={meta.text}
      >
        {el.name}
      </text>
    </g>
  )
}

function Relation({ view, source, target, kind, label }: ArchiView['relations'][number] & { view: ArchiView }) {
  const s = view.elements.find((e) => e.id === source)
  const t = view.elements.find((e) => e.id === target)
  if (!s || !t) return null
  const a = centerOf(s)
  const b = centerOf(t)
  const midX = (a.cx + b.cx) / 2
  const midY = (a.cy + b.cy) / 2
  return (
    <g>
      <line
        x1={a.cx}
        y1={a.cy}
        x2={b.cx}
        y2={b.cy}
        stroke="oklch(0.55 0.02 260)"
        strokeWidth={1.5}
        strokeDasharray={REL_DASH[kind] || undefined}
        markerEnd="url(#arrow)"
      />
      {label && (
        <text
          x={midX}
          y={midY - 4}
          fontSize={9}
          textAnchor="middle"
          fill="oklch(0.75 0.02 260)"
          className="[paint-order:stroke]"
          stroke="var(--background)"
          strokeWidth={3}
        >
          {label}
        </text>
      )}
    </g>
  )
}

export function ArchimateViewer({ nodeId, onClose }: { nodeId: string; onClose: () => void }) {
  const view = getArchiView(nodeId)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6" onClick={onClose}>
      <div
        className="flex h-[80vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-3 border-b border-border px-5 py-3">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Visualizador ArchiMate
            </p>
            <h2 className="truncate text-[15px] font-semibold">
              {view ? view.name : 'Sin vista ArchiMate'}
            </h2>
          </div>
          {view && (
            <span className="hidden items-center gap-1.5 rounded-md border border-border px-2 py-1 font-mono text-[10.5px] text-muted-foreground sm:flex">
              <GitBranch size={11} />
              {view.source} · {view.updatedAt}
            </span>
          )}
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </header>

        {view ? (
          <>
            <div className="flex-1 overflow-auto bg-background p-4">
              <svg viewBox="0 0 740 420" className="h-full w-full min-h-[380px]">
                <defs>
                  <marker
                    id="arrow"
                    markerWidth="8"
                    markerHeight="8"
                    refX="7"
                    refY="4"
                    orient="auto"
                  >
                    <path d="M0,0 L8,4 L0,8 Z" fill="oklch(0.55 0.02 260)" />
                  </marker>
                </defs>
                {view.relations.map((r, i) => (
                  <Relation key={i} view={view} {...r} />
                ))}
                {view.elements.map((el) => (
                  <ElementBox key={el.id} el={el} />
                ))}
              </svg>
            </div>
            <footer className="flex flex-wrap items-center gap-4 border-t border-border px-5 py-2.5">
              {Object.values(ARCHI_LAYER_META).map((m) => (
                <span key={m.label} className="flex items-center gap-1.5 text-[11px]">
                  <span
                    className="h-3 w-3 rounded-sm border border-border"
                    style={{ background: m.fill }}
                  />
                  {m.label}
                </span>
              ))}
              <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                render desde .archimate (Open Exchange XML)
              </span>
            </footer>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
            <p className="text-[14px] font-medium">Este desarrollo no tiene modelo ArchiMate cargado.</p>
            <p className="max-w-sm text-[13px] text-muted-foreground">
              Al conectar el repositorio de arquitectura en GitLab, el visualizador levantará
              automáticamente el archivo <span className="font-mono">.archimate</span> exportado
              desde Archi.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
