import assert from "node:assert/strict";

import { getEntryPreviewUrl } from "../js/anima_prompt_composer_preview.js";

assert.equal(
    getEntryPreviewUrl({
        section: "character",
        title: "hatsune miku",
        subtitle: "vocaloid",
        preview: "https://blobs.animadex.net/Outputs/thumbs/hatsune%20miku%2C%20vocaloid.webp",
    }),
    "/anima-tools/character/preview?name=hatsune+miku&copyright=vocaloid",
);

assert.equal(
    getEntryPreviewUrl({
        section: "character",
        title: "mejiro mcqueen (umamusume)",
        subtitle: "umamusume",
    }),
    "/anima-tools/character/preview?name=mejiro+mcqueen+%28umamusume%29&copyright=umamusume",
);

assert.equal(
    getEntryPreviewUrl({
        section: "artist",
        title: "hammer \\(sunset beach\\)",
        preview: "https://blobs.animadex.net/ArtistOutputs/thumbs/hammer%20(sunset%20beach).webp",
        preview_id: "40102",
        preview_partition: "1",
    }),
    "/anima-tools/artist/preview?name=hammer+%5C%28sunset+beach%5C%29&id=40102&partition=1",
);

assert.equal(
    getEntryPreviewUrl({
        section: "clothing",
        title: "example",
        preview: "https://cdn.example/example.webp",
    }),
    "https://cdn.example/example.webp",
);

console.log("anima_prompt_composer_preview tests passed");
