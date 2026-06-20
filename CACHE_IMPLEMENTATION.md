# 图片缓存系统 — 实现文档

> 为 Comfyui-Anima-Tools 添加本地持久化图片缓存，解决离线/弱网环境下图片无法加载的问题。

## 概述

在插件根目录下创建 `temp/` 文件夹，通过后端 Python 缓存代理端点 + 前端智能回退逻辑，实现画师/角色预览图的本地持久化缓存。

### 核心工作流

```
在线 + Cache OFF (默认):  浏览器 → CDN 直连 (快速)
                            └─ 加载失败 → onerror → 后端缓存代理 → 本地 temp/
                            
在线 + Cache ON:          浏览器 → 后端缓存代理 → 下载并存入 temp/ → 返回

离线 (之前浏览过):         浏览器 → CDN 失败 → onerror → 后端缓存代理 → temp/ (命中)
```

---

## 修改文件清单

| 文件 | 改动类型 | 说明 |
|------|----------|------|
| `nodes.py` | 新增功能 | 后端缓存代理 API (3 个端点) |
| `js/anima_artist_selector.js` | 新增功能 + 微调 | 缓存按钮 + 图片加载回退 |
| `js/anima_character_selector.js` | 新增功能 + Bug修复 | 缓存按钮 + 图片加载回退 + 修复重复 appendChild |
| `.gitignore` | 配置 | 忽略 temp/ 目录 |

---

## 一、后端 — nodes.py

### 1.1 新增导入

```python
import aiohttp   # HTTP 客户端 (下载图片)
import hashlib   # MD5 hash (生成缓存文件名)
```

### 1.2 缓存目录

```
Comfyui-Anima-Tools/
└── temp/                    ← 新增，自动创建，.gitignore 忽略
    ├── a1b2c3d4...webp      ← MD5 hash 命名
    ├── e5f6g7h8...png
    └── ...
```

生成函数：

```python
def get_temp_path():
    """获取 temp 缓存目录路径，不存在则自动创建"""
    plugin_dir = os.path.dirname(os.path.abspath(__file__))
    temp_dir = os.path.join(plugin_dir, "temp")
    os.makedirs(temp_dir, exist_ok=True)
    return temp_dir

def get_cache_filename(url):
    """MD5(url) + 扩展名 → 唯一缓存文件名"""
    url_hash = hashlib.md5(url.encode()).hexdigest()
    # 根据 URL 中的扩展名决定后缀 (.webp / .png / .jpg)
    ...
```

### 1.3 API 端点

#### `GET /anima-tools/cached-image?url=<encoded_url>`

图片缓存代理。核心逻辑：

1. 校验 URL 域名是否在白名单内（安全防护）
2. 检查 `temp/` 中是否已有缓存 → 有则直接返回（`X-Cache: HIT`）
3. 无缓存则通过 `aiohttp` 异步下载 → 原子写入 `temp/` → 返回（`X-Cache: MISS`）
4. 下载失败返回 404

**域名白名单**（防止 SSRF 攻击）：

| 域名 | 用途 |
|------|------|
| `fastly.jsdelivr.net` | 画师图片 CDN (JsDelivr) |
| `raw.githubusercontent.com` | 画师图片 CDN (GitHub Raw) |
| `cdn.statically.io` | 画师图片 CDN (Statically) |
| `blobs.animadex.net` | 角色图片 CDN (Animadex) |

#### `POST /anima-tools/clear-cache`

清除所有缓存文件，返回删除数量。

#### `GET /anima-tools/cache-stats`

返回缓存统计：文件数量、总大小 (bytes/MB)。

---

## 二、前端 — anima_artist_selector.js

### 2.1 新增状态变量

```javascript
const CACHE_STORAGE_KEY = "anima-selector-use-cache";
let cacheMode = localStorage.getItem(CACHE_STORAGE_KEY) === "true";
```

### 2.2 新增辅助函数

```javascript
// 根据缓存模式返回 CDN 直连 URL 或本地缓存代理 URL
function getImageUrl(partition, id) {
    const cdnUrl = getImgUrl(partition, id);
    if (cacheMode) {
        return `/anima-tools/cached-image?url=${encodeURIComponent(cdnUrl)}`;
    }
    return cdnUrl;
}

// 构造缓存代理 URL (供 onerror 回退使用)
function getCacheProxyUrl(cdnUrl) {
    return `/anima-tools/cached-image?url=${encodeURIComponent(cdnUrl)}`;
}
```

### 2.3 工具栏新增按钮

在 CDN 选择器右侧添加 **"Cache: ON/OFF"** 切换按钮：

