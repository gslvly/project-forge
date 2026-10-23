// import * as path from 'path'
import type { Plugin } from 'vite'
const toReg = (str: string) => {
  return new RegExp(`${str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)
}
export function allImportElementPlus({
  globalImport,
  entry
}: {
  globalImport: boolean
  entry: string
}) {
  if (!globalImport) return {}
  return {
    name: 'allImportElementPlus',

    transform: {
      filter: {
        id: toReg(entry)
      },
      handler(code, id) {
        // 判断当前处理的是否是 _src/main.ts_
        if (id.endsWith(entry)) {
          const name = 'ElementPlus'

          // 引入 ElementPlus 和 样式
          const prepend = `import ${name} from 'element-plus';\nimport 'element-plus/dist/index.css';\n`

          // 通过匹配字符串来使用 ElementPlus （此处替换规则根据 main.ts 的情况而定）
          // 相当于将字符串 `app.use(router).mount('#app')` 替换成 `app.use(router).use(ElementPlus).mount('#app')`
          code = code.replace('.mount(', ($1) => `.use(${name})` + $1)
          return prepend + code
        }
        return code
      }
    }
  } as Plugin
}
