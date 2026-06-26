# 图片缓存系统 — 实现文档

> `anima_cache.py` 模块提供可复用的 `ImageCache` 类，支持按 namespace 分文件夹存储。
> 后端 API 端点 (`nodes.py`) 仅作为薄包装 (thin wrapper) 委托给该模块。
> 前端 3 个选择器通过 `namespace=` 参数将缓存存入对应的子文件夹。

## 概述

在插件根目录下的 `temp/` 文件夹中，按选择器名称创建子文件夹存储缓存的图片。
通过后端 Python 缓存代理端点 + 前端智能回退逻辑，实现画师/角色/服装预览图的本地持久化缓存。

### 核心工作流

```
在线 + Cache OFF (默认):  浏览器 → CDN 直连 (快速)
                            └─ 加载失败 → onerror → 后端缓存代理 → 本地 temp/
                            
在线 + Cache ON:          浏览器 → 后端缓存代理 → 下载并存入 temp/ → 返回

离线 (之前浏览过):         浏览器 → CDN 失败 → onerror → 后端缓存代理 → temp/ (命中)
```

---

## 目录结构

```
Comfyui-Anima-Tools/
├── anima_cache.py              ← 独立缓存模块 (ImageCache 类 + 工厂函数)
├── nodes.py                    ← 3 个 API 端点 (薄包装)
└── temp/                       ← 按 namespace 分文件夹存储
    ├── anima_artist_selector/       # 画师预览图
    │   ├── a1b2c3d4...webp
    │   └── ...
    ├── anima_character_selector/    # 角色预览图
    │   ├── e5f6g7h8...png
    │   └── ...
    ├── anima_clothing_selector/     # 服装预览图
    │   └── ...
    ├── anima_background_selector/   # 背景预览图
    │   └── ...
    └── default/                     # 未指定 namespace 时的兜底
        └── ...
```

---

## 一、核心模块 — anima_cache.py

独立可复用的缓存模块，不含 ComfyUI 特定依赖（除 `aiohttp` 外）。

### `class ImageCache`

| 方法 | 说明 |
|------|------|
| `__init__(namespace, cache_root, allowed_domains)` | 创建命名缓存实例 |
| `_path(url) -> str` | URL → MD5 hash 文件名 |
| `get_path(url) -> str | None` | 返回缓存文件路径，不存在则 None |
| `get_content_type(url) -> str` | 自动判断 MIME（image/webp/png/jpeg） |
| `is_allowed_url(url) -> bool` | 域名白名单校验 (SSRF 防护) |
| `has(url) -> bool` | 检查是否已缓存 |
| `fetch_and_cache(url, timeout) -> bytes | None` | 异步下载 → 原子写入 → 返回数据 |
| `clear() -> int` | 清空该 namespace 所有缓存文件 |
| `stats() -> dict` | 统计：文件数、总大小、namespace |

### 工厂函数

```python
from anima_cache import get_cache

cache = get_cache("anima_character_selector")  # 返回线程安全的单例
```

### 线程安全

- 每个 `ImageCache` 实例拥有独立的 `threading.Lock()`
- 写操作使用 `os.replace`（先写 `.tmp` 再原子重命名）
- 工厂函数使用全局 `_registry_lock` 保护单例注册表

### 域名白名单

| 域名 | 用途 |
|------|------|
| `fastly.jsdelivr.net` | 画师图片 CDN (JsDelivr) |
| `raw.githubusercontent.com` | 画师图片 CDN (GitHub Raw) |
| `cdn.statically.io` | 画师图片 CDN (Statically) |
| `blobs.animadex.net` | 角色图片 CDN (Animadex) |

---

## 二、后端 API 端点 — nodes.py

`nodes.py` 中原来的 5 个辅助函数 + 白名单已被移除，3 个 API 端点变成薄包装：

### `GET /anima-tools/cached-image?namespace=...&url=...`

| 参数 | 必填 | 说明 |
|------|------|------|
| `namespace` | 否 (默认 `"default"`) | 子文件夹名，如 `anima_artist_selector` |
| `url` | 是 | 原始 CDN 图片 URL |

流程：
1. `get_cache(namespace).is_allowed_url(url)` → 白名单校验
2. `get_cache(namespace).get_path(url)` → HIT → FileResponse
3. `get_cache(namespace).fetch_and_cache(url)` → MISS → Response

### `POST /anima-tools/clear-cache`

| 请求体 | 说明 |
|--------|------|
| `{"namespace": "anima_artist_selector"}` | 仅清除该 namespace |
| 空或 `{}` | 清除所有已知 namespace |

### `GET /anima-tools/cache-stats`

| Query | 说明 |
|-------|------|
| `?namespace=anima_artist_selector` | 仅查询该 namespace |
| 无参数 | 聚合所有 namespace |

命名空间常量（在 `nodes.py` 中定义）：

```python
CACHE_NAMESPACE_ARTIST = "anima_artist_selector"
CACHE_NAMESPACE_CHARACTER = "anima_character_selector"
CACHE_NAMESPACE_CLOTHING = "anima_clothing_selector"
CACHE_NAMESPACE_BACKGROUND = "anima_background_selector"
```

