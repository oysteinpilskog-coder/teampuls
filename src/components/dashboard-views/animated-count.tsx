'use client'

import { motion, useMotionValue, useTransform, animate } from 'framer-motion'
import { useEffect, type CSSProperties } from 'react'

interface AnimatedCountProps {
  value: number
  duration?: number
  delay?: number
  className?: string
  style?: CSSProperties
}

export function AnimatedCount({
  value,
  duration = 1.1,
  delay = 0,
  className,
  style,
}: AnimatedCountProps) {
  const motionValue = useMotionValue(0)
  const rounded = useTransform(motionValue, latest => Math.round(latest).toString())

  useEffect(() => {
    const controls = animate(motionValue, value, {
      duration,
      delay,
      ease: [0.16, 1, 0.3, 1],
    })
    return () => controls.stop()
  }, [value, duration, delay, motionValue])

  return (
    <motion.span className={className} style={style}>
      {rounded}
    </motion.span>
  )
}
