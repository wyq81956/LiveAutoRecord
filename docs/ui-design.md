# 界面设计

界面参考 [beUI](https://beui.dev/) 的主题、卡片、开关和按钮交互，以 Vue 3 和现有 Vuetify 组件实现。beUI 的公开组件面向 React 19 / Motion，本项目没有安装 React 或直接使用其 TSX 源码。

## 设计入口

- `apps/web/src/beui.css`：颜色、表面、间距、圆角、导航、设置布局和动效。
- `apps/web/src/main.ts`：Vuetify 主题与输入框、按钮等默认配置。
- `apps/web/src/components/SettingsToggle.vue`：带标题和说明的开关设置行。
- `apps/web/src/views/RecordersManage/Settings.vue`：分区导航和固定保存栏；保存状态仍由 `settings-state.ts` 管理。

主导航覆盖录制任务、历史和设置。设置分区始终挂载，点击侧栏滚动到相应区域，避免切换时丢失草稿。窄屏下侧栏变为横向导航，平台操作自动换行。按钮提供按下反馈；系统开启减少动态效果后禁用位移和滚动动画。开关保留可访问名称，状态提示使用实时播报，页面跳转沿用未保存修改提醒。

参考：[主题](https://beui.dev/docs/theme)、[卡片](https://beui.dev/components/motion/card)、[按钮](https://beui.dev/components/motion/button)、[开关](https://beui.dev/components/motion/switch)。这些是设计参考，本地适配组件独立实现；若以后复制 beUI 的公开源代码，应同时保留其 MIT 版权与许可声明。
