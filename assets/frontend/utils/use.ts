import { getStorage, getStore, hasStorage, setStorage } from './storage'

export const createUseLifeCircle = (start: () => void, stop: () => void) => {
  let isActive = false
  const _start = () => {
    if (!isActive) {
      isActive = true
      start()
    }
  }
  const _stop = () => {
    if (isActive) {
      isActive = false
      stop()
    }
  }

  if (getCurrentInstance()) {
    // keep-alive中的子、孙组建会触发，keep-alive的直接子组建会在mounted时同时触发，onMounted -> onActivated
    onMounted(_start)
    onActivated(_start)
    // keep-alive的直接子组建会在onMounted时同时触发，onDeactivated -> onUnmounted
    onDeactivated(_stop)
    onBeforeUnmount(_stop)
  } else {
    _start()
  }
}

export const useSetInterval = (fn: () => void, time: number) => {
  let interval: number
  const _setInterval = () => {
    clearInterval(interval)
    interval = window.setInterval(() => {
      fn()
    }, time)
  }

  // keep-alive中的子、孙组建会触发，keep-alive的直接子组建会在mounted时同时触发，onMounted -> onActivated
  onActivated(() => {
    _setInterval()
  })
  onBeforeUnmount(() => clearInterval(interval))

  // keep-alive的直接子组建会在onMounted时同时触发，onDeactivated -> onUnmounted
  onDeactivated(() => clearInterval(interval))
  _setInterval()
}

export const useBeforeunloadPrompt = () => {
  if (import.meta.env.DEV) return

  window.onbeforeunload = () => true

  onBeforeUnmount(() => {
    window.onbeforeunload = null
  })
  onDeactivated(() => {
    window.onbeforeunload = null
  })

  onActivated(() => (window.onbeforeunload = () => true))
}

/**注册事件，在组建删除时自动删除 */
export const useWindowEvent = <T extends keyof WindowEventMap>(
  e: T,
  fn: (v: WindowEventMap[T]) => void,
  options?: boolean | AddEventListenerOptions
) => {
  createUseLifeCircle(
    () => window.addEventListener(e, fn, options),
    () => window.removeEventListener(e, fn, options)
  )
}

export const useDocumentEvent = <T extends keyof DocumentEventMap>(
  e: T,
  fn: (v?: DocumentEventMap[T]) => void,
  options?: boolean | AddEventListenerOptions
) => {
  createUseLifeCircle(
    () => document.addEventListener(e, fn, options),
    () => document.removeEventListener(e, fn, options)
  )
}

export const useDomIntersection = (
  dom: HTMLElement | (() => HTMLElement),
  fn: (entry: IntersectionObserverEntry[]) => void
) => {
  const getEl = typeof dom == 'function' ? dom : () => dom
  let observer: IntersectionObserver
  createUseLifeCircle(
    () => {
      const el = getEl()
      if (!el) return
      observer = new IntersectionObserver(fn)
      observer.observe(el)
    },
    () => {
      observer.disconnect()
    }
  )
}

export const useAnimationFrame = (fn: () => void) => {
  let isActive = false

  const nextFrame = () => {
    if (isActive) {
      fn()
      requestAnimationFrame(() => nextFrame())
    }
  }

  const start = () => {
    isActive = true
    nextFrame()
  }

  const stop = () => {
    isActive = false
  }

  createUseLifeCircle(start, stop)
}

export const useDomMutation = (
  dom: HTMLElement | (() => HTMLElement),
  config: MutationObserverInit,
  fn: MutationCallback
) => {
  let ob = new MutationObserver(fn)
  const getEl = typeof dom == 'function' ? dom : () => dom
  createUseLifeCircle(
    () => {
      const el = getEl()
      if (!el) return
      ob.observe(el, config)
    },
    () => {
      ob.disconnect()
    }
  )
}

export const useDomResize = (getEl: () => HTMLElement, onresize: () => void) => {
  const ob = new ResizeObserver(() => {
    onresize()
  })

  createUseLifeCircle(
    () => {
      const el = getEl()
      if (!el) return
      ob.observe(el)
    },
    () => {
      ob.disconnect()
    }
  )
}

