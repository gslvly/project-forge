//此文件不能包含导入，必须全部是导出，以避免循环引用导致错误
/**T:参数，R：弹窗返回 */
export const createDialog = <T, R>(autoClose = true) => {
  const option = ref<T | null>()
  let resolveCall: ((value?: R) => void) | null = null
  let rejectCall: ((reason?: unknown) => void) | null = null

  const open = (v: T) => {
    option.value = v
    return new Promise<R | undefined>((r, j) => {
      resolveCall = r
      rejectCall = j
    })
  }

  const resolve = (info?: R) => {
    const callback = resolveCall
    resolveCall = null
    rejectCall = null
    if (autoClose) option.value = undefined
    callback?.(info)
  }

  const reject = () => {
    const callback = rejectCall
    resolveCall = null
    rejectCall = null
    if (autoClose) option.value = undefined
    callback?.()
  }

  const close = () => {
    option.value = undefined
    const callback = rejectCall
    resolveCall = null
    rejectCall = null
    callback?.()
  }
  return {
    close,
    open,
    option,
    resolve,
    reject
  }
}

/**v = single(() => promise);v(xxx)多次调用，返回后才调用第二次 */
export const single = <T extends (...args: any[]) => Promise<any>>(fn: T) => {
  let loading = 0
  return ((...args) => {
    if (loading) return
    loading = 1
    fn(...args).finally(() => (loading = 0))
  }) as T
}

export const toUrl = (str: string, mimeType?: string) =>
  URL.createObjectURL(new Blob([str], { type: mimeType }))

export const mergeObjKeys = (
  obj: Record<string, any>,
  obj2: Record<string, any> | undefined | null
) => {
  if (!obj2) return obj
  Object.keys(obj).forEach((it) => {
    // 与object.assign 相同
    if (Object.prototype.hasOwnProperty.call(obj2, it)) obj[it] = obj2[it]
  })
}

/**将关键词染色，str: "abcd" keywords:['ab','bc'] 将染色abc
 * @param i 是否忽略大小写
 * @param className 匹配上的关键词添加的class名，默认keywords
 */
export const renderKeywords = (
  str: string,
  keywords: string[],
  className = 'keywords',
  i = true
) => {
  if (!str) return ''
  str = str.trim()

  keywords = i ? keywords.filter(Boolean).map((it) => it.toLowerCase()) : keywords
  if (!keywords.length) return str

  const lower = i ? str.toLowerCase() : str

  const colors = new Array(str.length).fill(0) // 0代表没有命中，1代表命中

  keywords.forEach((it) => {
    let i = lower.indexOf(it)
    while (i > -1) {
      colors[i]++
      colors[i + it.length]--
      i = lower.indexOf(it, i + 1)
    }
  })

  let res = '',
    blue = ''
  if (colors[0] === 1) blue = str[0]
  else res = str[0]

  for (let i = 1; i < str.length; i++) {
    colors[i] += colors[i - 1]
    if (colors[i] === 0) {
      if (blue) {
        res += `<span class="${className}">${blue}</span>`
        blue = ''
      }
      res += str[i]
    } else {
      blue += str[i]
    }
  }
  if (blue) res += `<span class="${className}">${blue}</span>`

  return res
}

export const toAutoNumber = (v: string | undefined) => {
  if (v === undefined || typeof v === 'number') return v
  const res = v.replace(/^\D*(\d*(?:\.\d{0,6})?).*$/g, '$1')
  return !res ? undefined : +res
}

export const filterAttrs = (attrs: Record<string, any>) => {
  let res = {} as Record<string, any>
  Object.keys(attrs).forEach((it) => {
    if (!it.startsWith('on')) res[it] = attrs[it]
  })
  return res
}

export const filterEvent = (attrs: Record<string, any>) => {
  let res = {} as Record<string, any>
  Object.keys(attrs).forEach((it) => {
    if (it.startsWith('on')) res[it] = attrs[it]
  })
  return res
}

