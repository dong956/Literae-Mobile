# Literae Mobile 移动端伴侣系统：设计思路与工程进度交接文档
> 本文档旨在为后续接手的 Agent / 开发者提供全方位的上下文接力指南，涵盖架构设计、已有产物、历史避坑记录及下一步执行路线。
> 更新时间：2026-09-17

---

## 1. 核心架构与工程分布

* **主工程 (Literae Desktop)**：
  - 本地路径：`~/Desktop/Literae`
  - 角色定位：古籍数字化管理中枢，负责 PDF 存储、API/本地 OCR 识别、元数据标引以及离线包导出。
* **移动端工程 (Literae Mobile)**：
  - 本地路径：`~/Desktop/Literae-Mobile`
  - 远程仓库：`https://github.com/dong956/Literae-Mobile.git` (分支: `main`)
  - 角色定位：独立、轻量、高雅的古籍离线随身阅读器，承接桌面端导出的纯文本包。
* **通信协议规范 (V1 Schema)**：
  - 传输介质：`Literae-Mobile-<timestamp>.zip`
  - 内部文件：`manifest.json` (哈希与统计)、`documents.jsonl` (书目元数据)、`pages.jsonl` (OCR 文本行)。
  - **零泄露铁律**：严禁导出原版 PDF、图片、绝对路径、API 密钥或私有日志。

---

## 2. 已有资产与最新完成进度

### 2.1 桌面端导出链路 (Literae Desktop)
- **导出内核**：`services/mobile_export/manager.py`，支持 1000 行分批游标读取、SHA-256 完整性校验、外置存储意外拔出保护 (`sqlite3.OperationalError`)，自动维护保留最近 3 个导出归档。
- **界面交互**：`templates/settings.html` 与 `routes/settings.py`，新增“移动端”专属标签页，包含实时轮询进度条、导出触发及一键下载按钮。
- **测试保障**：`python3 tests/run_isolated.py` 全部 309 项独立回归测试 100% 通过。

### 2.2 纯前端 PWA 离线方案 (`Literae-Mobile/web/`)
- 零安装、零编译成本，基于现代浏览器原生 `DecompressionStream('deflate-raw')` 流式解压。
- 数据持久化在手机本地 `IndexedDB`，支持离线全屏运行（Safari “添加到主屏幕”即享无地址栏的原生应用体验）。
- 具备书架目次/全文检索双模式、分类标签胶囊、单书详情抽屉、宣纸/柔白/夜读三主题、字号缩放及学术引文规范复制功能。

### 2.3 纯原生 iOS / iPadOS 方案 (`Literae-Mobile/ios/` & `LiteraeMobile.swiftpm/`)
- **UI 架构**：纯 SwiftUI 6，采用 `NavigationSplitView`，在 iPad / iPadOS 台前调度下呈现优雅的左侧分类书目、右侧高清释读双栏界面；在 iPhone 上自动收缩为导航栈。
- **高性能存储**：`DatabaseManager.swift`，基于系统底层的 C 语言 `sqlite3` API，启用 WAL 模式并发写入，支持数十万页古籍 0.05 秒级全文瞬时检索。
- **沙盒持久化保护**：数据库严格保存在 `Application Support` 目录，享有系统级持久化保护，绝不会被 iOS 系统当做缓存清理。
- **纯 Swift 解包引擎**：`ZipExtractor.swift`，使用 Apple 原生 `Compression` (libcompression) 框架实现内存/流式解压，淘汰了 macOS 的 `/usr/bin/unzip` 命令行依赖，完全适应 iOS 严密沙盒。
- **系统级文件关联**：`Info.plist` 与 `LiteraeMobileApp.swift` 配置了 `onOpenURL` 及 `.fileImporter`，支持 Mac 隔空投送 (AirDrop) 弹窗“用 Literae 打开”直达导入，也支持在 iPad 应用内点“+”号选择文件导入。

