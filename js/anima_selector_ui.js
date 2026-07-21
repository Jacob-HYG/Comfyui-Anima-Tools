/**
 * Shared frontend primitives for Anima visual selectors.
 *
 * This module deliberately contains no selector business state. It provides
 * behavior-compatible DOM helpers and the common gallery selector stylesheet.
 */

export const ANIMA_UI_TOKENS = Object.freeze({
    surface: "#1c1c1e",
    surfaceRaised: "rgba(16,16,24,0.94)",
    border: "rgba(255,255,255,0.12)",
    text: "#ffffff",
    overlay: "rgba(0,0,0,0.6)",
    shadow: "0 18px 45px rgba(0,0,0,0.52)",
    radius: 16,
    layerModal: 100000,
});

export function createEl(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.innerText = text;
    return el;
}

function fallbackCopy(text, callback) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
    callback?.();
}

export function copyText(text, callback) {
    if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text)
            .then(() => callback?.())
            .catch(() => fallbackCopy(text, callback));
        return;
    }
    fallbackCopy(text, callback);
}

export function debounce(fn, ms) {
    let timer = null;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms);
    };
}

export function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
    }[character]));
}

export function splitPromptTokens(value) {
    return String(value || "")
        .split(",")
        .map(part => part.replace(/^_raw_:/, "").trim())
        .filter(Boolean);
}

export function normalizePromptToken(value) {
    return String(value || "").replace(/^_raw_:/, "").trim().toLowerCase();
}

export function createModalShell({
    maxWidth = 400,
    animationName = "animaUiFadeIn",
} = {}) {
    const dialog = createEl("div");
    dialog.style.cssText = `
        position: fixed;
        inset: 0;
        z-index: ${ANIMA_UI_TOKENS.layerModal};
        background: ${ANIMA_UI_TOKENS.overlay};
        backdrop-filter: blur(10px);
        display: flex;
        align-items: center;
        justify-content: center;
    `;

    const content = createEl("div");
    content.style.cssText = `
        width: 90%;
        max-width: ${maxWidth}px;
        background: ${ANIMA_UI_TOKENS.surface};
        border: 1px solid ${ANIMA_UI_TOKENS.border};
        border-radius: ${ANIMA_UI_TOKENS.radius}px;
        padding: 22px;
        display: flex;
        flex-direction: column;
        gap: 14px;
        box-shadow: ${ANIMA_UI_TOKENS.shadow};
        animation: ${animationName} 0.18s ease forwards;
    `;

    dialog.appendChild(content);
    dialog.onclick = event => {
        if (event.target === dialog) dialog.remove();
    };
    return dialog;
}

export function createModalButtons({
    dialog,
    onConfirm,
    cancelText,
    confirmText,
    buttonClass,
}) {
    const row = createEl("div");
    row.style.cssText = "display:flex;justify-content:flex-end;gap:10px;margin-top:6px;";

    const cancel = createEl("button", buttonClass, cancelText);
    cancel.onclick = () => dialog.remove();

    const confirm = createEl("button", `${buttonClass} primary`, confirmText);
    confirm.onclick = async () => {
        confirm.disabled = true;
        cancel.disabled = true;
        const shouldClose = await onConfirm();
        if (shouldClose !== false) {
            dialog.remove();
        } else {
            confirm.disabled = false;
            cancel.disabled = false;
        }
    };

    row.appendChild(cancel);
    row.appendChild(confirm);
    return row;
}

export function showToast(message, {
    borderColor = "rgba(219,39,119,0.45)",
    visibleMs = 1300,
} = {}) {
    const toast = createEl("div", null, message);
    toast.style.cssText = `
        position: fixed;
        right: 30px;
        bottom: 30px;
        z-index: ${ANIMA_UI_TOKENS.layerModal};
        background: ${ANIMA_UI_TOKENS.surfaceRaised};
        border: 1px solid ${borderColor};
        color: ${ANIMA_UI_TOKENS.text};
        padding: 10px 18px;
        border-radius: 12px;
        box-shadow: 0 12px 28px rgba(0,0,0,0.5);
        font-size: 13px;
        font-weight: 700;
        pointer-events: none;
    `;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.transition = "opacity 0.25s ease";
        toast.style.opacity = "0";
        setTimeout(() => toast.remove(), 260);
    }, visibleMs);
    return toast;
}

