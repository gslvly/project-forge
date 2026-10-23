import type { App, VNode } from 'vue'
import { render } from 'vue'
let _app: App<Element>

export const appRender = {
  install(app: App) {
    _app = app
  }
}

export const getAppContext = () => _app?._context

export function renderWithAppContext(
  vnode: VNode,
  container = document.createElement('div') as HTMLElement
) {
  try {
    vnode.appContext = _app?._context || vnode.appContext
    render(vnode, container)
    return container
  } catch (err) {
    console.log('err')
    return container
  }
}