/** */
export function runOnce<T extends (...args: any[]) => void>(
  fn: T,
  saveLocalStorageKey?: string
): T {
  const arr = JSON.parse(localStorage.getItem('appRunOnce') || '[]') as string[]
  let called = saveLocalStorageKey ? arr.includes(saveLocalStorageKey) : false
  return ((...args: Parameters<T>) => {
    if (!called) {
      called = true
      if (saveLocalStorageKey) {
        localStorage.setItem('appRunOnce', JSON.stringify(arr.concat(saveLocalStorageKey)))
      }
      return fn(...args)
    }
  }) as T
}

/**通用，允许hash路由获取search信息 */
export function parseUrl(fullUrl: string = location.href) {
  const url = new URL(fullUrl)

  let search = url.search ? url.search : url.hash.split('?')[1]
  const query = search
    ?.replace('?', '')
    .split('&')
    .reduce(
      (a, b) => {
        const [key, val] = b.split('=')
        a[key] = val
        return a
      },
      {} as Record<string, string>
    )

  const hash = url.hash?.split('?')[0] || ''

  return {
    origin: url.origin,
    hostname: url.hostname,
    port: url.port,
    protocol: url.protocol,
    hash,
    query
  }
}

/**
 * autoNext=true时，自动执行下一步任务，false时必须手动执行task.next()
 * 1. autoNext=true时，fn返回的数据和手动next()的参数都会作为判断下一跳的依据
 */
export const createTask = (fn: (v: any) => any, autoNext = false) => {
  let res: any

  /**下一个任务的index 和params */
  const next = (index?: number, params?: any) => {
    res({ index, params })
  }

  const __run = (params: any) => {
    return new Promise<any>((r, j) => {
      res = r
      const v = fn(params)
      if (autoNext) {
        Promise.resolve(v).then(r, j)
      }
    })
  }

  return {
    __run,
    next
  }
}

export const execTask = (...tasks: ReturnType<typeof createTask>[]) => {
  let i = 0
  const invoke = async (params?: any, index = 0) => {
    i = index
    while (i < tasks.length) {
      const task = tasks[i]
      let res = await task.__run(params)
      i = res?.index || i + 1
      params = res?.params
    }
  }

  const end = () => {
    i = tasks.length
  }

  return {
    invoke,
    end
  }
}

export const insertDom = (
  dom: HTMLElement,
  info: string | HTMLDivElement,
  before: HTMLElement | null = null
) => {
  if (!info) return
  let child = info as HTMLElement
  if (typeof info === 'string') {
    const div = document.createElement('div')
    div.innerHTML = info
    child = div.firstChild! as HTMLElement
  }
  dom.insertBefore(child, before)
}
/**当方法调用后Promise没有返回时，拒绝后续调用 */
export const preventReentry = <T extends (...v: any[]) => Promise<any | void>>(fn: T) => {
  let loading = false
  return ((...args: any[]) => {
    if (loading) return
    loading = true
    return fn(...args).finally(() => {
      loading = false
    })
  }) as T
}

/**
 *
 * @param path public文件夹中的文件路径例如：logo_trace.ico
 * @returns 链接
 */
export const linkPublic = (path: string) => {
  if (path.startsWith('/')) path = path.substring(1)
  let b = import.meta.env.BASE_URL || ''
  b = b.endsWith('/') ? b : `${b}/`
  return `${b}${path}`
}

/**
 *intLength 整数位数
 *floatLength 小数位数
 * allowNegative 是否允许负数
 */
export const formatFloat = (
  v: string,
  { intLength = Infinity, floatLength = 6, allowNegative = true } = {}
) => {
  const sign = v[0] === '-' ? '-' : ''

  let [int, float] = v.split('.')
  if (sign === '-') int = int.slice(1)

  float = float?.replace(/\D/g, '').slice(0, floatLength)
  int = int.replace(/\D/g, '')
  if (int) {
    int = int.replace(/^0+/, '')
    if (!int) int = '0'
    int = int.slice(0, intLength)
  }

  if (float !== undefined) {
    int = int === '' ? '0' : int
  }

  const _sign = sign && allowNegative ? '-' : ''

  return float !== undefined && floatLength ? `${_sign}${int}.${float}` : `${_sign}${int}`
}

