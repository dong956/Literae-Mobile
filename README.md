# Literae Mobile · 随身文库

> **Literae 桌面端的轻量级移动端阅读与检索伴侣。**
> 面向文史研究者与学术读者，将桌面文库中的 OCR 识别文本随时随地随身查阅，兼顾极致隐私与优雅审美。

---

## 🌟 核心特性

- **📱 纯离线零安装（PWA 网页应用）**：通过手机浏览器打开，点击“添加到主屏幕”，即可像独立 App 一样全屏离线运行。
- **🔒 绝对隐私保证（Zero-Leak Guarantee）**：仅导出 OCR 识别文本与书目元数据，不导出原版 PDF、原图、系统绝对路径或 API 密钥。数据 100% 存放在读者设备本地的 IndexedDB / SQLite 中，完全不消耗任何云端流量，不经过任何服务器。
- **⚡ 毫秒级全文检索**：支持快速检索人名、地名、事件或文献原句，高亮上下文并直达对应页码。
- **📜 典雅古籍排版**：具备宣纸、柔白、夜读三种经典阅读主题，支持字号无级缩放与底端顺序翻页。
- **📑 学术引文一键复制**：阅读器内置规范学术引用生成器，一键复制标准格式文献引文（著者、篇名、出版项与当前页码）。
- **🍎 原生 iOS / iPadOS 支持**：包含纯原生 SwiftUI 6 工程与 Swift Playgrounds 应用包（`LiteraeMobile.swiftpm`），支持 iPad 双栏目次分屏与 AirDrop 隔空投送自动无缝入库。

---

## 🚀 快速上手

### 1. 网页端 / 手机端即开即用（推荐）

直接在手机（iPhone / iPad / Android）或电脑浏览器中打开：

👉 **[https://dong956.github.io/Literae-Mobile/](https://dong956.github.io/Literae-Mobile/)**

1. **添加到主屏幕**：
   - **iPhone / iPad**：在 Safari 底部点击【分享 ⎋】➔【添加到主屏幕】；
   - **Android / 墨水屏平板**：在 Chrome 或系统浏览器菜单中点击【安装应用】或【添加到桌面】；
2. **导入文库**：
   - 从 Literae 桌面版设置页导出 `Literae-Mobile-*.zip`；
   - 在手机端点击“选择数据包”导入，文献瞬间建立本地索引。

### 2. iPad Swift Playgrounds 原生运行

1. 在 iPad 上安装官方免费的 **Swift Playgrounds**；
2. 将本仓库中的 `LiteraeMobile.swiftpm` 通过 AirDrop（隔空投送）发送至 iPad 打开；
3. 点击顶部的 **▶ 运行** 按钮，即可启动 iPad 原生双栏阅读器。

---

## 📂 仓库目录结构

```text
├── docs/                    # GitHub Pages 静态托管站点（包含 Web 版离线应用）
├── web/                     # PWA 源代码与离线 Service Worker
├── ios/                     # 纯原生 SwiftUI 6 + SQLite3 iOS/iPadOS Xcode 工程
├── LiteraeMobile.swiftpm/   # iPad Swift Playgrounds 官方工程包
├── AGENT_HANDOFF.md         # 设计思路与架构交接说明
└── LICENSE                  # MIT 开源许可证
```

---

## 📄 许可证

本项目采用 [MIT License](LICENSE) 授权开源。
