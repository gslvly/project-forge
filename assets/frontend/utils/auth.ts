/**
 * 登录态本地存储，统一收口 localStorage 的 key 与序列化，
 * 避免字符串 key 散落在各处。
 */

type AuthUser = any;

const TOKEN_KEY = "xxx";
const USER_KEY = "xxx";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

export function getUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    // 存储内容被外部改坏时当作未登录处理
    return null;
  }
}

export function isAdmin() {
  return getUser()?.role === "admin";
}

export function setAuth(token: string, user: AuthUser) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

/** 只更新用户信息，token 不变；用于角色、昵称被后台改动后的同步 */
export function setUser(user: AuthUser) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}
