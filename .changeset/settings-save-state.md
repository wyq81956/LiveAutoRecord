---
'@autorecord/http-server': patch
'@autorecord/web': patch
'@autorecord/cli': patch
---

修复设置保存时丢失平台鉴权配置的问题，完善设置页加载、修改检测、失败重试和平台登录操作状态。应用设置按改动字段合并保存，避免并发请求覆盖其他设置。
