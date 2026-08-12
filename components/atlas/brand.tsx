import Image from 'next/image'
import { cn } from '@/lib/utils'

/**
 * Marca Grupo Cepas · Arquitectura.
 * El isotipo es negro sobre transparente, por eso va sobre una placa clara
 * para que lea bien en el tema oscuro de la app.
 */
export function Brand({
  size = 'md',
  showText = true,
  className,
}: {
  size?: 'sm' | 'md' | 'lg'
  showText?: boolean
  className?: string
}) {
  const dim = size === 'lg' ? 44 : size === 'md' ? 32 : 26
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <span
        className="flex shrink-0 items-center justify-center rounded-md bg-white"
        style={{ width: dim, height: dim, padding: dim * 0.14 }}
      >
        <Image
          src="/grupo-cepas-logo.png"
          alt="Grupo Cepas"
          width={dim}
          height={dim}
          className="h-full w-full object-contain"
          priority
        />
      </span>
      {showText && (
        <span className="flex flex-col leading-none">
          <span
            className={cn(
              'font-semibold tracking-tight',
              size === 'lg' ? 'text-[15px]' : 'text-[13px]',
            )}
          >
            Grupo Cepas
          </span>
          <span className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Arquitectura
          </span>
        </span>
      )}
    </div>
  )
}
