/**
 * 存储localStorage
 */
export const setStore = (name: string, content: any) => {
  if (!name) return
  if (typeof content !== 'string') {
    content = JSON.stringify(content)
  }
  window.localStorage.setItem(name, content)
}

/**
 * 获取localStorage
 */
export const getStore = (name: string) => {
  if (!name) return
  //开启监听
  return window.localStorage.getItem(name)
}

/**
 * 删除localStorage
 */
export const removeStore = (name: string) => {
  if (!name) return
  window.localStorage.removeItem(name)
}

// 两个必须对照用，只有setStorage的保存的内容才能用getStorage解析
/** 两个必须对照用，只有setStorage的保存的内容才能用getStorage解析 */
export const setStorage = (key: string, value: any) => {
  if (!key) throw new Error('需要key')
  localStorage.setItem(key, JSON.stringify(value))
}

export const getStorage = (key: string) => {
  const v = localStorage.getItem(key)
  try {
    return v && JSON.parse(v)
  } catch {
    return v
  }
}

export const hasStorage = (key: string) => {
  return Object.prototype.hasOwnProperty.call(localStorage, key)
}

export const removeStorage = (key: string) => {
  localStorage.removeItem(key)
}

export const setSessionStorage = (key: string, value: any) => {
  if (!key) throw new Error('需要key')
  sessionStorage.setItem(key, JSON.stringify(value))
}

export const getSessionStorage = (key: string) => {
  const v = sessionStorage.getItem(key)
  try {
    return v && JSON.parse(v)
  } catch {
    return v
  }
}

export const removeSessionStorage = (key: string) => {
  sessionStorage.removeItem(key)
}

/**只能使用getVersionStorage获取 */
export const setVersionStorage = (key: string, value: any, version: number) => {
  if (!key) throw new Error('需要key')
  if (!version) throw new Error('需要version')
  localStorage.setItem(key, JSON.stringify([version, value]))
}

/**如果版本不对会返回null*/
export const getVersionStorage = (key: string, version: number) => {
  const v = localStorage.getItem(key)
  if (!v) return null
  try {
    const val = JSON.parse(v)
    return val && val[0] === version ? val[1] : null
  } catch {
    return null
  }
}

// 用户操作行为信息等（退出不能清除）
type UserConfig = {
  /** 多地址研判图形模式 */
  addrGraphType: 'tree' | 'force'
  /** 表示用户点击过的新功能点（用于红点展示 */
  newFeat: string[]
  /** 是否展示右键扩展提示 */
  showContextMenuGuide: boolean
  /** 是否展示右键扩展提示 - 案件版 */
  showContextMenuGuideCase: boolean
  /** 是否展示顶部的升级bar */
  showPromotion: boolean
  // 下线通知提示
  showRemoveTip: boolean
}

const USER_CONFIG = 'USER_CONFIG' as const
export const getUserConfig = (): Partial<UserConfig> => {
  return getStorage(USER_CONFIG) || {}
}
export const setUserConfig = (value: Partial<UserConfig>) => {
  const oldValue = getUserConfig()
  setStorage(USER_CONFIG, {
    ...oldValue,
    ...value
  })
}