const GALLERY_SELECTOR_CSS = String.raw`
        @keyframes animaBackgroundFadeIn {
            from { opacity: 0; transform: scale(0.97) translateY(8px); }
            to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes animaBackgroundSpin {
            to { transform: translate(-50%, -50%) rotate(360deg); }
        }
        @keyframes animaBackgroundShimmer {
            0% { background-position: -200% 0; }
            100% { background-position: 200% 0; }
        }
        .anima-background-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .anima-background-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .anima-background-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.14); border-radius: 999px; }
        .anima-background-btn {
            border: 1px solid rgba(255,255,255,0.08);
            border-radius: 12px;
            background: rgba(255,255,255,0.05);
            color: #e5e7eb;
            padding: 9px 14px;
            font-size: 13px;
            font-weight: 700;
            cursor: pointer;
            transition: all 0.18s ease;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            user-select: none;
            white-space: nowrap;
        }
        .anima-background-btn:hover:not(:disabled) {
            background: rgba(255,255,255,0.11);
            border-color: rgba(255,255,255,0.16);
            color: #fff;
        }
        .anima-background-btn:disabled { opacity: 0.3; cursor: not-allowed; }
        .anima-background-btn.primary {
            background: linear-gradient(135deg, #db2777, #9d174d);
            border-color: rgba(219,39,119,0.35);
            color: #fff;
            box-shadow: 0 8px 20px rgba(219,39,119,0.24);
        }
        .anima-background-btn.primary:hover:not(:disabled) {
            box-shadow: 0 10px 25px rgba(219,39,119,0.36);
        }
        .anima-background-btn.danger {
            background: rgba(239,68,68,0.08);
            border-color: rgba(239,68,68,0.22);
            color: #fca5a5;
        }
        .anima-background-btn.active {
            background: rgba(219,39,119,0.18);
            border-color: rgba(219,39,119,0.42);
            color: #f9a8d4;
        }
        .anima-background-pagination {
            padding: 14px 24px;
            background: linear-gradient(180deg, rgba(18,18,24,0.2), rgba(18,18,24,0.62));
            border-top: 1px solid rgba(255,255,255,0.06);
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 14px;
            flex-wrap: wrap;
            box-shadow: 0 -12px 32px rgba(0,0,0,0.18);
        }
        .anima-background-pagination-stats {
            min-height: 36px;
            padding: 0 14px;
            border-radius: 999px;
            background: rgba(255,255,255,0.045);
            border: 1px solid rgba(255,255,255,0.07);
            color: #d4d4d8;
            font-size: 12.5px;
            font-weight: 750;
            display: inline-flex;
            align-items: center;
            gap: 8px;
            white-space: nowrap;
            max-width: min(460px, 100%);
            overflow: hidden;
            text-overflow: ellipsis;
            box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);
        }
        .anima-background-pagination-stats::before {
            content: "";
            width: 7px;
            height: 7px;
            border-radius: 50%;
            background: #db2777;
            box-shadow: 0 0 14px rgba(219,39,119,0.72);
            flex: 0 0 auto;
        }
        .anima-background-pagination-controls {
            display: flex;
            align-items: center;
            justify-content: flex-end;
            gap: 8px;
            flex-wrap: wrap;
            margin-left: auto;
        }
        .anima-background-page-number {
            min-height: 36px;
            padding: 0;
            border-radius: 0;
            background: transparent;
            border: none;
            color: #d1d5db;
            display: inline-flex;
            align-items: center;
            gap: 7px;
            box-shadow: none;
        }
        .anima-background-page-btn {
            min-height: 36px;
            padding: 0 13px;
            background: rgba(255,255,255,0.05);
            border: 1px solid rgba(255,255,255,0.08);
            border-radius: 999px;
            color: #d4d4d8;
            font-size: 12.5px;
            font-weight: 750;
            cursor: pointer;
            transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease, transform 0.18s ease;
        }
        .anima-background-page-btn:hover:not(:disabled) {
            background: rgba(219,39,119,0.16);
            color: #fff;
            border-color: rgba(219,39,119,0.38);
            transform: translateY(-1px);
        }
        .anima-background-page-btn:disabled {
            opacity: 0.35;
            cursor: not-allowed;
        }
        .anima-background-page-input {
            width: 48px;
            padding: 6px 4px;
            background: transparent;
            border: none;
            border-bottom: 1px solid rgba(255,255,255,0.16);
            border-radius: 0;
            color: #fff;
            font-size: 13px;
            font-weight: 800;
            text-align: center;
            outline: none;
            transition: border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
        }
        .anima-background-page-input:focus {
            background: transparent;
            border-bottom-color: rgba(219,39,119,0.72);
            box-shadow: none;
        }
        .anima-background-select, .anima-background-input {
            background: rgba(10,10,15,0.76);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 12px;
            color: #f8fafc;
            outline: none;
            font-size: 13px;
            transition: border-color 0.18s ease, box-shadow 0.18s ease;
        }
        .anima-background-select { padding: 10px 13px; cursor: pointer; }
        .anima-background-input { padding: 11px 14px; }
        .anima-background-select:focus, .anima-background-input:focus {
            border-color: rgba(219,39,119,0.55);
            box-shadow: 0 0 0 3px rgba(219,39,119,0.12);
        }
        .anima-background-sidebar-item {
            padding: 10px 12px;
            border-radius: 10px;
            color: #a1a1aa;
            cursor: pointer;
            border: 1px solid transparent;
            transition: all 0.16s ease;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            font-size: 12.5px;
            font-weight: 650;
            user-select: none;
        }
        .anima-background-sidebar-item:hover {
            background: rgba(255,255,255,0.05);
            color: #fff;
        }
        .anima-background-sidebar-item.active {
            background: rgba(219,39,119,0.14);
            border-color: rgba(219,39,119,0.34);
            color: #f9a8d4;
        }
        .anima-background-clear-filters-btn {
            width: calc(100% - 16px);
            margin: 0 8px 12px;
            padding: 9px 12px;
            border-radius: 10px;
            border: 1px solid rgba(255,255,255,0.08);
            background: rgba(255,255,255,0.035);
            color: #a1a1aa;
            font-size: 12.5px;
            font-weight: 750;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 7px;
            transition: all 0.18s ease;
        }
        .anima-background-clear-filters-btn:hover:not(:disabled) {
            background: rgba(219,39,119,0.13);
            border-color: rgba(219,39,119,0.32);
            color: #f9a8d4;
        }
        .anima-background-clear-filters-btn:disabled {
            opacity: 0.42;
            cursor: not-allowed;
        }
        .anima-background-section-header {
            color: #71717a;
            font-size: 11px;
            font-weight: 850;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            margin: 14px 8px 8px;
            display: flex;
            align-items: center;
            gap: 8px;
            user-select: none;
        }
        .anima-background-section-header.foldable {
            cursor: pointer;
        }
        .anima-background-section-header.foldable:hover {
            color: #f9a8d4;
        }
        .anima-background-section-title {
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .anima-background-section-spacer {
            flex: 1;
        }
        .anima-background-section-icon-btn {
            width: 20px;
            height: 20px;
            border-radius: 6px;
            border: 1px solid rgba(219,39,119,0.18);
            background: rgba(219,39,119,0.08);
            color: #f472b6;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: all 0.16s ease;
            padding: 0;
            flex: 0 0 auto;
        }
        .anima-background-section-icon-btn:hover {
            background: rgba(219,39,119,0.18);
            border-color: rgba(219,39,119,0.34);
            color: #fff;
        }
        .anima-background-section-arrow {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            transition: transform 0.18s ease;
            flex: 0 0 auto;
        }
        .anima-background-section-arrow.collapsed {
            transform: rotate(-90deg);
        }
        .anima-background-check-row {
            display: flex;
            gap: 9px;
            align-items: flex-start;
            color: #cbd5e1;
            font-size: 12.5px;
            font-weight: 600;
            cursor: pointer;
            padding: 8px 9px;
            border-radius: 9px;
            line-height: 1.28;
            transition: background 0.15s ease;
        }
        .anima-background-check-row:hover { background: rgba(255,255,255,0.045); }
        .anima-background-check-row input { margin-top: 2px; accent-color: #db2777; }
        .anima-background-card {
            position: relative;
            width: 100%;
            height: 100%;
            min-height: 0;
            min-width: 0;
            overflow: hidden;
            box-sizing: border-box;
            border-radius: 16px;
            isolation: isolate;
            background: rgba(255,255,255,0.06);
            border: 2px solid rgba(255,255,255,0.06);
            box-shadow: 0 5px 18px rgba(0,0,0,0.25);
            cursor: pointer;
            transition: border-color 0.18s ease, box-shadow 0.18s ease;
        }
        .anima-background-card:hover {
            border-color: rgba(219,39,119,0.82);
            box-shadow: 0 12px 30px rgba(0,0,0,0.38), 0 0 18px rgba(219,39,119,0.14);
        }
        .anima-background-card.selected {
            border-color: #db2777;
            box-shadow: 0 12px 30px rgba(0,0,0,0.36), 0 0 24px rgba(219,39,119,0.24);
        }
        .anima-background-card-clip {
            position: absolute;
            inset: 2px;
            z-index: 0;
            overflow: hidden;
            border-radius: 13px;
            clip-path: inset(0 round 13px);
            background: #0a0a10;
        }
        .anima-background-card img {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: block;
            opacity: 0;
            transition: opacity 0.28s ease;
        }
        .anima-background-placeholder {
            position: absolute;
            inset: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            background: linear-gradient(135deg, #2a1430, #101018);
            color: rgba(255,255,255,0.68);
            font-size: 46px;
            font-weight: 900;
            z-index: 1;
        }
        .anima-background-shimmer {
            position: absolute;
            inset: 0;
            background: linear-gradient(90deg, rgba(20,20,30,0.9) 25%, rgba(219,39,119,0.12) 50%, rgba(20,20,30,0.9) 75%);
            background-size: 200% 100%;
            animation: animaBackgroundShimmer 1.5s infinite linear;
            z-index: 2;
            pointer-events: none;
        }
        .anima-background-spinner {
            position: absolute;
            left: 50%;
            top: 50%;
            width: 26px;
            height: 26px;
            border: 2.5px solid rgba(219,39,119,0.16);
            border-top-color: #db2777;
            border-radius: 50%;
            animation: animaBackgroundSpin 0.85s infinite linear;
        }
        .anima-background-card-mask {
            position: absolute;
            inset: 0;
            background: linear-gradient(to top, rgba(10,10,16,0.99) 0%, rgba(10,10,16,0.72) 42%, rgba(10,10,16,0.16) 100%);
            z-index: 3;
            pointer-events: none;
        }
        .anima-background-card-info {
            position: absolute;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 4;
            padding: 13px 12px;
            display: flex;
            flex-direction: column;
            gap: 5px;
            min-width: 0;
            transition: opacity 0.2s ease;
            pointer-events: none;
        }
        .anima-background-card:hover .anima-background-card-info { opacity: 0; }
        .anima-background-card-title {
            color: #fff;
            font-size: 13.5px;
            font-weight: 850;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            text-shadow: 0 2px 8px rgba(0,0,0,0.72);
        }
        .anima-background-card-sub {
            color: #cbd5e1;
            font-size: 10.5px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            opacity: 0.9;
        }
        .anima-background-card-badges {
            display: flex;
            gap: 5px;
            min-width: 0;
            overflow: hidden;
        }
        .anima-background-badge {
            color: #f9a8d4;
            background: rgba(219,39,119,0.16);
            border: 1px solid rgba(219,39,119,0.24);
            border-radius: 999px;
            padding: 2px 7px;
            font-size: 10px;
            font-weight: 750;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .anima-background-tags-overlay {
            position: absolute;
            inset: 0;
            z-index: 5;
            padding: 42px 12px 14px;
            box-sizing: border-box;
            opacity: 0;
            pointer-events: none;
            background: rgba(7, 7, 14, 0.76);
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
            transition: opacity 0.2s ease;
            display: flex;
            flex-direction: column;
            gap: 10px;
            overflow: hidden;
        }
        .anima-background-card:hover .anima-background-tags-overlay {
            opacity: 1;
            pointer-events: auto;
        }
        .anima-background-tags-title {
            border: 1px solid rgba(219,39,119,0.32);
            background: rgba(219,39,119,0.16);
            color: #fce7f3;
            border-radius: 999px;
            padding: 6px 9px;
            font-size: 11px;
            font-weight: 850;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            width: 100%;
            min-width: 0;
        }
        .anima-background-tags-list {
            display: flex;
            flex-wrap: wrap;
            gap: 5px;
            align-content: flex-start;
            overflow-y: auto;
            min-height: 0;
            padding-right: 2px;
            scrollbar-width: none;
            -ms-overflow-style: none;
        }
        .anima-background-tags-list::-webkit-scrollbar { display: none; }
        .anima-background-tag-pill {
            border: 1px solid rgba(255,255,255,0.1);
            background: rgba(255,255,255,0.07);
            color: #e5e7eb;
            border-radius: 999px;
            padding: 4px 7px;
            font-size: 10.5px;
            font-weight: 650;
            line-height: 1.15;
            cursor: pointer;
            max-width: 100%;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .anima-background-tag-pill:hover {
            border-color: rgba(219,39,119,0.45);
            color: #fff;
            background: rgba(219,39,119,0.22);
        }
        .anima-background-create-card {
            position: relative;
            width: 100%;
            height: 100%;
            box-sizing: border-box;
            border-radius: 16px;
            border: 2px dashed rgba(219,39,119,0.42);
            background: rgba(22,22,32,0.42);
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            user-select: none;
            transition: border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
        }
        .anima-background-create-card:hover {
            border-color: rgba(219,39,119,0.86);
            background: rgba(219,39,119,0.07);
            box-shadow: 0 12px 30px rgba(0,0,0,0.32), 0 0 18px rgba(219,39,119,0.16);
        }
        .anima-background-create-card-content {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 12px;
            color: #f472b6;
            padding: 18px;
            text-align: center;
            transition: transform 0.2s ease, color 0.2s ease;
        }
        .anima-background-create-card:hover .anima-background-create-card-content {
            color: #fff;
            transform: scale(1.06);
        }
        .anima-background-icon-btn {
            position: absolute;
            right: 9px;
            z-index: 7;
            width: 28px;
            height: 28px;
            border-radius: 50%;
            background: rgba(10,10,15,0.48);
            border: 1px solid rgba(255,255,255,0.12);
            backdrop-filter: blur(5px);
            color: #e5e7eb;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: transform 0.15s ease, background 0.15s ease, color 0.15s ease;
        }
        .anima-background-icon-btn:hover {
            transform: scale(1.1);
            background: rgba(10,10,15,0.72);
            color: #f9a8d4;
        }
        .anima-background-selected-mark {
            position: absolute;
            top: 9px;
            left: 9px;
            z-index: 7;
            width: 24px;
            height: 24px;
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(10,10,15,0.52);
            border: 1px solid rgba(255,255,255,0.28);
            color: #fff;
            transition: all 0.15s ease;
        }
        .anima-background-card.selected .anima-background-selected-mark {
            background: #db2777;
            border-color: #db2777;
        }
        .anima-background-popover {
            position: fixed;
            z-index: 1000000;
            min-width: 170px;
            max-height: 280px;
            overflow-y: auto;
            background: #1c1c1e;
            border: 1px solid rgba(255,255,255,0.14);
            border-radius: 12px;
            padding: 10px;
            box-shadow: 0 14px 34px rgba(0,0,0,0.52);
        }
    `;

export function createGallerySelectorStyleSheet(kind) {
    const safeKind = String(kind || "").trim().toLowerCase();
    if (!/^[a-z][a-z0-9-]*$/.test(safeKind)) {
        throw new Error(`Invalid Anima selector kind: ${kind}`);
    }
    const styleSheet = document.createElement("style");
    styleSheet.dataset.animaSelectorStyle = safeKind;
    styleSheet.textContent = GALLERY_SELECTOR_CSS
        .replaceAll("anima-background", `anima-${safeKind}`)
        .replaceAll("animaBackground", `anima${safeKind[0].toUpperCase()}${safeKind.slice(1)}`);
    return styleSheet;
}
