import fs from 'fs'
import path from 'path'
import fs2 from 'fs/promises'

export const findFiles = (dir: string, fn: (file: string) => boolean) => {
  const res = [] as string[]
  const dfs = (dir: string) => {
    fs.readdirSync(dir).forEach((file) => {
      const filePath = path.join(dir, file)
      const stats = fs.statSync(filePath)

      if (stats.isDirectory()) {
        dfs(filePath) // 递归子目录
      } else if (stats.isFile() && fn(filePath)) {
        res.push(filePath)
      }
    })
  }
  dfs(dir)
  return res
}

export const findFilesAsync = async (dir: string, fn: (file: string) => boolean) => {
  const res = [] as string[]
  const dfs = async (dir: string) => {
    const files = await fs2.readdir(dir)
    const promises = files.map(async (file) => {
      const filePath = path.join(dir, file)
      const stats = await fs2.stat(filePath)

      if (stats.isDirectory()) {
        await dfs(filePath) // 递归子目录
      } else if (stats.isFile() && fn(filePath)) {
        res.push(filePath)
      }
    })
    return Promise.all(promises)
  }
  await dfs(dir)
  return res
}

/**重复时，选用前面的 */
export const uniqWith = <T>(arr: T[], k: (v: T) => string) => {
  if (!arr) throw new Error('缺少参数')
  const set = new Set()
  const res: T[] = []
  for (let it of arr) {
    if (!set.has(k(it))) {
      res.push(it)
      set.add(k(it))
    }
  }
  return res
}