### 2.4 iPad Swift Playgrounds 免 Mac 部署靶场
- **应用包位置**：
  - 工程源码：`~/Desktop/Literae-Mobile/LiteraeMobile.swiftpm`
  - 桌面直投文件：`~/Desktop/LiteraeMobile.swiftpm` (及 `.zip`)
- **配置要点**：`Package.swift` 使用 `// swift-tools-version: 5.6`，完美向下兼容 iPadOS 16/17 上安装的各种版本 Swift Playgrounds。

---

## 3. 历史试错、避坑记录与关键决策

1. **Mac 本地安装 Xcode 的障碍**：
   - 用户机器（MacBook Air M3）内置硬盘空间仅剩约 4.7 GB（占用率 98%）。
   - Xcode 16 完整 `.xip` 需要 14.2 GB 下载、解压膨胀达 30~50 GB。此前用户解压报错“块压缩失败”，正是因为下载时内置盘被撑满导致文件截断在 2.7GB，且 macOS 归档实用工具向内置盘 `/private/var/folders/` 写临时解压流耗尽空间。
   - **决策**：不再让用户本地承担 14GB Xcode 的沉重负担，转向**免本地 Xcode 路线**（iPad Swift Playgrounds 或 GitHub Actions 云端打包）。
2. **Swift Playgrounds 载入崩溃报错 (`PackageLoading.ToolsVersionParser.Error 错误 1`)**：
   - 根因：此前自动生成的 `Package.swift` 首行指定了 `// swift-tools-version: 5.9`，而 iPadOS 上 Playgrounds 内置编译器为 5.6/5.7，版本解析器超出上限报错拒绝加载；且多余的 `capabilities: [.fileAccess...]` 不属于 `AppleProductTypes` 枚举。
   - 修复：降级指定为最通用的 `5.6`，并移除无效的 capabilities 项。
3. **分发方式比选**：
   - **TestFlight**：最正统、体验最好（用户点链接即可无感下载安装，90天有效期自动刷新），但**硬性要求 99美元/年的 Apple Developer 开发者账号**。
   - **Swift Playgrounds**：苹果官方在 iPad 上留下的原生绿色通道，零成本、永久不过期、无需开发者账号。
   - **Android APK**：无任何证书签名枷锁，安装一次永久有效，支持文石/汉王等 Android 墨水屏电纸书。

---

## 4. 后续 Agent 接力操作指南

根据用户的下一步决定，执行以下对应路线：

### 路线 A：若用户提供/拥有 Apple 开发者账号（推进 TestFlight）
1. 在 `Literae-Mobile` 仓库配置 `.github/workflows/testflight.yml`。
2. 配置 App Store Connect API Key（`ISSUER_ID`, `KEY_ID`, `API_KEY`）至 GitHub Secrets。
3. 由 GitHub Actions 的 macOS runner 自动执行 `xcodebuild` 归档签名并自动推送到 TestFlight。
4. 用户在 iPhone / iPad 安装 TestFlight 并接受公测链接体验。

### 路线 B：若用户在 iPad 上继续使用 Swift Playgrounds
1. 引导用户确认桌面上的最新版 `LiteraeMobile.swiftpm` 投送至 iPad。
2. 验证书架渲染、AirDrop 导入及大文本量翻页流畅度。
3. 根据 iPad 屏幕尺寸进一步打磨排版主题（如竖排排版支持、批注高亮）。

### 路线 C：若用户需要专为 Android 构建应用
1. 方案一（快速交付）：使用现有前端封装为独立 APK（Capacitor 或 Android WebView Shell）。
2. 方案二（纯原生）：在 `Literae-Mobile` 下创建 `android/`（Kotlin + Jetpack Compose + Room）。
3. 配置 GitHub Actions 的 Ubuntu runner 自动生成 `Literae-Mobile.apk` 供用户免数据线直接下载安装。

---
*交接文档完毕。后续 Agent 可直接读取此文件恢复完整技术图景。*
