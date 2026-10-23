import type { Directive } from 'vue'

type IHandler = () => void

const handlers = new WeakMap<Element, IHandler>()

const observer = new ResizeObserver((entries) => {
  entries.forEach((entry) => handlers.get(entry.target)?.())
})

/**元素尺寸变化时执行回调：v-resize="fn" */
export const resize: Directive<HTMLElement, IHandler> = {
  mounted(el, binding) {
    handlers.set(el, binding.value)
    observer.observe(el)
  },
  updated(el, binding) {
    handlers.set(el, binding.value)
  },
  unmounted(el) {
    handlers.delete(el)
    observer.unobserve(el)
  }
}
