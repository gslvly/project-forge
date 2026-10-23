import * as fs from 'fs'
import { resolve } from 'path'
import type { Plugin } from 'vite'
type Options = {
  prefix: string
  dir: string
}
const toRegStr = (str: string) => {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export const svg = ({ prefix = 'svg', dir }: Options): Plugin => {
  const idPrefix = 'virtual:' + Math.random()
  const svgMap = new Map<string, string>()

  const generateTs = () => {
    const str = [...svgMap.keys()]
      .map((it) => {
        const name = it.includes('-') ? `'Svg${it}'` : `Svg${it}`
        return `${name}: DefineComponent<{ size?: number }>`
      })
      .join('\n    ')

    const ts = `import { DefineComponent } from 'vue'
declare module 'vue' {
  export interface GlobalComponents {
    ${str}
  }
}\n`
    console.log('name', 'svg-icon.d.ts')
    fs.writeFileSync(resolve(process.cwd(), './svg-icon.d.ts'), ts)
  }

  const toSameName = (id: string) => {
    // 首字母大写，-x转换为X
    id = id.replace(/-[a-z]/g, (v) => {
      return v[1]?.toUpperCase() || ''
    })
    return id[0].toUpperCase() + id.substring(1)
  }

  prefix = toSameName(prefix)
  const loadSvg = (svgId) => {
    let svg = svgMap.get(svgId)
    if (!svg) console.error('not found svg:' + svg)
    else {
      svg = svg.replace('<svg', `<svg :style="{width:size && size+'px',height:size && size+'px'}"`)
    }
    return `<template>
        ${svg || ''}
        </template>
        <script>
        export default {
            props:{size:Number},
            name: ${JSON.stringify('Svg' + svgId)},
        }
        </script>
        `
  }

  const getSvgs = (dir) => {
    const svgs = fs.readdirSync(dir)
    svgs.forEach((it) => {
      const path = resolve(dir, it)
      if (fs.statSync(path).isDirectory()) {
        return getSvgs(path)
      }
      if (it.endsWith('.svg')) {
        const str = fs
          .readFileSync(path, 'utf8')
          .replace(
            /(^.*?(?=<svg)|<style[\s\S]*<\/style>|<script[\s\S]*<\/script>|<title[\s\S]*<\/title>|<\?xml.+)/gi,
            ''
          )
        svgMap.set(toSameName(it.replace(/\.svg$/, '')), str)
      }
    })
  }
  getSvgs(dir)
  generateTs()

  return {
    configResolved(cfg) {
      if (cfg.command === 'serve') {
        fs.watch(resolve(dir), () => {
          svgMap.clear()
          getSvgs(dir)
        })
      }
    },
    name: 'svg:transform',
    resolveId: {
      filter: {
        id: new RegExp('^' + toRegStr(idPrefix) + ':')
      },
      handler(id: string) {
        // console.log('resolve', id)
        if (id.startsWith(idPrefix)) {
          return id
        }
      }
    },
    load: {
      filter: {
        id: new RegExp('^' + toRegStr(idPrefix) + ':')
      },
      handler(id: string) {
        if (!id.startsWith(idPrefix)) return
        // console.log('load', id)

        const svgId = id.replace(idPrefix + ':', '').replace(/\.vue$/, '')

        if (svgMap.has(svgId)) {
          return loadSvg(svgId)
        }
      }
    },
    transform: {
      filter: {
        id: /\.(vue|tsx|jsx|lang\.ts)$/,
        code: /_resolveComponent\("([^"]+?)"\)/g
      },
      handler(code, id) {
        if (!id) return code

        if (
          !id.endsWith('.vue') &&
          !id.endsWith('.tsx') &&
          !id.endsWith('.jsx') &&
          !id.endsWith('lang.ts')
        )
          return code
        const set = new Set<string>()
        let imports = ''
        code = code.replace(/_resolveComponent\("(.+?)"\)/g, (v, c) => {
          let s = toSameName(c)
          if (!s.startsWith(prefix)) return v
          s = s.replace(prefix, '')
          if (!set.has(s)) {
            imports += `\nimport ${s} from "${idPrefix}:${s}.vue"`
            set.add(s)
          }
          return s
        })
        return code + imports
      }
    }
  }
}
