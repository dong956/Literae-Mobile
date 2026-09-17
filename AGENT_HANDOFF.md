# Literae Mobile 移动端伴侣系统：对话全景、最新进度与接力指南
> 本文档记录了近期关于移动端建设的关键决策、工程交付、避坑记录及未来接力方向，供后续接手的 Agent / 开发者无缝衔接。
> 最新更新时间：2026-09-17

---

## 1. 核心业务定位与战略决策

1. **服务人群定位**：
   - 不仅服务于开发者本人，核心目标是**面向广大文史学者、高校师生及古籍研读爱好者**。
   - 核心铁律：**“一般用户门槛不能太高，拒绝折腾”**。
2. **多技术路线评估与最终定调**：
   - ❌ **AltStore / SideStore（淘汰）**：需要连接电脑、输入个人 Apple ID 密码（涉及严重隐私忌讳）、开启开发者模式并强制重启，普通用户 99% 会在第一步放弃。
   - ❌ **TrollStore 巨魔商店（淘汰）**：只支持极少数老旧 iOS 版本（iOS 14~16.6.1 或 17.0），绝大多数读者的设备系统都已自动更新，根本无法安装。
   - ❌ **本地 14GB Xcode（淘汰）**：因 Mac 内置固态硬盘仅剩 ~4.7GB 空间，解压 .xip 必定引发“块压缩失败”（空间耗尽），坚决放弃在本地安装完整 Xcode。
   - ⏳ **TestFlight（备用/未来期）**：需 $99/年 Apple 开发者账号；未来若有经费或机构账号，可通过 GitHub Actions 云端自动打包上架供读者免审测试。
   - 🏆 **最终选定主流方案：PWA 离线随身文库（添加到主屏幕）**：
     - **门槛为 0**：手机打开网址，点【分享】➔【添加到主屏幕】即可。
     - **体验等同原生**：全屏无地址栏、断网离线可用、数据 100% 存放在手机本地 IndexedDB。
     - **全平台通杀**：iPhone、iPad、Android 手机、安卓墨水屏平板（文石/汉王）全兼容。

---

## 2. 工程现状与最新交付资产

### 2.1 桌面端导出系统 (Literae Desktop, `~/Desktop/Literae`)
- **后台导出内核**：`services/mobile_export/manager.py`，1000 行分批读取、外置存储意外拔出容错、SHA-256 校验，保留最近 3 个导出包。
- **前端操作页**：`templates/settings.html` 与 `routes/settings.py`，新增“移动端”标签页，支持实时进度轮询、后台异步打包与一键下载。
- **测试状态**：`python3 tests/run_isolated.py` 全部 309 项回归测试持续 100% 通过。

### 2.2 移动端工程 (Literae Mobile, `~/Desktop/Literae-Mobile`)
- **远程代码仓库**：`https://github.com/dong956/Literae-Mobile.git` (主分支: `main`)。
- **静态部署架构 (`docs/`)**：
  - 代码镜像放置于 `/docs` 目录，直接契合 GitHub Pages 原生“Deploy from a branch (`main /docs`)”机制，避免了个人 Token 缺少 `workflow` 权限无法推送 Actions 的阻碍。
- **高审美典雅设计与图标**：
  - 已生成全套专属应用图标（`apple-touch-icon.png`、`icon-192.png`、`icon-512.png`、`favicon.png`），采用朱红底色、泥金边框、宋体“典”字印章纹样。
  - 新增新手指引横幅：针对 Safari / Chrome 普通网页访问时提醒“添加到主屏幕”，添加到主屏幕全屏运行后自动隐匿。
  - Service Worker (v2) 完善静态离线资源预缓存。
- **iPad Swift 原生应用包 (`LiteraeMobile.swiftpm`)**：
  - 基于 SwiftUI 6 + 原生 SQLite3（WAL 模式）+ 纯 Swift `ZipExtractor`（基于 Apple 原生 `Compression` 框架）。
  - `Package.swift` 已降级兼容至 `// swift-tools-version: 5.6`，解决 iPad Playgrounds 报错 `ToolsVersionParser.Error 1` 的问题。
- **开源合规与安全防护**：
  - 全仓库 0 泄露：无 API Key、无 Token、无用户私有文献或 PDF 夹带。
  - 路径脱敏：文档中本地绝对路径已脱敏为 `~/Desktop/...`。
  - 配齐 `.gitignore`（过滤 `.DS_Store`、`*.zip`、`DerivedData/`）与 `MIT License`。
  - 编写了规范详尽的中文 `README.md`。

---

## 3. 当前所处节点（Current State）

用户正在进行 **“阿里云自定义域名（Custom Domain）绑定”** 操作：
1. **GitHub Pages 目标**：将默认的长链接 `https://dong956.github.io/Literae-Mobile/` 升级为用户专属域名（例如 `reader.用户的域名.com`）。
2. **阿里云 DNS 配置状态**：
   - 记录类型：`CNAME`
   - 主机记录：`reader`（或自定义前缀）
   - 记录值：`dong956.github.io`
3. **GitHub 端绑定状态**：等待用户在阿里云保存记录后，前往 GitHub 仓库设置页（`settings/pages`）填入自定义域名并勾选 `Enforce HTTPS`。

---

## 4. 后续 Agent 接力方向与可执行任务（Next Steps）

接手 Agent 请视用户反馈按以下优先级协同推进：

### 任务一：协助确认自定义域名生效与上线
1. 指导用户验证阿里云 DNS 解析是否全球生效（可通过终端 `ping reader.xxx.com` 确认返回 GitHub IP `185.199.xxx.xxx`）。
2. 协助用户在 GitHub Pages 设置页保存自定义域名，并确认“Enforce HTTPS”证书申请通过。
3. 确认手机通过该域名访问时能够顺畅显示古籍阅读器界面并成功“添加到主屏幕”。

### 任务二：实测端到端数据流转（从 Mac 到手机）
1. 在 Mac 电脑上启动 Literae 桌面端，在“设置 ➔ 移动端”点击生成一份真实的 `Literae-Mobile-*.zip`。
2. 将该 ZIP 传输至手机（AirDrop 或微信），在自定义域名阅读器中点击“选择数据包”导入。
3. 验证功能闭环：书目书脊展示、分类胶囊过滤、单书目次展开、宣纸/夜读主题切换、学术引文一键复制。

### 任务三：优化桌面端联动（扫码即开）
1. 在桌面端 `templates/settings.html` 的“移动端”标签页中，加入用户专属自定义域名的展示。
2. （可选）引入轻量静态 QR 码生成，桌面端导出完成后直接生成二维码，手机摄像头一扫直接在 Safari 中打开并导入，达成完全无缝的用户体验。

### 任务四：针对安卓/墨水屏电纸书微调排版（若用户提出）
1. 对文石（BOOX）、墨案等 Android 墨水屏阅读器，微调一套高对比度黑白 CSS 模式（禁用灰色渐变，纯黑纯白硬边缘排版）。
2. 如有打包离线 APK 需求，可通过 GitHub Actions 配置极简 WebView 容器快速生成 APK。

---
*交接文档完毕。后继 Agent 读完此文即可全盘掌握所有技术与业务背景，直接响应用户！*
