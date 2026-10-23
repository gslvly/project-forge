import { Comment, Fragment, Text } from 'vue'

/** 空节点：v-if 为假会留下注释节点，空 Fragment / 纯空白文本同样视为没内容 */
const isEmptyVnode = (node: VNode): boolean => {
  if (node.type === Comment) return true
  if (node.type === Fragment) return ((node.children as VNode[]) || []).every(isEmptyVnode)
  if (node.type === Text) return !String(node.children ?? '').trim()
  return false
}

export const hasSlots = (children?: VNode[]) => {
  return children?.some((it: VNode) => !isEmptyVnode(it))
}
