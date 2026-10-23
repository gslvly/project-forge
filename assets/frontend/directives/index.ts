import type { App } from 'vue'
import { resize } from './resize'
import { tip } from './tip'

export const registerDirectives = (app: App) => {
  app.directive('tip', tip())
  app.directive('resize', resize)
}
