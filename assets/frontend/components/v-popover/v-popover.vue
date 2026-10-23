<template>
  <div
    class="v-popover-btn"
    :class="{ 'is-show-pop': isShow, disabled }"
    ref="btn"
    @mouseenter="open"
    @mouseleave="close"
    @click.stop="toggle"
  >
    <slot name="btn"></slot>
    <div
      @mouseenter="open"
      @mouseleave="close"
      ref="dom"
      v-if="isShow"
      @click.stop="clickPop"
      class="v-popover-pop"
      v-resize="refreshPos"
      :class="[{ 'is-show': isShow }, popperClass]"
    >
      <i :class="[iClassName, 'arrow']" v-if="hasArrow" :style="`${arrow}`"></i>
      <slot v-bind="btnSize"></slot>
    </div>
  </div>
</template>

<script lang="ts" setup name="VPopover">
import { calcPos, type IPos } from '@/directives/tip'
import { useDomSize, useSetInterval, useWindowEvent } from '@/utils/use'
import { show } from './data'

const props = withDefaults(
  defineProps<{
    popperClass?: string
    placement?: IPos
    disabled?: boolean
    trigger?: 'click' | 'hover'
    hasArrow?: boolean
    clickPopClose?: boolean
    openWait?: number
  }>(),
  {
    trigger: 'click',
    hasArrow: true,
    clickPopClose: true,
    openWait: 0
  }
)
const emit = defineEmits<{
  show: [void]
  hide: [void]
}>()

const dom = ref<HTMLElement>()
const btn = ref<HTMLElement>()
const btnSize = useDomSize(() => btn.value!)
const id = Math.random()
const arrow = ref('')
const iClassName = ref('')
const isShow = computed(() => id === show.value)
const createToggle = ({
  close,
  open,
  closeWait = 0,
  openWait = 0
}: {
  closeWait?: number
  openWait?: number
  open: () => void
  close: () => void
}) => {
  let _openTimeout = -1
  let _closeTimeout = -1
  const createFn = (fn: () => void, wait: number) => {
    return () => {
      return window.setTimeout(fn, wait)
    }
  }
  const _close = createFn(close, closeWait)
  const _open = createFn(open, openWait)

  return {
    open: () => {
      clearTimeout(_closeTimeout)
      if (!openWait) return open()
      _openTimeout = _open()
    },
    close: () => {
      clearTimeout(_openTimeout)
      if (!closeWait) return close()
      _closeTimeout = _close()
    }
  }
}

const _close = () => {
  if (show.value === id) {
    show.value = undefined
    emit('hide')
  }
}
const _open = () => {
  if (show.value !== id && !props.disabled) {
    show.value = id
    emit('show')
  }
}
const toggle = () => {
  if (props.disabled || props.trigger === 'hover') return
  if (isShow.value) _close()
  else _open()
}

const loop = () => {}
let open = loop
let close = loop

if (props.trigger === 'hover') {
  const v = createToggle({
    close: _close,
    open: _open,
    openWait: props.openWait,
    closeWait: 200
  })
  open = v.open
  close = v.close
}

const refreshPos = () => {
  if (!isShow.value || !btn.value || !dom.value) return
  const { height, width } = btn.value.getBoundingClientRect()
  if (!height || !width) {
    return
  }
  const info = calcPos(btn.value, dom.value, props.placement || 'bottom', props.hasArrow ? 8 : 3)

  const { top, left, pos, right, bottom, anchor } = info
  let cssText = `left:${left}px;top:${top}px;right:${right}px;bottom:${bottom}px;`
  dom.value.style.cssText = cssText

  arrow.value = `left: ${anchor.left}px;top: ${anchor.top}px`
  iClassName.value = pos
}

watch(
  () => isShow.value,
  (v) => {
    if (v) showDom()
  }
)

useSetInterval(() => {
  refreshPos()
}, 300)

const showDom = async () => {
  await nextTick()
  const doc = btn.value!.ownerDocument
  doc.body.appendChild(dom.value!)
  refreshPos()
}

const clickPop = () => {
  if (props.clickPopClose) {
    _close()
  }
}

onBeforeUnmount(() => {
  dom.value?.remove()
})

onDeactivated(() => {
  _close()
})
useWindowEvent('click', () => {
  _close()
})
</script>

<style lang="scss">
.v-popover-btn {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  &.disabled {
    cursor: no-drop;
  }
}
.v-popover-pop {
  width: max-content;
  display: none;
  position: fixed;
  background-color: #fff;
  min-width: 80px;
  max-height: 100vh;
  overflow-y: auto;
  --bg: #fff;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
  border-radius: 4px;
  z-index: 1000;
  height: fit-content;
  padding: 6px 0;

  &.is-show {
    display: block;
  }
  .item {
    padding: 0 16px;
    font-size: 14px;
    position: relative;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: #001640;
    height: 34px;
    line-height: 34px;
    box-sizing: border-box;
    cursor: pointer;
    &.active {
      color: var(--main-color) !important;
    }
    &:hover {
      background-color: #f5f7fa;
    }
  }

  .arrow {
    --w: 8px;
    position: fixed;
    width: var(--w);
    height: var(--w);
    display: inline-block;

    border: 4px solid transparent;
    border-right: 4px solid var(--bg);
    border-top: 4px solid var(--bg);
    transform-origin: center;
    &.top {
      transform: translate(-50%, -13px) rotate(135deg);
    }
    &.left {
      transform: translate(-13px, -50%) rotate(45deg);
    }
    &.right {
      transform: translate(5px, -50%) rotate(-135deg);
    }

    &.bottom {
      transform: translate(-50%, 5px) rotate(-45deg);
    }
  }
}
</style>
