import type { CSSProperties, ReactNode } from 'react'

interface RubberSegmentItem {
  value: string
  label: ReactNode
  icon?: ReactNode
}

interface RubberSegmentProps {
  items: Array<string | RubberSegmentItem>
  value?: string
  defaultValue?: string
  onChange?: (value: string, index: number) => void
  trackColor?: string
  thumbColor?: string
  textColor?: string
  activeTextColor?: string
  size?: 'sm' | 'md' | 'lg'
  radius?: number
  inset?: number
  equalSlots?: boolean
  stretch?: number
  squash?: number
  speed?: number
  glide?: number
  draggable?: boolean
  disabled?: boolean
  className?: string
  'aria-label'?: string
  style?: CSSProperties
}

declare function RubberSegment(props: RubberSegmentProps): ReactNode

export default RubberSegment
