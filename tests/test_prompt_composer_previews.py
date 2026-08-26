import ast
import unittest
import urllib.parse
import re
from pathlib import Path


def load_preview_url_builders():
    nodes_path = Path(__file__).resolve().parents[1] / "nodes.py"
    tree = ast.parse(nodes_path.read_text(encoding="utf-8"), filename=str(nodes_path))
    assignment_names = {
        "ANIMADEX_CHARACTER_THUMB_BASE",
        "ANIMADEX_ARTIST_THUMB_BASE",
        "ANIMA_ASSETS_BASES",
        "SAFEBOORU_POSTS_API",
    }
    function_names = {
        "_animadex_character_preview_url",
        "_normalize_animadex_artist_preview_name",
        "_animadex_artist_preview_url",
        "_artist_preview_candidates",
        "_safebooru_artist_tag",
        "_safebooru_artist_search_url",
    }
    selected_nodes = []
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(
            isinstance(target, ast.Name) and target.id in assignment_names
            for target in node.targets
        ):
            selected_nodes.append(node)
        if isinstance(node, ast.FunctionDef) and node.name in function_names:
            selected_nodes.append(node)
    namespace = {"urllib": urllib, "re": re}
    exec(compile(ast.Module(body=selected_nodes, type_ignores=[]), str(nodes_path), "exec"), namespace)
    return namespace


class PromptComposerPreviewTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.builders = load_preview_url_builders()

    def test_builds_animadex_character_thumbnail_url(self):
        self.assertEqual(
            self.builders["_animadex_character_preview_url"]("hatsune miku", "vocaloid"),
            "https://blobs.animadex.net/Outputs/thumbs/hatsune%20miku%2C%20vocaloid.webp",
        )

    def test_encodes_reserved_character_name_characters(self):
        self.assertEqual(
            self.builders["_animadex_character_preview_url"]("alice/bob", "series & more"),
            "https://blobs.animadex.net/Outputs/thumbs/alice%2Fbob%2C%20series%20%26%20more.webp",
        )

    def test_builds_current_animadex_artist_thumbnail_url(self):
        self.assertEqual(
            self.builders["_animadex_artist_preview_url"]("dairi"),
            "https://blobs.animadex.net/ArtistOutputs/thumbs/dairi.webp",
        )

    def test_normalizes_escaped_artist_name_for_thumbnail(self):
        self.assertEqual(
            self.builders["_animadex_artist_preview_url"](r"hammer \(sunset beach\)"),
            "https://blobs.animadex.net/ArtistOutputs/thumbs/hammer%20%28sunset%20beach%29.webp",
        )

    def test_builds_legacy_artist_preview_fallbacks(self):
        self.assertEqual(
            self.builders["_artist_preview_candidates"](r"nokita \(pinmisil\)", "614249", "30"),
            [
                "https://blobs.animadex.net/ArtistOutputs/thumbs/nokita%20%28pinmisil%29.webp",
                "https://fastly.jsdelivr.net/gh/ThetaCursed/Anima-Assets@main/images/30/614249.webp",
                "https://raw.githubusercontent.com/ThetaCursed/Anima-Assets/main/images/30/614249.webp",
            ],
        )

    def test_builds_safebooru_artist_search_fallback(self):
        search_url = self.builders["_safebooru_artist_search_url"](r"nokita \(pinmisil\)")
        parsed = urllib.parse.urlparse(search_url)
        query = urllib.parse.parse_qs(parsed.query)
        self.assertEqual(parsed.netloc, "safebooru.org")
        self.assertEqual(query["tags"], ["nokita_(pinmisil)"])
        self.assertEqual(query["limit"], ["1"])


if __name__ == "__main__":
    unittest.main()
