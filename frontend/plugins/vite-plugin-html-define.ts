import { type Plugin } from 'vite'

export const htmlDefine = (obj?: Record<string, any>) => {
  return {
    name: 'htmlDefine',
    enforce: 'post',
    transformIndexHtml(v) {
      if (!obj) return v
      return Object.keys(obj).reduce((a, b) => {
        return a.replace(`%${b}%`, obj[b])
      }, v)
    }
  } as Plugin
}
