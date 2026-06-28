/**
 * Anima Tools - 共享图片加载优化工具
 * 提供内存级 URL 缓存，在三个选择器中共用
 *
 * v2.0 — 支持 CDN 直连 URL 与缓存代理 URL 的相互识别。
 * 标记一张图片时，CDN 形式和代理形式都会被标记；检查时两者都视为已加载。
 */

// 全局已加载图片 URL 缓存（跨弹窗共享，浏览器会话内有效）
if (!window._animaLoadedImageUrls) {
    window._animaLoadedImageUrls = new Set();
}

/**
 * 构造给定 CDN URL 对应的缓存代理 URL。
 * 此函数与前端选择器中 getCacheProxyUrl/getImageUrl 的逻辑保持一致，
 * 用于 markImageLoaded / isImageLoaded 的归一化处理。
 *
 * @param {string} cdnUrl - CDN 直连 URL
 * @returns {string} 代理 URL（若传入的不是有效 CDN URL 则原样返回）
 */
function getCdnUrlProxyEquivalent(cdnUrl) {
    if (!cdnUrl || !cdnUrl.startsWith("http")) return cdnUrl;
    try {
        return `/anima-tools/cached-image?namespace=anima_character_selector&url=${encodeURIComponent(cdnUrl)}`;
    } catch (_) {
        return cdnUrl;
    }
}

/**
 * 获取 URL 的「另一种形式」——若输入是 CDN URL 则返回代理 URL，反之亦然。
 * 用于双写标记和双路判存。
 */
function getAlternateUrl(url) {
    if (!url) return null;
    // 已经是代理 URL → 尝试反解出原始 CDN URL
    if (url.startsWith("/anima-tools/cached-image")) {
        try {
            const parsed = new URL(url, location.origin);
            return parsed.searchParams.get("url") || null;
        } catch (_) {
            return null;
        }
    }
    // 是 CDN URL → 返回代理 URL
    if (url.startsWith("http")) {
        return getCdnUrlProxyEquivalent(url);
    }
    return null;
}

/**
 * 标记 URL 已成功加载。
 * 会自动同时标记 CDN 直连 URL 和缓存代理 URL，确保两种形式均可命中。
 */
export function markImageLoaded(url) {
    if (!url || url.startsWith("data:")) return;

    window._animaLoadedImageUrls.add(url);

    // 同时标记 URL 的「另一种形式」（CDN ↔ Proxy），
    // 避免切换 cacheMode 后缓存丢失
    const alt = getAlternateUrl(url);
    if (alt) {
        window._animaLoadedImageUrls.add(alt);
    }

    // 控制缓存大小，防止内存泄漏
    if (window._animaLoadedImageUrls.size > 4000) {
        const entries = Array.from(window._animaLoadedImageUrls);
        const toRemove = entries.slice(0, entries.length - 3000);
        toRemove.forEach(e => window._animaLoadedImageUrls.delete(e));
    }
}

/**
 * 检查 URL 是否已加载过。
 * 会同时检查 CDN 直连 URL 和缓存代理 URL。
 */
export function isImageLoaded(url) {
    if (!url) return false;
    if (window._animaLoadedImageUrls.has(url)) return true;
    // 检查对应形式的 URL
    const alt = getAlternateUrl(url);
    return !!alt && window._animaLoadedImageUrls.has(alt);
}

/**
 * 清空会话内图片已加载标记；不会影响浏览器磁盘缓存或任何用户配置
 */
export function clearImageLoadedCache() {
    if (window._animaLoadedImageUrls?.clear) {
        window._animaLoadedImageUrls.clear();
    }
}