/**返回dom的Reactive<DOMRect> */
export const useDomSize = (getEl: () => HTMLElement) => {
  const size = reactive({ x: 0, y: 0, width: 0, height: 0 })
  const setSize = () => {
    const data = getEl().getBoundingClientRect()
    size.height = data.height
    size.x = data.x
    size.y = data.y
    size.width = data.width
    console.log('resize')
  }
  useDomResize(getEl, setSize)
  return size
}

/**
 * 元素内容增长时贴着底部跟随：用户往上翻超过 threshold 后停止跟随，回到底部附近自动恢复。
 * 内容更新后调用 scrollToBottom；首次进入、展开等需要强制贴底的场景传 force。
 */
export const useAutoScroll = (getEl: () => HTMLElement | undefined, threshold = 50) => {
  const stick = ref(true)

  const onScroll = () => {
    const el = getEl()
    if (!el) return
    stick.value = el.scrollHeight - el.scrollTop - el.clientHeight <= threshold
  }

  const scrollToBottom = (force = false) => {
    if (!force && !stick.value) return
    nextTick(() => {
      const el = getEl()
      if (el) el.scrollTop = el.scrollHeight
    })
  }

  return { stick, onScroll, scrollToBottom }
}

/**返回Ref 与localStorage 绑定 */
export const useLocalStorage = (() => {
  let events = [] as ((e: StorageEvent) => void)[]

  const listener = (e: StorageEvent) => {
    events.forEach((fn) => fn(e))
  }

  const addEventListener = (fn: (e: StorageEvent) => void) => {
    if (!events.length) {
      window.addEventListener('storage', listener)
    }

    events.push(fn)
  }
  const removeEventListener = (fn: (e: StorageEvent) => void) => {
    events = events.filter((it) => it !== fn)
    if (!events.length) window.removeEventListener('storage', listener)
  }

  const cache = new Map<
    string,
    {
      data: ReturnType<typeof computed>
      fn: (e: StorageEvent) => void
      count: number
    }
  >()

  return <K extends string, V>(key: K, defaultValue: V) => {
    const clone = <T>(v: T) => JSON.parse(JSON.stringify(v)) as T

    let entry = cache.get(key)
    if (!entry) {
      const _data = ref(hasStorage(key) ? getStorage(key) : clone(defaultValue)) as Ref<V>

      const checkSame = () => {
        return JSON.stringify(_data.value) === getStore(key)
      }

      const data = computed({
        set(v: V) {
          _data.value = v
          setStorage(key, v)
        },
        get(): V {
          return _data.value
        }
      })
      const fn = (e: StorageEvent) => {
        if (e.key !== key) return
        if (checkSame()) return

        _data.value = getStorage(key) || clone(defaultValue)
      }
      entry = { data, fn, count: 0 }
      cache.set(key, entry)
    }

    createUseLifeCircle(
      () => {
        entry!.count++
        if (entry!.count === 1) addEventListener(entry!.fn)
      },
      () => {
        entry!.count--
        if (entry!.count === 0) removeEventListener(entry!.fn)
      }
    )
    return entry.data as import('vue').WritableComputedRef<V>
  }
})()

/**异步获取child,在child挂载时返回 */
export const useQueryChildAsync = (getEl: () => HTMLElement, v: string) => {
  return new Promise<HTMLElement>((resolve, rej) => {
    let ob: MutationObserver | null
    onMounted(() => {
      ob = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const el = node as HTMLElement
              if (el.matches(v)) {
                ob?.disconnect()
                ob = null
                resolve(el)
              }
            }
          })
        })
      })
      ob.observe(getEl(), { childList: true, subtree: true })
    })

    onUnmounted(() => {
      ob?.disconnect()
      rej()
    })
  })
}

export const useAsyncRef = <T>(fn: () => Promise<T>, defaultData?: T) => {
  const data = ref<T>()
  let loading = false
  return {
    get value() {
      if (data.value) return data.value

      if (!loading) {
        loading = true
        fn().then((v) => {
          data.value = v
          loading = false
        })
      }

      return defaultData
    }
  }
}
