'use client'

import { Handle, Position, NodeResizer, NodeToolbar, type NodeProps } from '@xyflow/react'
import {
  Database,
  Server,
  GitBranch,
  Boxes,
  Globe,
  Shield,
  Code2,
  Layers,
  Workflow,
  Wrench,
  DownloadCloud,
  Radio,
  ChevronDown,
  ChevronRight,
  MoveHorizontal,
  MoveVertical,
} from 'lucide-react'
import type { AtlasNode, NodeKind } from '@/lib/atlas-types'
import { KIND_META, COUNTRY_META } from '@/lib/atlas-types'
import { cn } from '@/lib/utils'

const ICONS: Record<NodeKind, typeof Server> = {
  erp: Server,
  dispatcher: Shield,
  middleware: Workflow,
  external: Globe,
  interface: Boxes,
  front: Layers,
  gateway: Radio,
  api: Code2,
  endpoint: Code2,
  datastore: Database,
  loader: DownloadCloud,
  builder: Wrench,
}

export type AtlasFlowNodeData = {
  node: AtlasNode
  openIssues: number
  blocking: number
  dimmed: boolean
  focused: boolean
  showIssues: boolean
  orientation?: 'h' | 'v'
  hasChildren?: boolean
  collapsed?: boolean
  hiddenChildren?: number
  onToggleCollapse?: (id: string) => void
  onSetOrientation?: (id: string, o: 'h' | 'v') => void
}

export function AtlasFlowNode({ data, selected }: NodeProps) {
  const {
    node,
    openIssues,
    blocking,
    dimmed,
    focused,
    showIssues,
    orientation = 'h',
    hasChildren,
    collapsed,
    hiddenChildren,
    onToggleCollapse,
    onSetOrientation,
  } = data as unknown as AtlasFlowNodeData
  if (!node) return null
  const meta = KIND_META[node.kind]
  const Icon = ICONS[node.kind]
  const isHub = node.kind === 'erp' || node.kind === 'middleware'
  const country = node.country ? COUNTRY_META[node.country] : null

  const heat =
    !showIssues || openIssues === 0
      ? null
      : blocking > 0
        ? { ring: 'var(--destructive)', glow: '0 0 0 1px var(--destructive), 0 0 28px -6px var(--destructive)' }
        : openIssues >= 4
          ? { ring: 'var(--chart-1)', glow: '0 0 0 1px var(--chart-1), 0 0 24px -8px var(--chart-1)' }
          : { ring: 'var(--chart-4)', glow: '0 0 0 1px var(--chart-4)' }

  return (
    <>
      <NodeResizer
        isVisible={Boolean(selected)}
        minWidth={isHub ? 200 : 160}
        minHeight={52}
        lineClassName="!border-[var(--chart-3)]"
        handleClassName="!h-2 !w-2 !rounded-sm !border !border-[var(--chart-3)] !bg-background"
      />
      <NodeToolbar isVisible={Boolean(selected)} position={Position.Top} offset={10}>
        <div className="flex items-center gap-0.5 rounded-md border border-border bg-popover p-0.5 shadow-lg">
          <span className="px-1.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
            Conexión
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onSetOrientation?.(node.id, 'h')
            }}
            title="Conectar por los lados (horizontal)"
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded',
              orientation === 'h' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-accent',
            )}
          >
            <MoveHorizontal size={13} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onSetOrientation?.(node.id, 'v')
            }}
            title="Conectar por arriba/abajo (vertical)"
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded',
              orientation === 'v' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-accent',
            )}
          >
            <MoveVertical size={13} />
          </button>
        </div>
      </NodeToolbar>
      <div
        className={cn(
          'group relative flex h-full w-full items-center gap-3 rounded-lg border bg-card/90 backdrop-blur-sm transition-[opacity,transform,box-shadow] duration-300',
          isHub ? 'px-4 py-3.5 min-w-56' : 'px-3 py-2.5 min-w-44',
          dimmed && 'opacity-20 saturate-0',
          (selected || focused) && 'scale-[1.02]',
        )}
        style={{
          borderColor: selected || focused ? meta.color : undefined,
          boxShadow:
            selected || focused
              ? `0 0 0 1px ${meta.color}, 0 0 40px -10px ${meta.color}`
              : (heat?.glow ?? undefined),
        }}
      >
        {/* Handles en los 4 lados para poder reordenar las conexiones manualmente. */}
        {(
          [
            ['top', Position.Top],
            ['right', Position.Right],
            ['bottom', Position.Bottom],
            ['left', Position.Left],
          ] as const
        ).map(([side, pos]) => (
          <span key={side}>
            <Handle
              id={`t-${side}`}
              type="target"
              position={pos}
              className="atlas-handle"
            />
            <Handle
              id={`s-${side}`}
              type="source"
              position={pos}
              className="atlas-handle"
            />
          </span>
        ))}

        <span
          className="flex shrink-0 items-center justify-center rounded-md"
          style={{
            width: isHub ? 34 : 28,
            height: isHub ? 34 : 28,
            background: `color-mix(in oklab, ${meta.color} 18%, transparent)`,
            color: meta.color,
          }}
        >
          <Icon size={isHub ? 18 : 15} strokeWidth={2} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p
              className={cn(
                'truncate font-semibold leading-tight',
                isHub ? 'text-[15px]' : 'text-[13px]',
              )}
            >
              {node.label}
            </p>
            {country && (
              <span
                title={country.label}
                className="shrink-0 rounded-sm border border-border px-1 py-px font-mono text-[9px] font-semibold tracking-wide text-muted-foreground"
              >
                {country.flag} {node.country}
              </span>
            )}
            {node.status !== 'prod' && (
              <span className="shrink-0 rounded-sm bg-secondary px-1 py-px font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
                {node.status}
              </span>
            )}
          </div>
          <p className="truncate font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {meta.label}
            {node.gitlab ? ' · git' : ''}
          </p>
        </div>

        {showIssues && openIssues > 0 && (
          <span
            className="flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 font-mono text-[10px] font-semibold"
            style={{
              background: `color-mix(in oklab, ${heat?.ring} 22%, transparent)`,
              color: heat?.ring,
            }}
            title={`${openIssues} issues abiertos${blocking ? ` · ${blocking} bloqueante(s)` : ''}`}
          >
            <GitBranch size={10} />
            {openIssues}
          </span>
        )}

        {hasChildren && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onToggleCollapse?.(node.id)
            }}
            title={collapsed ? 'Expandir hijos' : 'Colapsar hijos'}
            className="flex shrink-0 items-center gap-0.5 rounded-md border border-border bg-secondary px-1.5 py-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
            {collapsed && hiddenChildren ? (
              <span className="font-mono text-[10px] font-semibold">{hiddenChildren}</span>
            ) : null}
          </button>
        )}
      </div>
    </>
  )
}
