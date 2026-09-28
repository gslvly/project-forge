import { execFileSync } from 'child_process'
import fs from 'fs'
import { dirname, resolve } from 'path'
import type { Plugin } from 'vite'

const normalizeCommitId = (commitId?: string) => commitId?.trim().slice(0, 7) || ''

const hasGitMetadata = () => {
  let currentDir = process.cwd()

  while (true) {
    if (fs.existsSync(resolve(currentDir, '.git'))) return true

    const parentDir = dirname(currentDir)
    if (parentDir === currentDir) return false
    currentDir = parentDir
  }
}

const getLocalCommitId = () => {
  if (!hasGitMetadata()) return ''

  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' })
    return normalizeCommitId(
      execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' })
    )
  } catch {
    return ''
  }
}

const getCommitId = () =>
  getLocalCommitId() || normalizeCommitId(process.env.APP_COMMIT) || 'unknown'

export const generateVersion = (): Plugin => {
  const version = `zh-CN:${new Date().toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai'
  })}|commitId:${getCommitId()}`

  return {
    name: 'generate-version',
    apply: 'build',
    enforce: 'post',
    transformIndexHtml(code) {
      return code.replace('<head>', `<head><script>window.appVersion="${version}"</script>`)
    },

    writeBundle(outputOptions) {
      // 获取输出目录的路径
      const outputDir = outputOptions.dir || 'dist'
      // 生成额外文件的完整路径
      const extraFilePath = resolve(outputDir, 'version')
      fs.writeFileSync(extraFilePath, version)
    }
  }
}
