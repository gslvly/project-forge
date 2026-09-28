import type { Plugin, ResolvedServerOptions } from 'vite'
import * as fs from 'fs/promises'
import path from 'path'
import { normalizePath } from 'vite'
import { findFilesAsync, uniqWith } from './utils.ts'
import { type Config, optimize } from 'svgo'
const toReg = (str: string) => {
  return new RegExp(`${str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)
}
/**需要 import  'virtual:svg-icon-insert' 引入文件
 * 在开发服务器中fetch('/icon-stats') 能拿到统计数据
 */
export const iconInsert = ({
  svgDir,
  iconFont,
  src,
  /**生成的symbolId将为：`${svgIdPrefix}文件名` */
  symbolIdPrefix = '',
  clean = false
}: {
  svgDir?: string[]
  iconFont?: string
  src: string
  clean?: boolean
  symbolIdPrefix?: string
}): Plugin => {
  type IItem = { code: string; id: string }
  iconFont = iconFont && path.resolve(iconFont)

  const getId = (file: string) => `${symbolIdPrefix}${path.basename(file, '.svg')}`

  /** 规范化 SVG 内容，避免 SVGO 报错 "Non-whitespace before first tag"（BOM、首行注释等） */
  function normalizeSvgContent(raw: string): string {
    let s = raw.replace(/^\uFEFF/, '').trim()
    const start = s.indexOf('<svg')
    if (start > 0) s = s.slice(start)
    return s
  }

  async function compilerIcon(file: string, svgOptions = {} as Config) {
    if (!file) {
      return null
    }
    let content = await fs.readFile(file, 'utf-8')
    content = normalizeSvgContent(content)

    try {
      const { data } = optimize(content, svgOptions)
      content = data ?? content
    } catch (err) {
      console.error('[iconInsert] optimize svg error:', file, err)
    }
    return content.replace('<svg', `<symbol id="${getId(file)}"`).replace(/<\/svg>/, '</symbol>')
  }

  const collectIconFonts = async () => {
    if (!iconFont) return []
    const res = [] as IItem[]
    const code = await fs.readFile(iconFont, 'utf-8')
    const symbols = code.match(/<symbol\s+.+?<\/symbol>/g) || []
    const set = new Set()
    symbols.forEach((code) => {
      const id = code.match(/(?<=symbol\s*id=")(.+?)(?=")/)?.[0]
      if (id && !set.has(id)) {
        res.push({ code, id })
        set.add(id)
      }
    })
    return res
  }

  const collectSvgIcons = async () => {
    const allSvgIcons = [] as IItem[]
    if (!svgDir) return []
    const set = new Set<string>()
    const p = svgDir.map(async (dir) => {
      const files = await findFilesAsync(dir, (file) => path.extname(file) === '.svg')
      for (let file of files) {
        const id = getId(file)
        if (set.has(id)) continue
        set.add(id)

        allSvgIcons.push({
          id,
          code: await compilerIcon(file, {
            plugins: [
              'removeDimensions',
              'removeTitle',
              { name: 'prefixIds', params: { prefix: id } }
            ]
          })
        })
      }
    })
    await Promise.all(p)
    return allSvgIcons
  }

  const getUsed = async (allSvgIcons: IItem[]) => {
    const files = await findFilesAsync(src, (v) => {
      if (v === iconFont) return false
      const ext = path.extname(v)
      return ext === '.vue' || ext === '.ts' || ext === '.js' || ext === '.jsx' || ext === 'tsx'
    })

    const markUsed = (arr: IItem[], usedArr: IItem[], code: string) => {
      for (let i = 0; i < arr.length; i++) {
        while (arr[i] && code.includes(arr[i].id)) {
          ;[arr[i], arr[arr.length - 1]] = [arr[arr.length - 1], arr[i]]
          usedArr.push(arr.pop())
        }
      }
    }

    const notUsed = allSvgIcons.slice()
    const used = [] as IItem[]

    const promises = files.map(async (it) => {
      const code = await fs.readFile(it, 'utf-8')
      markUsed(notUsed, used, code)
    })
    await Promise.all(promises)
    return { used, notUsed }
  }

  const getStats = async () => {
    const [allSvgIcons, allIconFonts] = await Promise.all([collectSvgIcons(), collectIconFonts()])
    const { notUsed, used } = await getUsed(uniqWith(allSvgIcons.concat(allIconFonts), (k) => k.id))
    return {
      allSvgIcons,
      allIconFonts,
      notUsed,
      used
    }
  }
  const loadSvg = async () => {
    const { used, notUsed } = await getStats()
    const symbols = (clean ? used : used.concat(notUsed)).map((it) => it.code).join('')
    const str = `<svg id="svg-icon-insert-v1" style="position: absolute; width: 0px; height: 0px; overflow: hidden;">${symbols}</svg>`
    return `
      const svgDom = document.body.querySelector('svg#svg-icon-insert-v1')
      if(svgDom) document.body.removeChild(svgDom)
      const dom = document.createElement('div')
      dom.innerHTML = ${JSON.stringify(str)}
      document.body.insertBefore(dom.firstChild, document.body.firstChild)
    `
  }

  const svgInsertFileId = 'virtual:svg-icon-insert'
  const virtualId = `\0${svgInsertFileId}`
  return {
    name: 'iconStats',
    enforce: 'pre',
    configureServer: ({ middlewares, watcher }) => {
      // watcher.unwatch(iconFont)
      const onSvgChange = (file: string) => {
        if (
          (file.endsWith('.svg') && svgDir.some((it) => file.startsWith(it))) ||
          file === iconFont
        ) {
          watcher.emit('change', svgInsertFileId)
        }
      }

      watcher.on('add', onSvgChange)
      watcher.on('change', onSvgChange)
      watcher.on('unlink', onSvgChange)

      middlewares.use(async (req, res, next) => {
        const url = normalizePath(req.url)
        // console.log({ url }, url === '/icon-stats', req.method === 'get')
        if (url === '/icon-stats' && req.method === 'GET') {
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
          res.setHeader('Access-Control-Allow-Headers', 'Authorization')

          res.setHeader('Content-Type', 'text/json')
          res.setHeader('Cache-Control', 'no-cache')
          const { notUsed, used, allIconFonts, allSvgIcons } = await getStats()
          const getIds = (arr: IItem[]) => arr.map((v) => v.id)
          const code = JSON.stringify({
            notUsed: getIds(notUsed),
            used: getIds(used),
            allIconFonts: getIds(allIconFonts),
            allSvgIcons: getIds(allSvgIcons)
          })

          res.statusCode = 200
          res.end(code)
        } else {
          next()
        }
      })
    },
    resolveId: {
      filter: {
        id: iconFont ? [toReg(svgInsertFileId), toReg(iconFont)] : [toReg(svgInsertFileId)]
      },
      handler(id) {
        if (id === iconFont || id === svgInsertFileId) return virtualId
        return null
      }
    },

    async load(id, { ssr }) {
      if (ssr || id === iconFont) return ''

      if (id !== virtualId) {
        return
      }

      return loadSvg()
    }
  }
}
