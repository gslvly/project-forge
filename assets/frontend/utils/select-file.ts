type SelectFileParams = {
  size?: [number, number]
  multiple?: boolean
  accept: string
}

export const formatSize = (size: number) => {
  if (size > 1024 ** 3) return +(size / 1024 ** 3).toFixed(2) + 'GB'
  if (size > 1024 ** 2) return +(size / 1024 ** 2).toFixed(2) + 'MB'
  if (size > 1024) return +(size / 1024).toFixed(2) + 'KB'
  return size + 'B'
}

export const selectFile = ({
  size = [0, Infinity],
  multiple = false,
  accept = ''
}: SelectFileParams): Promise<FileList | null> => {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = accept
  input.multiple = multiple

  return new Promise((r, rej) => {
    input.onchange = () => {
      for (const it of input.files || []) {
        if (it.size > size[1]) {
          rej('文件大小最大不超过' + formatSize(size[1]))
          return
        }
        if (it.size < size[0]) {
          rej('文件大小不小于' + formatSize(size[0]))
          return
        }
        const nameSplit = it.name.split('.')
        const ext = '.' + nameSplit[nameSplit.length - 1]
        // accept 支持逗号分隔的多值，以及 image/* 这类通配
        const match = accept
          .split(',')
          .map((a) => a.trim())
          .filter(Boolean)
          .some((a) =>
            a.endsWith('/*') ? it.type.startsWith(a.slice(0, -1)) : it.type === a || ext === a
          )
        if (accept && !match) {
          rej('文件类型错误:' + it.name)
          return
        }
      }
      r(input.files)
    }
    input.oncancel = () => r(null)
    input.click()
  })
}

export const selectExcel = ({
  multiple = true,
  size = Infinity
} = {}): Promise<FileList | null> => {
  return selectFile({
    accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    multiple,
    size: [0, size]
  })
}