- **OFF 状态**：默认样式（灰色）
- **ON 状态**：绿色高亮（`rgba(34, 197, 94, ...)`）
- 点击切换 → 更新 `localStorage` → 重新渲染当前页
- 图标使用 SVG 盒子图标（database/package）

### 2.4 图片加载逻辑改动

**原来**：
```javascript
img.src = getImgUrl(partition, item.id);
img.onerror = () => { /* 显示占位符 */ };
```

**现在**：
```javascript
const originalSrc = getImgUrl(partition, item.id);
img.src = cacheMode ? getCacheProxyUrl(originalSrc) : originalSrc;
img.dataset.cacheTried = "0";

img.onerror = () => {
    // 如果不是缓存模式且还没尝试过缓存 → 回退到本地缓存
    if (!img.dataset.cacheTried && !cacheMode) {
        img.dataset.cacheTried = "1";
        img.src = getCacheProxyUrl(originalSrc);
        return;  // 保留 loader，等待缓存结果
    }
    // 缓存也无 → 显示占位符
    img.style.display = "none";
    loader?.remove();
    placeholder.style.opacity = "1";
};
```

关键点：
- `originalSrc` 保存原始 CDN URL，供 onerror 回退使用
- `dataset.cacheTried` 防止无限循环（缓存失败后不再重试）
- 缓存模式下图片直接走代理，不触发 onerror 回退逻辑

---

## 三、前端 — anima_character_selector.js

改动与画师选择器完全一致，此外修复了一个已有 bug：

### Bug 修复

```diff
-    filterControls.appendChild(sortSelect);   // 第一次
-    filterControls.appendChild(sortSelect);   // 重复！（Bug）
+    filterControls.appendChild(sortSelect);   // 仅一次
```

---

## 四、使用说明

### 日常在线使用

保持 **Cache: OFF**（默认状态）。图片从 CDN 快速加载。如果 CDN 偶尔不可达，自动回退到本地缓存（前提是之前成功加载过）。

### 准备离线环境

1. 在画师选择器或角色选择器面板的工具栏中，点击 📦 按钮切换到 **Cache: ON**
2. 浏览一遍需要的画师/角色（图片会下载并存入 `temp/`）
3. 之后即使断网，切换到 Cache: ON 即可从本地加载所有已缓存的图片
4. 也可随时切回 Cache: OFF 从 CDN 加载新内容

### 缓存管理

- 缓存位置：`Comfyui-Anima-Tools/temp/`
- 可通过 API 查看统计：`GET /anima-tools/cache-stats`
- 可通过 API 清空缓存：`POST /anima-tools/clear-cache`
- 缓存永久保存，不会自动过期，需手动清理

### 缓存模式对比

| 场景 | Cache OFF (默认) | Cache ON |
|------|------------------|----------|
| 在线加载速度 | ⚡ 快 (CDN) | 🐢 较慢 (经后端代理) |
| 离线访问 | ✅ 自动回退 (需有缓存) | ✅ 直接使用缓存 |
| 首次加载 | CDN 直连 | 后端下载 → 缓存 → 返回 |
| 适用场景 | 日常使用 | 准备离线 / 弱网环境 |

---

## 五、架构图

