# 听潮 SONAR

现代音乐探索界面：动态极光背景、可拖动的封面叠层、模糊转场、横向热歌浏览、悬浮播放器和沉浸播放视图。保留双平台榜单、官方试听、收藏与心情推荐。

## 构建

无第三方依赖。`npm run build` 将页面、样式、脚本与真实榜单快照打包为 `dist/server/index.js`，默认导出 Cloudflare Worker fetch handler。`npm test` 执行推荐、Worker 路由与真实页面脚本的 DOM 交互检查。`motion.js` 提供轻量 WebGL 极光与指针视差，支持减少动态效果偏好与后台暂停。

## 数据与更新

`/api/charts` 从网易云热歌榜与 iTunes 美国榜读取公开数据，按 UTC 日期使用 Workers Cache API 缓存。当日首次访问获取，无需每天重新部署。源异常时使用注明原更新时间的构建快照，15 分钟后重试。没有声称覆盖全网所有平台或生成全球统一排名。平台独立排名交替呈现。

推荐是本地类型、标题关键词、榜单排名与收藏偏好的规则排序；每日种子变化，点击重新生成可探索不同选择。收藏和音乐口味保存在 localStorage。音频仅使用上游官方试听链接，不下载或提供完整版权音频。

## 环境限制

此会话未挂载 Sites 脚本与 Vinext 模板，因此采用符合相同部署格式的零依赖 Worker，自行确定性构建。未挂载 cua_repl.js，按 Sites 技能跳过浏览器 QA，没有启动备用预览控制路径。执行 Node 语法、构建和行为测试。部署使用同一站点身份、源代码 Git 提交及其精确构建产物。

## 播放栏折射

`glass-optics.js` 根据圆角矩形曲面与折射角生成位移图，中心保持透明，边缘弯曲实际页面内容。`glass-renderer.js` 将不可交互、对辅助技术隐藏的页面视图裁切到播放栏，使用 SVG 三通道位移实现折射与轻微色散；无需浏览器支持 SVG backdrop-filter，也未用高斯模糊代替折射。地图仅在尺寸改变时重建，滚动时更新视图坐标。

## GitHub Pages

静态网站使用 `docs/` 目录。运行 `npm run build:pages` 生成网页与 `docs/api/charts.json`；联网时将从网易云热歌榜和 iTunes 美国榜获取最新数据，单个平台失败时沿用已有、保留时间的快照。网站在访客打开时还会尝试从 iTunes 获取实时数据，音乐推荐、试听、收藏均在浏览器工作。

仓库的 GitHub Actions 每天 01:10 UTC 刷新两份榜单并更新 `docs/`，更新后会主动请求 Pages 重新构建；也可以在 Actions 中手动运行 “Update daily music charts”。GitHub Pages 需使用 `main` 分支的 `/docs` 目录作为来源。
