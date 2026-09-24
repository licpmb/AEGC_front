'use client'

import { memo } from 'react'
import { Handle, Position, NodeResizer, type NodeProps } from '@xyflow/react'
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
} from 'lucide-react'
import type { AtlasNode, NodeKind } from '@/lib/atlas-types'
import { KIND_META, COUNTRY_META } from '@/lib/atlas-types'
import { cn } from '@/lib/utils'

const ICONS: Record<NodeKind, typeof Server> = {
  erp: Server,
  dispatcher: Shield,
  middleware: Workflow,
  external: Globe,
  server: Server,
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
  hasChildren?: boolean
  collapsed?: boolean
  hiddenChildren?: number
  onToggleCollapse?: (id: string) => void
  onBeforeResize?: () => void
  onAfterResize?: () => void
}

function AtlasFlowNodeComponent({ data, selected }: NodeProps) {
  const {
    node,
    openIssues,
    blocking,
    dimmed,
    focused,
    showIssues,
    hasChildren,
    collapsed,
    hiddenChildren,
    onToggleCollapse,
    onBeforeResize,
    onAfterResize,
  } = data as unknown as AtlasFlowNodeData
  if (!node) return null
  const meta = KIND_META[node.kind]
  const Icon = ICONS[node.kind]
  const isHub = node.kind === 'erp' || node.kind === 'middleware'
  const country = node.country ? COUNTRY_META[node.country] : null
  const group = meta.group
  const surface = {
    background: `var(--map-node-${group}-bg)`,
    border: `var(--map-node-${group}-border)`,
    title: 'var(--map-node-title)',
    meta: 'var(--map-node-meta)',
    badgeBg: 'var(--map-node-badge-bg)',
    badgeBorder: 'var(--map-node-badge-border)',
  }

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
        onResizeStart={() => onBeforeResize?.()}
        onResizeEnd={() => onAfterResize?.()}
        minWidth={96}
        minHeight={36}
        lineClassName="!border-[var(--chart-3)]"
        handleClassName="!h-2 !w-2 !rounded-sm !border !border-[var(--chart-3)] !bg-background"
      />
      <div
        className={cn(
          'group relative flex h-full w-full items-center gap-3 overflow-hidden rounded-lg border transition-[opacity,border-color] duration-150',
          isHub ? 'px-4 py-3.5' : 'px-3 py-2.5',
          dimmed && 'opacity-20 saturate-0',
        )}
        style={{
          background: surface.background,
          color: surface.title,
          borderColor: selected || focused ? meta.color : heat?.ring ?? surface.border,
          boxShadow:
            selected || focused
              ? `0 0 0 1px ${meta.color}`
              : heat?.glow ?? 'none',
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
            background: `color-mix(in oklab, ${meta.color} 14%, white 18%)`,
            color: `color-mix(in oklab, ${meta.color} 86%, #2b3440)`,
          }}
        >
          <Icon size={isHub ? 18 : 15} strokeWidth={2} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p
              className={cn(
                'truncate font-bold leading-tight',
                isHub ? 'text-[15px]' : 'text-[13px]',
              )}
              style={{ color: surface.title }}
            >
              {node.label}
            </p>
            {country && (
              <span
                title={country.label}
                className="shrink-0 rounded-sm border px-1 py-px font-mono text-[9px] font-semibold tracking-wide"
                style={{
                  color: surface.meta,
                  background: surface.badgeBg,
                  borderColor: surface.badgeBorder,
                }}
              >
                {country.flag} {node.country}
              </span>
            )}
            {node.status !== 'prod' && (
              <span
                className="shrink-0 rounded-sm border px-1 py-px font-mono text-[9px] font-semibold uppercase tracking-wide"
                style={{
                  color: surface.meta,
                  background: surface.badgeBg,
                  borderColor: surface.badgeBorder,
                }}
              >
                {node.status}
              </span>
            )}
          </div>
          <p
            className="truncate font-mono text-[10px] font-medium uppercase tracking-wider"
            style={{ color: surface.meta }}
          >
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
            className="flex shrink-0 items-center gap-0.5 rounded-md border px-1.5 py-1 transition-colors hover:brightness-95"
            style={{
              color: surface.meta,
              background: surface.badgeBg,
              borderColor: surface.badgeBorder,
            }}
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

export const AtlasFlowNode = memo(AtlasFlowNodeComponent)
