// symbol：u | n | -
// 其中 - 为a中存在，并且b中不存在的

//key为元素的唯一标识
type IKey<T> = string | IK<T>
type IK<T> = (v: T) => string
type IVerify<T> = (v: T) => boolean
/** 求并时b会覆盖a的相同项*/
export const calc = <T, K>(
  a: T[],
  symbol: 'u' | 'n' | '-',
  b: K[],
  key: IKey<T | K>,
  filter: IVerify<T | K> = () => true
) => {
  if (!a || !b) {
    throw new Error('calc缺少参数')
  }
  const mapB = new Map<string, K>()
  let k: IK<T | K> = typeof key === 'string' ? (it) => (it as any)[key] as string : (it) => key(it)
  for (let it of b) {
    mapB.set(k(it), it)
  }

  let res = []
  // 求交
  if (symbol === 'n') {
    for (let it of a) {
      const keyStr = k(it)
      if (mapB.has(keyStr) && filter(mapB.get(keyStr)!)) res.push(mapB.get(keyStr)!)
    }
    return res as (T | K)[]
  }
  // 求减
  for (let it of a) {
    if (!mapB.has(k(it)) && filter(it)) {
      res.push(it)
    }
  }
  if (symbol === '-') return res as T[]
  // 求并，会由b覆盖a的相同项
  b.forEach((it) => {
    if (filter(it)) {
      res.push(it)
    }
  })
  return res as (T | K)[]
}
// const c = calc([{ id: 1 }, { id: 2 }], '-', [{ id: 3 }, { id: 4 }, { id: 1 }])
// [{id:2}]

/**重复数据，前面的优先 */
export const uniqWith = <T>(arr: T[], key: IKey<T> = (v) => v as string) => {
  if (!arr) throw new Error('缺少参数')
  const set = new Set()
  const k: IK<T> = typeof key === 'string' ? (v) => (v as any)[key] : key
  const res = []
  for (let it of arr) {
    if (!set.has(k(it))) {
      res.push(it)
      set.add(k(it))
    }
  }
  return res
}
// 重复的取后面出现的
export const uniqLastWith = <T>(arr: T[], key: IKey<T> = (v) => v as string) => {
  if (!arr) throw new Error('缺少参数')
  const set = new Set()
  const k = typeof key === 'string' ? (v: T) => (v as any)[key] : key
  const res = []
  for (let i = arr.length - 1; i >= 0; i--) {
    const it = arr[i]
    if (!set.has(k(it))) {
      res.push(it)
    }
    set.add(k(it))
  }
  return res
}
// const v = uniqLastWith([{ id: 1 }, { id: 2 }, { id: 2 }], v => v.id)

export const groupBy = <T>(arr: T[], key: keyof T) => {
  const map = new Map<any, T[]>()
  for (let it of arr) {
    if (map.has(it[key])) {
      map.get(it[key])?.push(it)
    } else {
      map.set(it[key], [it])
    }
  }
  return [...map.values()]
}
export const groupBy2 = <K extends string | number, T>(arr: T[], key: (v: T) => K) => {
  const map = {} as Record<K, T[]>
  for (let it of arr) {
    const k = key(it)
    if (map[k]) {
      map[k].push(it)
    } else {
      map[k] = [it]
    }
  }
  return map
}
/** 过滤空的字段 */
export const filterEmpty = (obj: any) => {
  obj = obj || {}
  let newObj = {} as any
  Object.keys(obj).forEach((key) => {
    let v = obj[key]
    if (v !== undefined && v !== null) newObj[key] = v
  })
  return newObj
}

export const accBy = (arr: any[], key: string) => {
  return arr.reduce((prev, item) => prev + item[key], 0) as number
}

// 数组的元素合并
export const mergeItem = <T extends Record<string, any>>(
  arr1: T[],
  arr2: T[],
  key = (v: T) => (v as any).id
) => {
  const map = new Map()
  for (let it of arr2) {
    map.set(key(it), it)
  }
  for (let it of arr1) {
    const k = key(it)
    if (map.has(k)) {
      Object.assign(it, map.get(k))
    }
  }
}

export const createMap = <T, K extends string | number>(data: T[], key: (v: T) => K) => {
  const map = new Map<K, T>()
  data.forEach((it) => {
    map.set(key(it), it)
  })
  return map
}

export const createDict = <T, K extends string | number>(data: T[], key: (v: T) => K) => {
  const map = {} as Record<K, T>
  data.forEach((it) => {
    map[key(it)] = it
  })
  return map
}

// arr 但是没有顺序
export const createShuffleArr = <T>(getId = (v: T) => (v as { id: string }).id) => {
  const map = new Map<string, number>() // {[id]:index}
  const arr = [] as T[] // {id:xxx,otherinfo}[]

  const del = (id: string) => {
    if (map.has(id)) {
      const index = map.get(id)!
      let it = arr[arr.length - 1]
      arr[index] = it
      map.set(id, index)
      map.delete(id)
      arr.pop()
    }
  }
  const add = (it: T) => {
    const id = getId(it)
    if (!map.has(id)) {
      map.set(id, arr.length)
      arr.push(it)
    }
  }
  const has = (id: string) => {
    return map.has(id)
  }
  const count = () => {
    return arr.length
  }
  const get = (id: string) => {
    return arr[map.get(id)!]
  }
  const clear = () => {
    arr.length = 0
    map.clear()
  }
  return {
    has,
    get,
    clear,
    count,
    add,
    del,
    getArr: () => arr
  }
}

/** 会打乱顺序*/
export const removeIndex = (arr: any[], i: number) => {
  arr[i] = arr[arr.length - 1]
  return arr.pop()
}
/**删除数组中的某个元素，比filter快，会打乱顺序 */
export const removeItem = <T>(arr: T[], find: (v: T) => boolean | void) => {
  const index = arr.findIndex(find)
  if (index > -1) return removeIndex(arr, index)
}

export const unique = <T>(...args: (T[] | undefined | null | T)[]) => {
  return [...new Set(args.reduce<T[]>((a, b) => a.concat(b || []), []))]
}

/**
 * key: 返回arr元素唯一标识，如果相同标识，则运行第三个函数
 * */
export const mergeArrWith = <T>(arr: T[], key: (v: T) => string, merge: (pre: T, nw: T) => T) => {
  const map = new Map<string, T>()
  arr.forEach((it) => {
    const k = key(it)
    let value = map.has(k) ? merge(map.get(k)!, it) : it
    map.set(k, value)
  })
  return [...map.values()]
}
