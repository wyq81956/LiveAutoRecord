import { createI18n } from 'vue-i18n'
import zhMessages from './messages/zh'
import ruMessages from './messages/ru'
import enMessages from './messages/en'
import { en as vuetifyEN, zhHans as vuetifyZHHans, ru as vuetifyRU } from 'vuetify/locale'
import { enUS as dateEN, zhCN as dateZH, ru as dateRU } from 'date-fns/locale'
import { format, formatDuration } from 'date-fns'

// 先用系统语言渲染界面，服务端设置在 RecordService.init 中异步应用。
// 服务端不可用时仍能显示加载错误和重试入口。
const language = navigator.language.toLowerCase().split(/[-_]/)[0]
const locale: string = ['zh', 'en', 'ru'].includes(language) ? language : 'en'

export const i18nOpts = {
  legacy: false,
  locale,
  // 系统语言没匹配到的话大概率不是中文使用者，所以默认英文
  fallbackLocale: 'en',
  messages: {
    zh: { $vuetify: vuetifyZHHans, ...zhMessages },
    ru: { $vuetify: vuetifyRU, ...ruMessages },
    en: { $vuetify: vuetifyEN, ...enMessages },
  },
} as const

export const i18n = createI18n(i18nOpts)

export function setLocale(locale: string) {
  const language = locale.toLowerCase().split(/[-_]/)[0]
  i18n.global.locale.value = language === 'zh' || language === 'en' || language === 'ru' ? language : 'en'
}

const dateLocaleMap = {
  en: dateEN,
  zh: dateZH,
  ru: dateRU,
} as const

export function useDateFNS() {
  function wrapFormatFN<T extends (...args: any[]) => any>(fn: T): T {
    return function (...args: Parameters<T>) {
      return fn(...args, { locale: dateLocaleMap[i18n.global.locale.value] })
    } as T
  }

  return {
    format: wrapFormatFN(format),
    formatDuration: wrapFormatFN(formatDuration),
  }
}
