'use client'

import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from 'motion/react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import './RubberSegment.css'

const EASE_OUT = [0.23, 1, 0.32, 1]
const UI_SPRING = { type: 'spring', duration: 0.3, bounce: 0 }
const MOMENTUM_SPRING = { type: 'spring', duration: 0.4, bounce: 0.2 }
const RELAX_SPRING = { type: 'spring', duration: 0.16, bounce: 0 }
const SIZES = {
  sm: { height: 28, font: 12, pad: 10, min: 36 },
  md: { height: 36, font: 13, pad: 14, min: 44 },
  lg: { height: 44, font: 14, pad: 18, min: 48 },
}
const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const rubber = (over, dim) =>
  (over * dim * 0.55) / (dim + 0.55 * Math.abs(over))
const nearestSlot = (slots, x) =>
  slots.reduce(
    (best, slot, index) =>
      Math.abs((slot.l + slot.r) / 2 - x) <
      Math.abs((slots[best].l + slots[best].r) / 2 - x)
        ? index
        : best,
    0,
  )

export default function RubberSegment({
  items,
  value,
  defaultValue,
  onChange,
  trackColor = '#27272a',
  thumbColor = '#fafafa',
  textColor = '#fafafa',
  activeTextColor = '#18181b',
  size = 'md',
  radius = 10,
  inset = 3,
  equalSlots = true,
  stretch = 100,
  squash = 3,
  speed = 1,
  draggable = true,
  disabled = false,
  className = '',
  'aria-label': ariaLabel = 'Segmented control',
}) {
  const list = items.map((item) =>
    typeof item === 'string' ? { value: item, label: item } : item,
  )
  const [inner, setInner] = useState(defaultValue ?? list[0]?.value)
  const current = value ?? inner
  const index = Math.max(
    0,
    list.findIndex((item) => item.value === current),
  )
  const reduce = useReducedMotion()
  const trackRef = useRef(null)
  const itemRefs = useRef([])
  const slots = useRef([])
  const box = useRef(null)
  const committed = useRef(index)
  const drag = useRef(null)
  const edgeL = useMotionValue(0)
  const edgeR = useMotionValue(0)
  const innerW = useMotionValue(0)
  const thumbRadius = Math.max(0, radius - inset)
  const clipPath = useTransform(
    () =>
      `inset(0 ${Math.max(0, innerW.get() - edgeR.get())}px 0 ${Math.max(0, edgeL.get())}px round ${thumbRadius}px)`,
  )
  const time = (seconds) => seconds / speed

  const jumpTo = (nextIndex) => {
    const slot = slots.current[nextIndex]
    if (!slot) return
    edgeL.jump(slot.l)
    edgeR.jump(slot.r)
  }
  const measure = () => {
    const track = trackRef.current
    if (!track) return
    const rect = track.getBoundingClientRect()
    box.current = rect
    slots.current = list.map((_, itemIndex) => {
      const item = itemRefs.current[itemIndex]
      const itemRect = item?.getBoundingClientRect()
      return itemRect
        ? {
            l: itemRect.left - rect.left - inset,
            r: itemRect.right - rect.left - inset,
          }
        : { l: 0, r: 0 }
    })
    innerW.set(rect.width - inset * 2)
    jumpTo(committed.current)
  }
  const listKey = list.map((item) => item.value).join('|')
  useLayoutEffect(() => {
    measure()
    const observer = new ResizeObserver(measure)
    if (trackRef.current) observer.observe(trackRef.current)
    document.fonts?.ready.then(measure)
    return () => observer.disconnect()
  }, [listKey, size, inset, equalSlots])
  useEffect(() => {
    if (!drag.current && committed.current !== index) {
      committed.current = index
      jumpTo(index)
    }
  })

  const commit = (nextIndex) => {
    committed.current = nextIndex
    if (nextIndex === index) return
    if (value === undefined) setInner(list[nextIndex].value)
    onChange?.(list[nextIndex].value, nextIndex)
  }
  const land = (to, velocity = 0, momentum = false, withSquash = true) => {
    const target = slots.current[to]
    if (!target) return
    const direction =
      Math.sign((target.l + target.r) / 2 - (edgeL.get() + edgeR.get()) / 2) ||
      1
    const [lead, leadTarget, trail, trailTarget] =
      direction > 0
        ? [edgeR, target.r, edgeL, target.l]
        : [edgeL, target.l, edgeR, target.r]
    const spring = momentum ? MOMENTUM_SPRING : UI_SPRING
    animate(lead, leadTarget, {
      ...spring,
      duration: time(momentum ? 0.4 : 0.3),
      velocity,
    })
    animate(
      trail,
      withSquash && squash > 0 ? trailTarget + direction * squash : trailTarget,
      { ...spring, duration: time(0.3), velocity },
    ).then(() => {
      if (withSquash && squash > 0)
        animate(trail, trailTarget, { ...RELAX_SPRING, duration: time(0.16) })
    })
  }
  const travel = (from, to) => {
    const start = slots.current[from]
    const target = slots.current[to]
    if (!start || !target) return
    if (reduce) return jumpTo(to)
    const amount = stretch / 100
    const tween = { duration: time(0.19), ease: EASE_OUT }
    animate(
      edgeL,
      target.l + (Math.min(start.l, target.l) - target.l) * amount,
      tween,
    )
    animate(
      edgeR,
      target.r + (Math.max(start.r, target.r) - target.r) * amount,
      tween,
    )
    window.setTimeout(() => land(to, 0, false, true), time(0.15) * 1000)
  }
  const localX = (event) => event.clientX - (box.current?.left ?? 0) - inset
  const handlePointerDown = (event, itemIndex) => {
    if (disabled || drag.current || event.button !== 0) return
    box.current = trackRef.current?.getBoundingClientRect()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    const x = localX(event)
    const onThumb = draggable && x >= edgeL.get() && x <= edgeR.get()
    drag.current = {
      id: event.pointerId,
      x0: x,
      slot: itemIndex,
      onThumb,
      live: false,
      offset: 0,
      width: 0,
    }
    if (!onThumb && !reduce) event.currentTarget.dataset.pressed = ''
  }
  const handlePointerMove = (event) => {
    const currentDrag = drag.current
    if (
      !currentDrag ||
      event.pointerId !== currentDrag.id ||
      !currentDrag.onThumb
    )
      return
    const x = localX(event)
    if (!currentDrag.live) {
      if (Math.abs(x - currentDrag.x0) < 4) return
      currentDrag.live = true
      currentDrag.offset = x - edgeL.get()
      currentDrag.width = edgeR.get() - edgeL.get()
      trackRef.current.dataset.held = ''
    }
    const left = x - currentDrag.offset
    const maxLeft = innerW.get() - currentDrag.width
    if (left < 0) {
      edgeL.set(0)
      edgeR.set(currentDrag.width - rubber(-left, currentDrag.width))
    } else if (left > maxLeft) {
      edgeR.set(innerW.get())
      edgeL.set(maxLeft + rubber(left - maxLeft, currentDrag.width))
    } else {
      edgeL.set(left)
      edgeR.set(left + currentDrag.width)
    }
  }
  const release = () => {
    const currentDrag = drag.current
    drag.current = null
    delete trackRef.current?.dataset.held
    delete itemRefs.current[currentDrag.slot]?.dataset.pressed
    return currentDrag
  }
  const handlePointerUp = (event) => {
    const currentDrag = drag.current
    if (!currentDrag || event.pointerId !== currentDrag.id) return
    release()
    if (!currentDrag.live) {
      if (
        Math.abs(localX(event) - currentDrag.x0) <= 10 &&
        currentDrag.slot !== committed.current
      ) {
        const from = committed.current
        commit(currentDrag.slot)
        travel(from, currentDrag.slot)
      }
      return
    }
    const to = nearestSlot(slots.current, (edgeL.get() + edgeR.get()) / 2)
    commit(to)
    land(to)
  }
  const handleKeyDown = (event) => {
    const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }
    const offset = keys[event.key]
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? list.length - 1
          : offset === undefined
            ? null
            : clamp(index + offset, 0, list.length - 1)
    if (next === null) return
    event.preventDefault()
    if (next !== index) {
      commit(next)
      jumpTo(next)
      itemRefs.current[next]?.focus()
    }
  }
  const preset = SIZES[size] || SIZES.md
  return (
    <div
      ref={trackRef}
      role="radiogroup"
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      data-equal={equalSlots ? '' : undefined}
      data-draggable={draggable && !disabled ? '' : undefined}
      className={`rubber-segment${className ? ` ${className}` : ''}`}
      style={{
        '--rs-track': trackColor,
        '--rs-thumb': thumbColor,
        '--rs-ink': textColor,
        '--rs-ink-active': activeTextColor,
        '--rs-radius': `${radius}px`,
        '--rs-inset': `${inset}px`,
        '--rs-thumb-radius': `${thumbRadius}px`,
        '--rs-h': `${preset.height}px`,
        '--rs-font': `${preset.font}px`,
        '--rs-pad': `${preset.pad}px`,
        '--rs-min': `${preset.min}px`,
      }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => {
        if (drag.current) {
          const currentDrag = release()
          land(committed.current, 0, false, currentDrag.live)
        }
      }}
    >
      {list.map((item, itemIndex) => (
        <button
          key={item.value}
          ref={(element) => {
            itemRefs.current[itemIndex] = element
          }}
          type="button"
          role="radio"
          aria-checked={itemIndex === index}
          tabIndex={itemIndex === index ? 0 : -1}
          disabled={disabled}
          className="rubber-segment__item"
          onPointerDown={(event) => handlePointerDown(event, itemIndex)}
          onKeyDown={handleKeyDown}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
      <motion.div
        className="rubber-segment__thumb"
        aria-hidden="true"
        style={{ clipPath }}
      >
        {list.map((item) => (
          <span
            key={item.value}
            className="rubber-segment__item rubber-segment__copy"
          >
            {item.icon}
            {item.label}
          </span>
        ))}
      </motion.div>
    </div>
  )
}
