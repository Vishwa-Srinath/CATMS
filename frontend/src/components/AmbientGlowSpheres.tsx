import { useEffect, useState, useRef, useMemo } from 'react'
import type { Role } from '../types'

export interface AmbientGlowSpheresProps {
  /**
   * The currently active role or portal theme.
   * Modulates the primary ambient palette to match role accents.
   */
  role?: Role | string
  /**
   * Enable gentle mouse parallax responsiveness.
   * Defaults to true.
   */
  interactive?: boolean
  /**
   * Overall opacity multiplier ('subtle' | 'medium' | 'vibrant').
   * Defaults to 'medium'.
   */
  intensity?: 'subtle' | 'medium' | 'vibrant'
  /**
   * Optional additional CSS classes for the container.
   */
  className?: string
}

interface SphereConfig {
  id: string
  // Initial positioning covering different areas of the screen
  initialStyle: React.CSSProperties
  sizeClass: string
  // Base color mixing with portal accent
  colorGradient: string
  // Animation class & duration
  animationName: string
  animationDuration: string
  // Parallax sensitivity multiplier
  parallaxFactor: number
  opacityClass: string
}

export function AmbientGlowSpheres({
  role = 'Receptionist',
  interactive = true,
  intensity = 'medium',
  className = '',
}: AmbientGlowSpheresProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [mouseOffset, setMouseOffset] = useState({ x: 0, y: 0 })
  const rafRef = useRef<number | null>(null)
  const targetOffsetRef = useRef({ x: 0, y: 0 })

  // Intensity map for master opacity
  const opacityMultiplier = useMemo(() => {
    switch (intensity) {
      case 'subtle':
        return 0.7
      case 'vibrant':
        return 1.3
      default:
        return 1.0
    }
  }, [intensity])

  // Mouse parallax tracking with smooth lerp
  useEffect(() => {
    if (!interactive || typeof window === 'undefined') return

    const handleMouseMove = (event: MouseEvent) => {
      // Normalize mouse coordinates around center (-1 to 1)
      const x = (event.clientX / window.innerWidth - 0.5) * 2
      const y = (event.clientY / window.innerHeight - 0.5) * 2
      targetOffsetRef.current = { x, y }
    }

    // Animation frame loop for silky smooth dampening
    let isRunning = true
    const animate = () => {
      if (!isRunning) return

      setMouseOffset((current) => {
        const dx = targetOffsetRef.current.x - current.x
        const dy = targetOffsetRef.current.y - current.y
        // Lerp damping factor
        if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
          return current
        }
        return {
          x: current.x + dx * 0.05,
          y: current.y + dy * 0.05,
        }
      })

      rafRef.current = requestAnimationFrame(animate)
    }

    window.addEventListener('mousemove', handleMouseMove, { passive: true })
    rafRef.current = requestAnimationFrame(animate)

    return () => {
      isRunning = false
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      window.removeEventListener('mousemove', handleMouseMove)
    }
  }, [interactive])

  // Role theme accent: Harbor Blue (#3B6EA5) across all roles as requested
  const roleAccentColor = useMemo(() => {
    // All roles unified to Receptionist identity (Harbor Blue)
    return role ? '#3B6EA5' : '#3B6EA5'
  }, [role])

  // 6 Glowing spheres strategically distributed to cover all regions in Harbor Blue theme:
  // - Top-Left (drifts across upper quadrant)
  // - Top-Right (drifts downward and inwards)
  // - Center-Stage (wanders through middle canvas)
  // - Bottom-Right (drifts across lower diagonal)
  // - Bottom-Left (drifts upwards and across)
  // - Mid-Right (drifts horizontally across center-right)
  const spheres: SphereConfig[] = useMemo(
    () => [
      {
        id: 'sphere-top-left',
        initialStyle: {
          top: '-14%',
          left: '-10%',
        },
        sizeClass: 'w-[420px] h-[420px] sm:w-[540px] sm:h-[540px] lg:w-[640px] lg:h-[640px]',
        colorGradient: `radial-gradient(circle at 40% 40%, color-mix(in srgb, ${roleAccentColor} 55%, #2D9CCB) 0%, color-mix(in srgb, var(--portal-accent) 30%, #2D9CCB) 50%, transparent 75%)`,
        animationName: 'ambient-drift-1',
        animationDuration: '24s',
        parallaxFactor: 35,
        opacityClass: 'opacity-45',
      },
      {
        id: 'sphere-top-right',
        initialStyle: {
          top: '-8%',
          right: '-12%',
        },
        sizeClass: 'w-[380px] h-[380px] sm:w-[480px] sm:h-[480px] lg:w-[580px] lg:h-[580px]',
        colorGradient: `radial-gradient(circle at 50% 50%, color-mix(in srgb, ${roleAccentColor} 60%, #1E77B8) 0%, color-mix(in srgb, var(--portal-accent) 35%, #3B6EA5) 55%, transparent 75%)`,
        animationName: 'ambient-drift-2',
        animationDuration: '29s',
        parallaxFactor: -40,
        opacityClass: 'opacity-40',
      },
      {
        id: 'sphere-center',
        initialStyle: {
          top: '30%',
          left: '35%',
        },
        sizeClass: 'w-[460px] h-[460px] sm:w-[560px] sm:h-[560px] lg:w-[680px] lg:h-[680px]',
        colorGradient: `radial-gradient(circle at 45% 45%, color-mix(in srgb, ${roleAccentColor} 50%, #284F79) 0%, color-mix(in srgb, var(--brand-sync, #2D9CCB) 25%, transparent) 60%, transparent 80%)`,
        animationName: 'ambient-drift-5',
        animationDuration: '34s',
        parallaxFactor: 20,
        opacityClass: 'opacity-35',
      },
      {
        id: 'sphere-bottom-right',
        initialStyle: {
          bottom: '-16%',
          right: '-10%',
        },
        sizeClass: 'w-[440px] h-[440px] sm:w-[520px] sm:h-[520px] lg:w-[640px] lg:h-[640px]',
        colorGradient: `radial-gradient(circle at 55% 55%, color-mix(in srgb, ${roleAccentColor} 65%, #3B6EA5) 0%, color-mix(in srgb, var(--portal-accent) 35%, #1E77B8) 55%, transparent 75%)`,
        animationName: 'ambient-drift-4',
        animationDuration: '27s',
        parallaxFactor: -30,
        opacityClass: 'opacity-40',
      },
      {
        id: 'sphere-bottom-left',
        initialStyle: {
          bottom: '-14%',
          left: '-8%',
        },
        sizeClass: 'w-[400px] h-[400px] sm:w-[500px] sm:h-[500px] lg:w-[600px] lg:h-[600px]',
        colorGradient: `radial-gradient(circle at 45% 50%, color-mix(in srgb, ${roleAccentColor} 50%, #2D9CCB) 0%, color-mix(in srgb, var(--portal-accent) 25%, #1E77B8) 55%, transparent 75%)`,
        animationName: 'ambient-drift-3',
        animationDuration: '32s',
        parallaxFactor: 25,
        opacityClass: 'opacity-35',
      },
      {
        id: 'sphere-mid-float',
        initialStyle: {
          top: '52%',
          right: '18%',
        },
        sizeClass: 'w-[340px] h-[340px] sm:w-[440px] sm:h-[440px] lg:w-[500px] lg:h-[500px]',
        colorGradient: `radial-gradient(circle at 50% 50%, color-mix(in srgb, ${roleAccentColor} 55%, #5B94A8) 0%, color-mix(in srgb, var(--portal-accent) 20%, transparent) 60%, transparent 80%)`,
        animationName: 'ambient-drift-6',
        animationDuration: '22s',
        parallaxFactor: -18,
        opacityClass: 'opacity-30',
      },
    ],
    []
  )

  return (
    <div
      ref={containerRef}
      className={`pointer-events-none fixed inset-0 overflow-hidden select-none z-0 ${className}`}
      aria-hidden="true"
    >
      {spheres.map((sphere) => {
        // Compute interactive parallax offset
        const parallaxX = mouseOffset.x * sphere.parallaxFactor
        const parallaxY = mouseOffset.y * sphere.parallaxFactor

        return (
          <div
            key={sphere.id}
            className="absolute transition-transform duration-300 ease-out will-change-transform"
            style={{
              ...sphere.initialStyle,
              transform: `translate3d(${parallaxX}px, ${parallaxY}px, 0)`,
            }}
          >
            <div
              className={`rounded-full blur-[85px] sm:blur-[105px] lg:blur-[125px] transition-[background,opacity] duration-1000 ease-out will-change-transform ${sphere.sizeClass} ${sphere.opacityClass}`}
              style={{
                background: sphere.colorGradient,
                opacity: (parseFloat(sphere.opacityClass.replace('opacity-', '')) / 100) * opacityMultiplier,
                animation: `${sphere.animationName} ${sphere.animationDuration} cubic-bezier(0.42, 0, 0.58, 1) infinite alternate`,
              }}
            />
          </div>
        )
      })}
    </div>
  )
}

export default AmbientGlowSpheres