```
┌─────────────────────────────────────────────────────────┐
│                     ComfyUI 前端 (JS)                     │
│                                                         │
│  ┌──────────────────┐    ┌──────────────────┐           │
│  │ Artist Selector  │    │Character Selector│           │
│  │                  │    │                  │           │
│  │ getImageUrl() ───┼────┼── 根据 cacheMode │           │
│  │                  │    │  选择 URL 策略    │           │
│  │ onerror ─────────┼────┼── getCacheProxy  │           │
│  │                  │    │  Url() 回退      │           │
│  └────────┬─────────┘    └────────┬─────────┘           │
│           │                       │                     │
│           └───────────┬───────────┘                     │
│                       ▼                                 │
│     /anima-tools/cached-image?url=...                   │
└───────────────────────┬─────────────────────────────────┘
                        │ HTTP GET
┌───────────────────────▼─────────────────────────────────┐
│                   ComfyUI 后端 (Python)                   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │          get_cached_image(request)               │    │
│  │                                                  │    │
│  │  1. 白名单域名校验 (SSRF 防护)                    │    │
│  │  2. 查 temp/ 缓存 → HIT? → FileResponse          │    │
│  │  3. MISS → aiohttp 下载 → 原子写入 → Response     │    │
│  └──────────────────────┬──────────────────────────┘    │
│                         │                               │
│                         ▼                               │
│  ┌─────────────────────────────────────────────────┐    │
│  │  Comfyui-Anima-Tools/temp/                       │    │
│  │  ├── a1b2c3d4e5...webp  (MD5 hash)              │    │
│  │  ├── f6g7h8i9j0...png                           │    │
│  │  └── ...                                         │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

---

## 六、注意事项

1. **缓存不自动过期**：需手动调用 `/anima-tools/clear-cache` 或手动删除 `temp/` 目录
2. **首次加载较慢**：Cache ON 模式下，首次访问的图片需经后端下载，比 CDN 直连慢
3. **域名白名单**：如需添加新的图片源，编辑 `nodes.py` 中的 `ALLOWED_CACHE_DOMAINS` 列表
4. **磁盘空间**：每张图片约 10-50KB，缓存 1000 张约占用 10-50MB
5. **跨会话持久化**：缓存文件和 `localStorage` 中的 Cache 模式设置均跨 ComfyUI 重启保留

---

## 七、上游同步记录

### 同步记录 #1 — 2026-06-17

通过 `git rebase upstream/main` 将本地 2 个提交 replay 到上游最新 5 个提交之上，保持线性历史。

```
f55ef17  feat: 角色Tag选择器添加输出角色列表          ← 本地 (最新)
9b460c1  feat: 添加本地持久化图片缓存功能              ← 本地
8f7b889  chore: release 1.2.0                         ← 上游
11e064f  Release 1.1.1 cache cleanup                  ← 上游
07b7dc7  Release Anima LoRA loader v1.1.0              ← 上游
5728839  Optimize LoRA selector previews and caching   ← 上游
2f5f518  feat: 优化本地LoRA预览图同目录加载            ← 上游
7d83c4f  feat: change prompt concat order...           ← 共同祖先
```

#### 冲突文件及解决

| 文件 | 冲突类型 | 解决方式 |
|------|----------|----------|
| `nodes.py` | 上游新增 LoRA Loader + Animadex API (~1100行) vs 本地缓存系统 (~220行) | 保留双方代码，上游在前、缓存在后 |
| `nodes.py` | 上游新增 favorites merge 逻辑 vs 本地格式化改动 | 保留上游（更完善的数据合并方案） |
| `js/anima_artist_selector.js` | 上游懒加载 (`imgUrl`) vs 本地缓存回退 (`originalSrc`) | 合并：保留 `imgUrl` 供懒加载 + `originalSrc` 供 onerror 回退 |
| `js/anima_character_selector.js` | 上游角色缓存函数 vs 本地 `getImageUrl`/`getCacheProxyUrl` | 保留双方函数 |
| `js/anima_character_selector.js` | 同上懒加载 vs 缓存回退模式 | 同 artist_selector 合并方案 |

#### 上游新增功能概览

| 上游提交 | 新增内容 | 潜在关联 |
|----------|----------|----------|
| `8f7b889` | chore: release 1.2.0 | 版本号更新 |
| `11e064f` | Release 1.1.1 cache cleanup | 上游也有缓存清理概念，与本地缓存系统独立共存 |
| `07b7dc7` | Anima LoRA loader v1.1.0 | 新增 `AnimaMultiLoraLoader` 节点 + `anima_lora_api.py` |
| `5728839` | LoRA selector previews optimization | 前端 `anima_lora_selector.js` (~3533行新文件) |
| `2f5f518` | 本地LoRA预览图同目录加载 | 优化 LoRA 预览图加载路径 |

#### 关键合并决策

1. **favorites 持久化**：上游重构了 favorites 存储逻辑（新增 `merge_favorites_data`、`normalize_favorites_data`、备份机制、LoRA 收藏分组），本地格式化改动（尾逗号、空行）让位于上游更完善的功能
2. **图片加载**：上游加了懒加载 + 图片缓存 (`isImageLoaded`/`markImageLoaded`)，本地加了缓存代理模式，两者互补合并
3. **路由注册**：上游新增了多个 API 端点（LoRA 管理、Animadex 角色搜索），与本地 3 个缓存端点互不干扰

---

### 同步记录 #2 — 2026-06-20

通过 `git merge upstream/main` 将上游 v3.0.0 合并到本地 fork，保留全部 9 个本地提交。

#### 同步策略

上游发布 v3.0.0 大版本（2 commits：`a5836f7` v2.1.0, `f2dbeb8` release 3.0.0），
本地已有 9 个 commits 在 `8f7b889` 之后。改用 merge（三向合并只解决一次冲突），
避免 rebase 在 9 个 commits 上重复解决冲突。

#### 合并结果

```
78e1770  Merge remote-tracking branch 'upstream/main' (v3.0.0)  ← 合并提交
f2dbeb8  release 3.0.0                                          ← 上游 (最新)
a5836f7  chore: bump version to 2.1.0                            ← 上游
7c06516  fix: 在onNodeCreated中显式创建_character_names...       ← 本地
17f33e1  feat: 角色选择器characters输出端口始终输出纯角色名      ← 本地
48abca3  feat: 角色选择器新增'应用角色名'按钮，输出角色名称      ← 本地
c8b146b  fix: 修复冲突解决时丢失的闭合括号，恢复角色选择器按钮  ← 本地
08fa639  fix: 修复anima_lora_api.py的Pylance类型警告            ← 本地
4f3e857  fix: 修复Pylance对hash.update(chunk)的类型误报          ← 本地
1e0de4e  docs: 记录上游同步过程与冲突解决方案                    ← 本地
f55ef17  feat: 角色Tag选择器添加输出角色列表                    ← 本地
9b460c1  feat: 添加本地持久化图片缓存功能                        ← 本地
8f7b889  chore: release 1.2.0                                   ← 共同祖先
```

#### 冲突文件及解决

| 文件 | 冲突类型 | 解决方式 |
|------|----------|----------|
| `nodes.py` | 上游新增 3 个节点类 + `FAVORITE_SECTIONS` + clothing 收藏 vs 本地缓存系统 + character 输出端口 | 并集保留：上游节点在前、FAVORITE_SECTIONS 取上游、本地缓存系统在底、`_character_names`/双输出保留本地 |
| `nodes.py` | NODE_CLASS_MAPPINGS / NODE_DISPLAY_NAME_MAPPINGS | 并集：上游 3 个新条目 + 本地尾逗号风格 |
| `js/anima_artist_selector.js` | 上游 UI 重设计 + `createPromoLinks` + `cleanArtistToken` 重构 vs 本地 Cache 模式 (`cacheToggleBtn`/`getImageUrl`/`getCacheProxyUrl`) | 自动合并成功：上游样式 + 本地缓存功能共存 |
| `js/anima_character_selector.js` | 上游删除反向同步 + 标签复制功能 + `headerActions` vs 本地保留反向同步 + 缓存 + `_character_names` + ApplyNames | 自动合并 + 手动恢复反向同步逻辑 + 自定义收藏反向同步 |
| `js/i18n.js` | 上游大量新翻译键 vs 本地 "Apply Names" 键 | 自动合并成功，取并集 |

#### 上游新增功能概览

| 上游提交 | 新增内容 | 与本地的关系 |
|----------|----------|-------------|
| `f2dbeb8` | release 3.0.0 | 版本号更新至 3.0.0 |
| `a5836f7` | chore: bump version to 2.1.0 | 版本号过渡 |
| v3.0.0 | `AnimaClothingTagSelector` / Plus / `AnimaPromptComposer` | 3 个新节点 |
| v3.0.0 | `js/clothing_data.js` + `js/anima_clothing_selector.js` | 服装选择器（6764+1914 行） |
| v3.0.0 | `js/anima_prompt_composer.js` | 提示词合成器（611 行） |
| v3.0.0 | `js/anima_promo_links.js` | 推广链接组件 |
| v3.0.0 | `js/i18n.js` 大量新键 + `locales/` 目录 | 国际化扩展 |
| v3.0.0 | artist/character 选择器 UI 重设计 | 分页器、按钮、配色全面更新 |
| v3.0.0 | 角色选择器标签复制功能 | `copyCharacterText` / `showCharacterTagToast` |
| v3.0.0 | 角色选择器删除反向同步 | 本地手动恢复（用户选择保留） |

#### 关键合并决策

1. **反向同步保留**：上游 v3.0.0 删除了打开角色选择器时从已有文本预勾选角色的逻辑（从空 `Set()` 开始），本地选择保留该功能，手动恢复了两段反向同步代码（角色数据匹配 + 自定义收藏匹配）
2. **`_character_names` widget**：本地新增的隐藏 widget + 双输出端口 (`RETURN_TYPES = ("STRING", "STRING")`) 完整保留，确保 "characters" 输出端口正常工作
3. **缓存系统独立共存**：上游未引入类似缓存机制，本地 3 个缓存 API 端点（`/anima-tools/cached-image`、`/clear-cache`、`/cache-stats`）与上游新增的 API 路由互不干扰
4. **favorites 扩展**：上游新增 `FAVORITE_SECTIONS` 常量和 clothing 收藏分组，本地格式调整让位于上游更完善的方案
