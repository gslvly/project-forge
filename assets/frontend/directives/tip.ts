import { TipSlot, type ITipContent } from '@/utils/tip-render'

type IEl = HTMLElement & {
  tooltip: HTMLElement | null
  /**tooltip 内容的挂载位，负责 VNode 内容的创建与卸载 */
  tipSlot: TipSlot | null
  /**删除tooltip的延时 */
  removeTimeout: number | null
  /**延迟添加leaving */
  addLeavingTimeout: number | null
  /**内容 */
  tips: ITipContent
  /**延迟显示的延迟 */
  delayShowTimeout: number | null
  stopRefreshPos?: () => void
  refreshShow: (el: IEl) => void
}
type ITimeoutKey = 'removeTimeout' | 'addLeavingTimeout' | 'delayShowTimeout'
type IValue = ITipContent | Promise<ITipContent>
type IBinding = { value: IValue; arg?: 'noDelay'; modifiers: { local?: boolean } }
type IPosTopBottom = 'top' | 'top-start' | 'top-end' | 'bottom' | 'bottom-start' | 'bottom-end'
type IPosLeftRight = 'left' | 'left-start' | 'left-end' | 'right' | 'right-start' | 'right-end'
export type IPos = IPosTopBottom | IPosLeftRight

const useFrame = (fn: () => void) => {
  let stopFlag = false
  let start = () => {
    if (stopFlag) return
    fn()
    requestAnimationFrame(start)
  }
  start()

  return () => {
    stopFlag = true
  }
}

const calcTopBottom = (
  el: HTMLElement,
  pop: HTMLElement,
  placement = 'top' as IPosTopBottom,
  gap = 8
) => {
  const p = el.getBoundingClientRect()

  const { height, width } = pop.getBoundingClientRect()

  const innerWidth = el.ownerDocument.documentElement.clientWidth
  const innerHeight = el.ownerDocument.documentElement.clientHeight
  let [p1, p2 = ''] = placement.split('-') as ['top' | 'bottom', 'start' | 'end' | '']

  // bottom距离最上方的位置
  let bottom = p.bottom + gap + height
  // top位置距离最上方的
  let top = p.top - gap - height

  const toTop = () => {
    p1 = 'top'
    top = Math.max(0, top)
    bottom = top + height
  }
  const toBottom = () => {
    p1 = 'bottom'
    bottom = Math.min(innerHeight, bottom)
    top = bottom - height
  }

  if (p1 === 'bottom') {
    if (bottom > innerHeight && top > 0) toTop()
    else toBottom()
  } else {
    if (top < 0 && bottom < innerHeight) toBottom()
    else toTop()
  }
  const hMove = p2 === 'start' ? 0 : p2 === 'end' ? p.width - width : (p.width - width) / 2

  let left = p.left + hMove
  let right = left + width

  if (right > innerWidth) {
    left -= right - innerWidth
  }

  if (left < 0) left = 0

  const _right = width + left

  const anchor = {
    left: ((p.left < 0 ? 0 : p.left) + (p.right > innerWidth ? innerWidth : p.right)) / 2,
    top: p1 === 'top' ? p.top : p.bottom
  }
  return {
    left: left | 0,
    top: top | 0,
    pos: p1,
    right: Math.max(innerWidth - _right, 0) | 0,
    bottom: Math.max(0, innerHeight - bottom) | 0,
    anchor
  }
}

const calcLeftRight = (
  el: HTMLElement,
  pop: HTMLElement,
  placement = 'left' as IPosLeftRight,
  gap = 8
) => {
  const { height, width } = pop.getBoundingClientRect()
  const p = el.getBoundingClientRect()
  const innerWidth = el.ownerDocument.documentElement.clientWidth
  const innerHeight = el.ownerDocument.documentElement.clientHeight
  let [p1, p2 = ''] = placement.split('-') as ['left' | 'right', 'start' | 'end' | '']

  let right = p.right + gap + width
  let left = p.left - gap - width

  const toLeft = () => {
    p1 = 'left'
    left = Math.max(0, left)
    right = left + width
  }
  const toRight = () => {
    p1 = 'right'
    right = Math.min(innerWidth, right)
    left = right - width
  }

  if (p1 === 'right') {
    if (right > innerWidth && left > 0) toLeft()
    else toRight()
  } else {
    if (left < 0 && right < innerWidth) toRight()
    else toLeft()
  }

  const vMove = p2 === 'start' ? 0 : p2 === 'end' ? p.height - height : (p.height - height) / 2

  let top = p.top + vMove
  let bottom = top + height

  if (bottom > innerHeight) {
    top -= bottom - innerHeight
  }

  if (top < 0) top = 0

  let _bottom = height + top

  const anchor = {
    top: (((p.top < 0 ? 0 : p.top) + (p.bottom > innerHeight ? innerHeight : p.bottom)) / 2) | 0,
    left: p1 === 'left' ? p.left | 0 : p.right | 0
  }
  return {
    left: left | 0,
    top: top | 0,
    pos: p1,
    right: Math.max(0, innerWidth - right) | 0,
    bottom: Math.max(0, innerHeight - _bottom) | 0,
    anchor
  }
}