export const keysOf = <T extends Record<string, any>>(obj: T) =>
  Object.keys(obj) as (keyof typeof obj)[]

export const onLocalStorageEvent = (() => {
  type IFn = (e: string | null) => void
  let events = {} as Record<string, IFn[]>

  const listener = (e: StorageEvent) => {
    if (!e.key) return
    const arr = events[e.key] || []
    arr.forEach((fn) => fn(e.newValue))
  }

  const removeEventListener = (key: string, fn: IFn) => {
    events[key] = events[key]?.filter((it) => it !== fn)
    if (!Object.values(events).filter((it) => it?.length).length)
      window.removeEventListener('storage', listener)
  }

  return (key: string, fn: IFn) => {
    events[key] = events[key] || []
    events[key].push(fn)
    window.removeEventListener('storage', listener)
    window.addEventListener('storage', listener)
    return () => {
      removeEventListener(key, fn)
    }
  }
})()
export function sum<T>(arr: T[], value: (e: T, index: number) => number) {
  return arr.reduce((sum, e, index) => (sum += value(e, index)), 0)
}

export function fixedAmount(value: number, decimal?: number, mini = true) {
  if (value === undefined) {
    return
  }
  if (value === null || value === 0) {
    return 0
  }
  // （更小的显示<0.00001"）

  if (mini && decimal) {
    const minStr = '0.'.padEnd(decimal + 1, '0') + '1'
    if (value < Number(minStr)) {
      return '<' + minStr
    }
  }
  if (mini && value < 0.00001) {
    return '<0.00001'
  }

  decimal ??= value < 1 ? 5 : 2
  value = +truncDecimalByString(value, decimal)

  if (value === 0) return 0
  return (value as number)
    .toLocaleString('zh', {
      maximumFractionDigits: decimal,
      minimumFractionDigits: decimal === 5 ? 5 : undefined
    })
    .replace(/(\.\d*?)0+$/, '$1')
    .replace(/\.$/, '')
}

function truncDecimalByString(num: number, digits = 2) {
  const str = String(num)
  // 超大数（如 3.1e22）String 后是科学计数法，直接交给 toLocaleString 输出完整数字
  if (str.includes('e+')) return str

  const [intPart, decimalPart = ''] = str.split('.')

  if (digits <= 0) return intPart

  const cutDecimal = decimalPart.slice(0, digits)

  return cutDecimal ? `${intPart}.${cutDecimal}` : intPart
}

export function transformBigNumber(num: any, decimal?: number, mini = true) {
  if (num === undefined) {
    return
  }
  if (num === null || num.toString() === '0') {
    return 0
  }

  // 小于1的显示5位，大于1的显示2位
  let autoDecimal = num < 1 ? 5 : 2
  decimal = decimal !== undefined ? decimal : autoDecimal

  if (num >= 1_0000_0000) {
    return `${fixedAmount(num / 1_0000_0000, decimal, mini)}亿`
  } else if (num >= 10000) {
    return `${fixedAmount(num / 10000, decimal, mini)}万`
  } else {
    return fixedAmount(num, decimal, mini)
  }
}

export function ellAddress(addr: string) {
  addr = addr || ''
  if (!addr || addr.length <= 16) return addr
  return `${addr.substring(0, 10)}...${addr.slice(-6)}`
}

/** 在规定时间内重复，会被过滤掉,time: 毫秒级 */
export const createTimeFilter = (time = 3600 * 1000) => {
  const dict = new Map<string, number>()

  return <T>(arr: T[], key: (v: T) => string) => {
    const now = Date.now()

    return arr.filter((it) => {
      const k = key(it)
      const lastTime = dict.get(k)

      // 没出现过，或者超过过滤时间，允许通过
      if (!lastTime || now - lastTime > time) {
        dict.set(k, now)
        return true
      }

      // 规定时间内重复，过滤掉
      return false
    })
  }
}
