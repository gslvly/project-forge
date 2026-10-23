import { cloneVNode, isVNode, render, type VNode } from 'vue'
import { getAppContext } from './render-with-app-content'

/**tip 类内容可接受的形式，VNode 只是描述，不会提前创建组件实例 */
export type ITipContent = string | number | HTMLElement | VNode

/**
 * 管理宿主容器内的 tip 内容，供 v-tip、g6 tooltip 等按需显示的场景使用。
 *
 * VNode 内容在 fill 时才真正挂载，clear 时走 Vue 的卸载流程，
 * 保证组件的 onUnmounted、watch、pool 订阅都能释放。
 *
 * 只接管自己插入的节点，宿主内其他 DOM（如 tooltip 的箭头）不受影响。
 */
export class TipSlot {
  /**承载 tip 内容的宿主容器 */
  private host: HTMLElement
  /**宿主内是否挂着 Vue 渲染的内容 */
  private rendered = false
  /**非 VNode 内容插入的节点 */
  private nodes: ChildNode[] = []

  constructor(host: HTMLElement) {
    this.host = host
  }

  fill(content: ITipContent) {
    if (isVNode(content)) {
      this.removeNodes()
      // 同一个 VNode 被 patch 后会带上 el、component 等状态，复用前必须 clone
      const vnode = cloneVNode(content)
      vnode.appContext = getAppContext() || vnode.appContext
      // 已渲染过则交给 Vue diff，内部会卸载上一份组件
      render(vnode, this.host)
      this.rendered = true
      return
    }

    this.clear()
    if (content instanceof Node) {
      this.nodes = [content]
      this.host.appendChild(content)
      return
    }
    // 直接展开 html，不额外包一层，避免破坏依赖直接子元素的样式
    const tpl = document.createElement('template')
    tpl.innerHTML = String(content)
    this.nodes = [...tpl.content.childNodes]
    this.host.appendChild(tpl.content)
  }

  clear() {
    if (this.rendered) render(null, this.host)
    this.rendered = false
    this.removeNodes()
  }

  private removeNodes() {
    this.nodes.forEach((node) => node.remove())
    this.nodes = []
  }
}

/**
 * 给只认 DOM、又没有卸载时机的消费方使用（如 G6 原生 Tooltip）。
 * 返回的渲染函数复用同一个宿主，每次渲染都会先卸载上一份内容组件，避免实例堆积。
 */
export const createTipRenderer = () => {
  const host = document.createElement('div')
  const slot = new TipSlot(host)
  return (content: ITipContent) => {
    slot.fill(content)
    return host
  }
}

/**
 * 在 tip VNode 之后追加 html 片段。
 * 用于替代对已渲染 DOM 做 insertDom，避免为了拼内容而提前渲染组件。
 */
export const appendTip = (node: VNode, ...htmls: (string | false | undefined | null)[]) => {
  const extra = htmls.filter(Boolean) as string[]
  if (!extra.length) return node
  return h('div', [node, ...extra.map((html) => h('div', { innerHTML: html }))])
}
