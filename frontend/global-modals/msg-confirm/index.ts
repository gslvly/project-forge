import { createDialog } from '@/utils/pure-tool'

export type IOption = {
  icon: string
  showCancel?: boolean
  showClose?: boolean
  msg: string
  cancelText: string
  confirmText: string
  title: string
  width?: string
}

const { open, resolve, option } = createDialog<IOption, boolean>()

export { option as data }

export const showConfirm = (cfg: Partial<IOption>) => {
  const val = Object.assign(
    {
      icon: 'element-confirm',
      msg: '',
      title: '',
      cancelText: '取消',
      confirmText: '确定'
    },
    cfg
  )

  return open(val)
}

export const delConfirm = (cfg?: Partial<IOption>) => {
  const val = {
    title: '确定要删除这条数据吗',
    msg: '删除后，将无法找回',
    cancelText: '取消',
    confirmText: '确定',
    ...cfg,
    icon: 'element-delete'
  }

  return open(val)
}

export const onConfirm = () => resolve(true)
export const onClose = () => resolve()
