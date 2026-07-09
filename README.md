# LECTURA Vocabulary Builder

一款浏览器词汇学习扩展。在网页上选中单词 → 即刻查词 → 自动高亮 → 侧边栏闪卡复习。**完全离线优先，可选 LLM 增强。**

[![Version](https://img.shields.io/badge/version-1.1.0-blue)](https://github.com/Wayfinder-Lee/lectura-extension)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

---

## ✨ 功能

- **📖 即选即查**：选中任意网页上的英文单词，毛玻璃弹窗即刻显示音标、词性、释义、考试等级（四六级/托福/雅思/GRE/中考/高考）
- **🤖 LLM 增强**（可选）：离线词典未收录的词，自动调用 LLM（DeepSeek / OpenAI / Anthropic）生成完整释义。DeepSeek 国内直接可用，注册送免费额度
- **🎨 网页高亮标注**：收藏的单词在你访问的**所有网页**上自动高亮。6 种马卡龙配色，已掌握的单词变为虚线下划线
- **📋 闪卡管理**：侧边栏卡片列表，支持拖拽排序、右键编辑、颜色筛选、批量操作
- **🔄 变形识别**：选中 `assigned` → 查到 `assign`，选中 `children` → 查到 `child`
- **📖 沉浸式阅读模式**：内置阅读器，字号/行高/段距/字体/纸色可调，caption 和小标题自动识别
- **🔗 链接屏蔽**：按住 `Alt` 键可在链接上选词，松开恢复
- **💬 取词气泡**：极简圆形"学习"浮动按钮模式，适合精读
- **⌨ 快捷键**：`Ctrl+Shift+L` 呼出侧边栏（可在 Chrome 快捷键设置中自定义）
- **🌐 完全离线**：ECDICT 词典内置 5 万+ 词汇，储存在浏览器 IndexedDB 中，无网络延迟
- **📤 多格式导出**：JSON / CSV / Anki 兼容格式

## 📦 安装

### Chrome / Edge

1. 下载 [最新 Release](https://github.com/Wayfinder-Lee/lectura-extension/releases) 或克隆仓库
2. 打开 `chrome://extensions/`（Edge 是 `edge://extensions/`）
3. 开启右上角 **开发者模式**
4. 点击 **加载已解压的扩展程序** → 选择项目文件夹
5. （可选）生成词典数据：`node scripts/build-dict.js`

### 配置 LLM（可选）

1. 右键扩展图标 → **选项** 或侧边栏齿轮图标 → 打开设置页面
2. 展开 "LLM API 设置"
3. 推荐选择 **DeepSeek**（国内直连，注册即送免费额度）
4. 填入 API Key
5. 查词失败时自动调用 LLM 生成完整释义

## 🎯 使用场景

- 📰 阅读 BBC / Reuters / The Guardian 等英文新闻
- 📚 浏览英文文献/论文时快速查词
- 🎓 备考四六级 / 托福 / 雅思 / GRE，在真实语境中记忆单词
- 📖 使用内置阅读模式沉浸式阅读英文文章

## ⌨ 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+Shift+L` | 呼出/切换侧边栏 |
| 按住 `Alt` | 临时屏蔽链接（在链接上选词） |
| `Esc` | 关闭弹窗 |

## 🔒 隐私

- **不收集、不存储、不传输**任何个人数据
- 所有词汇数据保存在浏览器本地
- LLM API Key 仅存储在本地，直连 LLM 提供商
- 无任何遥测、无第三方追踪

## 🛠 技术栈

- **词典**：ECDICT（5 万+ 词汇，MIT 开源）
- **LLM**：OpenAI 兼容接口（DeepSeek / OpenAI / Anthropic）
- **存储**：chrome.storage.local + IndexedDB
- **高亮**：Trie 树 O(n) 文本匹配 + MutationObserver 动态监听
- **阅读器**：字号扫描自动识别正文/标题/caption

## 📄 许可

MIT License

词典数据来自 [skywind3000/ECDICT](https://github.com/skywind3000/ECDICT)（MIT License）。