export const calcPos = (el: HTMLElement, tip: HTMLElement, placement = 'top' as IPos, gap = 8) => {
  let p = placement.split('-')[0]
  return p === 'top' || p === 'bottom'
    ? calcTopBottom(el, tip, placement as IPosTopBottom, gap)
    : calcLeftRight(el, tip, placement as IPosLeftRight, gap)
}

/**在鼠标放上去的时候，创建tooltip,移出时删除dom。 */
const tip = () => {
  if (!window) return {}

  const _clearTimeout = (el: IEl, key: ITimeoutKey) => {
    if (el[key]) {
      clearTimeout(el[key])
      el[key] = null
    }
  }

  const removeTipDelay = (el: IEl) => {
    if (el.removeTimeout) return
    if (el.addLeavingTimeout) return

    if (!el.tooltip) return
    el.addLeavingTimeout = window.setTimeout(() => {
      el.addLeavingTimeout = null
      if (el.tooltip) {
        el.tooltip.classList.add('leaving')
      }
      el.removeTimeout = window.setTimeout(() => {
        removeTip(el)
        el.removeTimeout = null
      }, 300)
    }, 100)
  }

  const stopRemoveTip = (el: IEl) => {
    el.tooltip?.classList.remove('leaving')
    _clearTimeout(el, 'removeTimeout')
    _clearTimeout(el, 'addLeavingTimeout')
  }

  const removeTip = (el: IEl) => {
    // 先卸载内容组件，再摘除 tooltip
    el.tipSlot?.clear()
    el.tipSlot = null
    el.tooltip?.remove()
    el.tooltip = null
    el.stopRefreshPos?.()
  }

  const append = (el: IEl, local: boolean, div: HTMLElement) => {
    if (local) {
      el.appendChild(div)
    } else {
      el.ownerDocument.body.appendChild(div)
    }
  }
  const show = (el: IEl, local: boolean) => {
    if (!el.ownerDocument.contains(el)) return // 判断延时结束的时候该元素是否还存在
    if (el.tooltip) return

    const div = document.createElement('div')
    div.style.display = 'block'
    div.setAttribute('id', 'v-tip')
    div.onmouseenter = () => {
      stopRemoveTip(el)
    }

    div.onclick = () => {
      // e.stopPropagation()
    }
    div.onmouseleave = () => leave(el)

    el.tooltip = div

    // 下方的箭头
    const i = document.createElement('i')
    div.appendChild(i)

    el.tipSlot = new TipSlot(div)
    el.tipSlot.fill(el.tips)
    append(el, local, div)
    let old: ReturnType<typeof calcPos>
    const refreshPos = () => {
      if (div.className.includes('leaving')) return
      const { height, width } = el.getBoundingClientRect()
      if (!height || !width) {
        removeTip(el)
        return
      }

      const info = calcPos(el, div)
      const { top, left, pos, right, bottom, anchor } = info

      if (
        old &&
        old.top === top &&
        old.left === left &&
        old.bottom === bottom &&
        old.right === right
      ) {
        return
      }
      console.log('refresh')
      old = info
      div.style.cssText = `left:${left}px;top:${top}px;right:${right}px;bottom:${bottom}px`

      i.style.cssText = `left: ${anchor.left}px;top:${anchor.top}px;`
      i.className = pos
    }
    refreshPos()

    el.stopRefreshPos = useFrame(refreshPos)
  }

  const leave = (el: IEl) => {
    removeTipDelay(el)
    _clearTimeout(el, 'delayShowTimeout')
  }

  const addMouseEvents = async (el: IEl, binding: IBinding) => {
    removeTip(el)

    el.onmouseenter = () => {
      if (!el.tips) return
      if (el.tooltip) {
        stopRemoveTip(el)
        return
      }
      if (binding.arg === 'noDelay') {
        _clearTimeout(el, 'delayShowTimeout')
        show(el, !!binding.modifiers.local)
      } else if (!el.delayShowTimeout) {
        el.delayShowTimeout = window.setTimeout(() => {
          show(el, !!binding.modifiers.local)
          el.delayShowTimeout = null
        }, 500)
      }
    }

    el.onmouseleave = () => leave(el)

    el.tips = await binding.value
  }

  return {
    mounted: (el: IEl, binding: IBinding) => {
      addMouseEvents(el, binding)
    },
    async updated(el: IEl, binding: IBinding) {
      el.tips = await binding.value
      if (!binding.value) {
        removeTip(el)
        return
      }

      // 显示中则就地替换内容，由 TipSlot 卸载上一份组件
      el.tipSlot?.fill(el.tips)
    },
    unmounted(el: IEl) {
      removeTip(el)
    }
  }
}

export { tip }
