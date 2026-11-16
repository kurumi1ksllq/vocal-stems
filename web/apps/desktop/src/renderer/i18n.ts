/**
 * i18n —— 渲染进程实例。
 *
 * 资源随包打包（不用 http backend），关闭 Suspense：
 * 本地资源同步可用，闪一下加载态没有意义。
 */
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { en } from './locales/en.ts'
import { zhCN } from './locales/zh-CN.ts'

void i18n.use(initReactI18next).init({
  resources: {
    'zh-CN': { translation: zhCN },
    en: { translation: en },
  },
  lng: 'zh-CN',
  fallbackLng: 'zh-CN',
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
  returnNull: false,
})

export default i18n
