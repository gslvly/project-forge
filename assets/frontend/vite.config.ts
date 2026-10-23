import { resolve } from 'path'
import { defineConfig, loadEnv, type PluginOption } from 'vite'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import { allImportElementPlus } from './plugins/vite-plugin-element-plus.ts'
import { generateVersion } from './plugins/vite-plugin-version.ts'
import { iconInsert } from './plugins/vite-plugin-icon-insert.ts'
import { prefetch } from './plugins/vite-plugin-prefetch.ts'
import { htmlDefine } from './plugins/vite-plugin-html-define.ts'
import { svg } from './plugins/vite-plugin-svg.ts'
import { aiBridge } from './plugins/vite-plugin-ai-bridge/index.ts'

// https://vitejs.dev/config/
export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, resolve(process.cwd(), 'env'))
  console.log('NODE_ENV', process.env.NODE_ENV)
  console.log('MODE', mode)
  console.log('COMMAND', command)
  console.log(env)
  const isProdBuild = command === 'build' && mode === 'production'
  let plugins = [
    AutoImport({
      imports: ['vue', 'vue-router'],
      dirs: ['./src/config/mode'],
      vueTemplate: true,
      dts: true
    }),
    allImportElementPlus({ globalImport: true, entry: 'src/main.ts' })
  ]
  if (command === 'build') {
    plugins = [
      AutoImport({
        imports: ['vue', 'vue-router'],
        vueTemplate: true,
        resolvers: [ElementPlusResolver()]
      }),
      Components({
        dirs: [], // 不需要自动按需引入组件
        resolvers: [ElementPlusResolver()]
      })
      // analysis()
    ]
  }

  return {
    envDir: 'env',
    resolve: {
      alias: {
        '@': resolve(process.cwd(), 'src')
      }
    },
    server: {
      port: 8036,
      strictPort: true,
      host: true,
      proxy: {
        // 转发给 FastAPI（backend/），后端路由自带 /api 前缀，无需 rewrite
        '/api': {
          target: env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8000',
          changeOrigin: true
        }
      }
    },

    // 兼容部分第三方包process报错的问题
    define: {
      'process.env': {
        NODE_ENV: JSON.stringify(process.env.NODE_ENV)
      }
    },
    plugins: [
      htmlDefine({
        BUILD_TIME: JSON.stringify(Math.floor(Date.now() / 1000))
      }),
      // AutoImport({
      //   imports: ['vue', 'vue-router'],
      //   dts: true
      // }),
      ...plugins,
      vue(),
      generateVersion(),
      iconInsert({
        svgDir: [
          resolve(process.cwd(), 'src/assets/imgs')
        ],
        src: resolve('src'),
        clean: command === 'build' // 打包清理未使用的 svg 图标
        // clean: true
      }),
      prefetch(),

      svg({ dir: resolve('src/assets'), prefix: 'svg' }),
      aiBridge()
    ] as PluginOption[],
    css: {
      preprocessorOptions: {
        scss: {
          /**sass升级后删除此配置 */
          // silenceDeprecations: ['legacy-js-api'],
          verbose: false,
          additionalData: `
          @use "@/assets/style/mixin.scss" as *;
      `,
          charset: false
        }
      }
    },

    build: {
      // 生产使用 hidden map：容器内可供 AI 按堆栈定位，产物不写 sourceMappingURL。
      sourcemap: isProdBuild ? 'hidden' : true,
      minify: isProdBuild
    },
  }
})
