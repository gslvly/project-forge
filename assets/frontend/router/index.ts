import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { getToken, isAdmin } from '@/utils/auth'

const routes: RouteRecordRaw[] = [
  { path: '/:pathMatch(.*)*', redirect: '/home' }
]

export const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to) => {
  const hasToken = !!getToken()
  const requiresAuth = to.matched.some((record) => record.meta.requiresAuth)

  if (!hasToken && requiresAuth) return '/login'
  // 已登录再进登录页没有意义，直接回首页
  if (hasToken && to.path === '/login') return '/home'
  // 前端拦截只是不给普通用户看见入口，真正的权限由后端接口把关
  if (to.matched.some((record) => record.meta.requiresAdmin) && !isAdmin()) return '/home'

  return true
})

export default router