---

## 三、前端 — JS 选择器

3 个选择器（artist、character、clothing）各自包含：

1. **Cache 开关按钮** → 工具栏上的 "Cache: ON/OFF" 按钮
2. **`getCacheProxyUrl(url)`** → 构造带 namespace 的代理 URL
3. **`onerror` 回退** → CDN 加载失败时自动 fallback 到缓存代理

### URL 示例

```javascript
// 画师选择器 (anima_artist_selector.js)
/anima-tools/cached-image?namespace=anima_artist_selector&url=https://cdn.example.com/img.webp

// 角色选择器 (anima_character_selector.js)
/anima-tools/cached-image?namespace=anima_character_selector&url=https://cdn.example.com/char.webp

// 服装选择器 (anima_clothing_selector.js)
/anima-tools/cached-image?namespace=anima_clothing_selector&url=https://cdn.example.com/cloth.webp
```

### 图片加载逻辑

```javascript
const originalSrc = getImgUrl(partition, item.id);
img.src = cacheMode ? getCacheProxyUrl(originalSrc) : originalSrc;

img.onerror = () => {
    if (!img.dataset.cacheTried && !cacheMode) {
        img.dataset.cacheTried = "1";
        img.src = getCacheProxyUrl(originalSrc);  // 回退到缓存
        return;
    }
    img.style.display = "none";  // 彻底失败 → 占位符
    loader?.remove();
    placeholder.style.opacity = "1";
};
```

---

## 四、使用说明

### 日常在线使用

保持 **Cache: OFF**（默认状态）。图片从 CDN 快速加载。如果 CDN 偶尔不可达，自动回退到本地缓存（前提是之前成功加载过）。

### 准备离线环境

1. 在任一选择器工具栏中，点击 📦 按钮切换到 **Cache: ON**
2. 浏览一遍需要的图片（会下载并存入 `temp/<namespace>/`）
3. 之后即使断网，切换到 Cache: ON 即可从本地加载所有已缓存图片

### 缓存管理

- 缓存位置：`Comfyui-Anima-Tools/temp/<namespace>/`
- 查看统计：`GET /anima-tools/cache-stats?namespace=<name>`
- 清空缓存：`POST /anima-tools/clear-cache` + `{"namespace": "<name>"}`
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
┌─────────────────────────────────────────────────────────────┐
│                     ComfyUI 前端 (JS)                         │
│                                                             │
│  ┌──────────────┐  ┌───────────────┐  ┌──────────────┐     │
│  │Artist        │  │Character      │  │Clothing      │     │
│  │getCacheProxy │  │getCacheProxy  │  │getCacheProxy │     │
│  │Url() ────────┼──┼──Url() ───────┼──┼──Url()       │     │
│  │onerror ──────┼──┼──onerror      │  │onerror       │     │
│  │ns=artist_ ◄──┼──┼──ns=character_│  │ns=clothing_  │     │
│  │  selector    │  │  selector     │  │  selector    │     │
│  └──────┬───────┘  └──────┬────────┘  └──────┬───────┘     │
│         │                 │                  │              │
│         └────────────┬────┴──────────┬───────┘              │
│                      ▼               ▼                      │
│    /anima-tools/cached-image?namespace=...&url=...           │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP GET
┌──────────────────────────▼──────────────────────────────────┐
│                ComfyUI 后端 (Python)                          │
│                                                             │
│  nodes.py (thin wrapper)                                    │
│  ┌─────────────────────────────────────────────────┐        │
│  │  1. get_cache(namespace) ← 获取对应缓存实例       │        │
│  │  2. is_allowed_url(url)     ← SSRF 防护          │        │
│  │  3. get_path(url) → HIT     ← 直接 FileResponse  │        │
│  │  4. fetch_and_cache(url)    ← MISS → 下载 + 缓存 │        │
│  └─────────────────────┬───────────────────────────┘        │
│                        │                                     │
│  anima_cache.py        ▼                                     │
│  ┌─────────────────────────────────────────────────┐        │
│  │  ImageCache(namespace)                           │        │
│  │  ├─ temp/anima_artist_selector/  (artist)        │        │
│  │  ├─ temp/anima_character_selector/ (character)   │        │
│  │  └─ temp/anima_clothing_selector/  (clothing)   │        │
│  └─────────────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────────────┘
```

---

## 六、注意事项

1. **缓存不自动过期**：需手动调用 API 或删除 `temp/` 目录
2. **首次加载较慢**：Cache ON 模式下，首次访问的图片需经后端下载，比 CDN 直连慢
3. **域名白名单**：如需添加新的图片源，编辑 `anima_cache.py` 中的 `DEFAULT_ALLOWED_DOMAINS`
4. **磁盘空间**：每张图片约 10-50KB，缓存 1000 张约占用 10-50MB
5. **跨会话持久化**：缓存文件和 `localStorage` 中的 Cache 模式设置均跨 ComfyUI 重启保留
6. **新增选择器**：只需调用 `get_cache("your_namespace")` 即可使用缓存，无需重复实现

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
