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
