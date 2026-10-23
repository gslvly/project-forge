import type { Plugin, ResolvedConfig } from 'vite'
import * as fs from 'fs'
import { resolve } from 'path'

const imageRE = /\.(png|jpe?g|gif|webp|svg)$/i
const fontRE = /\.(ttf|otf|woff|woff2|eot)$/i

export const prefetch = (): Plugin => {
  let config: ResolvedConfig

  const toLink = (
    arr: string[],
    as: 'script' | 'style' | 'font' | 'image',
    rel: 'prefetch' | 'preload' = 'prefetch'
  ) => {
    return arr
      .map((href) => {
        return `<link rel="${rel}" as="${as}" href="${href}"></link>`
      })
      .join('')
  }

  const format = (arr: string[]) => {
    let js = [] as string[], //js
      css = [] as string[], // css
      img = [] as string[], //img
      font = [] as string[]

    arr.forEach((path) => {
      if (path.endsWith('.js')) {
        js.push(path)
      } else if (path.endsWith('.css')) {
        css.push(path)
      } else if (imageRE.test(path)) {
        img.push(path)
      } else if (fontRE.test(path)) {
        font.push(path)
      }
    })
    return { js, css, img, font }
  }

  return {
    name: 'vite-plugin-preload',
    apply: 'build',
    enforce: 'post',
    configResolved(v) {
      config = v
    },
    transformIndexHtml(code, { bundle, chunk }) {
      // 入口文件sync依赖使用preload
      const preload = new Set<string>()
      const entryFiles = new Set<string>()

      if (!bundle || !chunk) return

      chunk.viteMetadata?.importedAssets.forEach((v) => entryFiles.add(v))
      chunk.viteMetadata?.importedCss.forEach((v) => entryFiles.add(v))
      entryFiles.add(chunk.fileName)

      let next = chunk.imports

      while (next.length) {
        let temp = [] as string[]
        for (let it of next) {
          if (preload.has(it) || entryFiles.has(it)) continue

          const node = bundle[it]
          preload.add(it)
          if (node.type === 'chunk') {
            node.viteMetadata?.importedAssets.forEach((v) => preload.add(v))
            node.viteMetadata?.importedCss.forEach((v) => preload.add(v))
            temp = temp.concat(node.imports)
          }
        }
        next = temp
      }

      const prefetchInfo = format(
        Object.keys(bundle).filter((it) => !preload.has(it) && !entryFiles.has(it))
      )

      let str = ''

      str += toLink(prefetchInfo.js, 'script', 'prefetch')
      str += toLink(prefetchInfo.css, 'style', 'prefetch')

      const outputDir = config.build.outDir

      if (str) {
        str = `window.addEventListener('load',() => {
          const div = document.createElement('div');div.innerHTML=${JSON.stringify(
            str
          )};document.body.appendChild(div)
        })`
      }
      // 生成额外文件的完整路径
      const extraFilePath = resolve(outputDir, 'prefetch.js')
      fs.writeFileSync(extraFilePath, str, 'utf-8')

      const preloadInfo = format([...preload])
      let preloadStr = toLink(preloadInfo.js, 'script', 'preload')
      preloadStr += toLink(preloadInfo.css, 'style', 'preload')
      return code
        .replace(
          '</html>',
          `<script defer src="${config.base}prefetch.js?${Date.now()}"></script></html>`
        )
        .replace('<head>', '<head>' + preloadStr)
    }
  }
}
