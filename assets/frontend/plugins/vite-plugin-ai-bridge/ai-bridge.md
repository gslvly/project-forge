# ai-bridge

在 dev 页面里求值，读应用运行时状态（dev server 起着时可用）：

```bash
curl -s -X POST "localhost:$(cat node_modules/.ai-bridge-port)/__ai/exec" --data 'document.title'
```

- 支持 `await`；多语句要显式 `return`
- 读项目模块用 `/src/` 绝对路径，**alias 不生效**（求值代码不经 vite 转换）。拿到的是应用正在用的实例，不是新副本：

  ```js
  (await import('/src/utils/tool.ts')).clean
  ```

- 调试用的东西挂到页面上就行，刷新即清，别写进业务代码
