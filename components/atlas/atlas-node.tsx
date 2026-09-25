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
  platform: Layers,
  dispatcher: Shield,
  middleware: Workflow,
  external: Globe,
  server: Server,
  interface: Boxes,
  front: Layers,
  gateway: Radio,
  api: Code2,
  microservice: Boxes,
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
  const isGroup = node.kind === 'platform'
  const isHub = node.kind === 'erp' || node.kind === 'middleware'
  const country = node.country ? COUNTRY_META[node.country] : null
  const environmentBadges = Array.from(
    new Map(
      (node.environments ?? []).map((env) => [env.name, env]),
    ).values(),
  )
    .map((env) => ({
      name: env.name,
      status: env.status,
      server: env.server,
      url: env.url,
      code:
        env.name === 'Desarrollo'
          ? 'DEV'
          : env.name === 'QA'
            ? 'QAS'
            : env.name === 'Producción'
              ? 'PRD'
              : 'STG',
    }))
    .sort((a, b) => ['DEV', 'QAS', 'STG', 'PRD'].indexOf(a.code) - ['DEV', 'QAS', 'STG', 'PRD'].indexOf(b.code))

  const environmentStatusStyle = {
    ok: {
      color: 'var(--chart-4)',
      background: 'color-mix(in oklab, var(--chart-4) 14%, var(--map-node-badge-bg))',
      borderColor: 'color-mix(in oklab, var(--chart-4) 55%, var(--map-node-badge-border))',
      label: 'OK',
    },
    degradado: {
      color: 'var(--chart-1)',
      background: 'color-mix(in oklab, var(--chart-1) 14%, var(--map-node-badge-bg))',
      borderColor: 'color-mix(in oklab, var(--chart-1) 55%, var(--map-node-badge-border))',
      label: 'Degradado',
    },
    caido: {
      color: 'var(--destructive)',
      background: 'color-mix(in oklab, var(--destructive) 14%, var(--map-node-badge-bg))',
      borderColor: 'color-mix(in oklab, var(--destructive) 55%, var(--map-node-badge-border))',
      label: 'Caído',
    },
  } as const
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

  if (isGroup) {
    return (
      <>
        <NodeResizer
          isVisible={Boolean(selected)}
          onResizeStart={() => onBeforeResize?.()}
          onResizeEnd={() => onAfterResize?.()}
          minWidth={260}
          minHeight={220}
          lineClassName="!border-[var(--chart-2)]"
          handleClassName="!h-2 !w-2 !rounded-sm !border !border-[var(--chart-2)] !bg-background"
        />
        <div
          className={cn(
            'relative h-full w-full overflow-visible rounded-xl border-2 border-dashed transition-[opacity,border-color] duration-150',
            dimmed && 'opacity-20 saturate-0',
          )}
          style={{
            background: 'color-mix(in oklab, var(--map-node-plataforma-bg) 42%, transparent)',
            borderColor: selected || focused ? meta.color : 'color-mix(in oklab, var(--map-node-plataforma-border) 70%, transparent)',
            boxShadow: selected || focused ? `0 0 0 1px ${meta.color}` : 'none',
          }}
        >
          <div
            className="absolute left-3 top-3 flex items-center gap-2 rounded-md border px-2.5 py-1.5"
            style={{
              background: 'var(--background)',
              borderColor: 'var(--map-node-plataforma-border)',
            }}
          >
            <Layers size={14} style={{ color: meta.color }} />
            <div>
              <p className="text-[12px] font-bold leading-tight" style={{ color: surface.title }}>
                {node.label}
              </p>
              <p className="font-mono text-[9px] uppercase tracking-wider" style={{ color: surface.meta }}>
                Agrupador lógico · no es un hop
              </p>
            </div>
          </div>
        </div>
      </>
    )
  }

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
        ).flatMap(([side, pos]) => [
          <Handle
            key={`t-${side}`}
            id={`t-${side}`}
            type="target"
            position={pos}
            className="atlas-handle"
          />,
          <Handle
            key={`s-${side}`}
            id={`s-${side}`}
            type="source"
            position={pos}
            className="atlas-handle"
          />,
        ])}

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
            {environmentBadges.map((env) => {
              const statusStyle = environmentStatusStyle[env.status]
              const tooltip = [
                env.name,
                statusStyle.label,
                env.server || null,
                env.url || null,
              ].filter(Boolean).join(' · ')

              return (
                <span
                  key={env.code}
                  title={tooltip}
                  className="inline-flex shrink-0 items-center gap-1 rounded-sm border px-1 py-px font-mono text-[9px] font-semibold uppercase tracking-wide"
                  style={{
                    color: statusStyle.color,
                    background: statusStyle.background,
                    borderColor: statusStyle.borderColor,
                  }}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: statusStyle.color }}
                    aria-hidden="true"
                  />
                  {env.code}
                </span>
              )
            })}
            {environmentBadges.length === 0 && node.status !== 'prod' && (
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
