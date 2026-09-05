export function getEntryPreviewUrl(entry) {
    if (!entry?.title) {
        return entry?.preview || "";
    }
    if (entry.section === "artist") {
        const params = new URLSearchParams({ name: entry.title });
        if (entry.preview_id) params.set("id", entry.preview_id);
        if (entry.preview_partition) params.set("partition", entry.preview_partition);
        return `/anima-tools/artist/preview?${params.toString()}`;
    }
    if (entry.section !== "character") return entry.preview || "";
    const params = new URLSearchParams({ name: entry.title });
    if (entry.subtitle) params.set("copyright", entry.subtitle);
    return `/anima-tools/character/preview?${params.toString()}`;
}
