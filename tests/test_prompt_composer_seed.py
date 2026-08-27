import ast
import re
import unittest
import urllib
from pathlib import Path


def load_prompt_composer_class():
    nodes_path = Path(__file__).resolve().parents[1] / "nodes.py"
    tree = ast.parse(nodes_path.read_text(encoding="utf-8"), filename=str(nodes_path))
    class_node = next(
        node
        for node in tree.body
        if isinstance(node, ast.ClassDef) and node.name == "AnimaPromptComposer"
    )
    namespace = {
        "__file__": str(nodes_path),
        "re": re,
        "urllib": urllib,
    }
    exec(
        compile(ast.Module(body=[class_node], type_ignores=[]), str(nodes_path), "exec"),
        namespace,
    )
    return namespace["AnimaPromptComposer"]


class AnimaPromptComposerSeedTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.composer_class = load_prompt_composer_class()

    def setUp(self):
        self.composer_class._data_cache = {}
        self.composer = self.composer_class()
        self.inputs = {
            "enable_artist": True,
            "enable_character": True,
            "enable_clothing": True,
            "enable_background": True,
            "enable_pose": True,
            "character_detail": "trigger_tags",
            "artist_count": 2,
            "preview_collapsed": False,
        }

    def test_fixed_seed_ignores_stale_persisted_prompt(self):
        first = self.composer.compose_prompt(
            **self.inputs,
            seed=123456,
            resolved_prompt="stale result, ",
        )
        second = self.composer.compose_prompt(
            **self.inputs,
            seed=123456,
            resolved_prompt="another stale result, ",
        )

        self.assertNotEqual(first["result"][0], "stale result, ")
        self.assertEqual(first["result"][0], second["result"][0])
        self.assertEqual(
            first["ui"]["anima_prompt_composer"][0],
            second["ui"]["anima_prompt_composer"][0],
        )

    def test_random_seed_reuses_prequeue_resolution(self):
        result = self.composer.compose_prompt(
            **self.inputs,
            seed=-1,
            resolved_prompt="queued random result, ",
        )

        self.assertEqual(result["result"][0], "queued random result, ")

    def test_fixed_seed_cache_key_is_stable_and_seed_sensitive(self):
        first = self.composer_class.IS_CHANGED(**self.inputs, seed=7, resolved_prompt="old")
        repeated = self.composer_class.IS_CHANGED(**self.inputs, seed=7, resolved_prompt="new")
        changed = self.composer_class.IS_CHANGED(**self.inputs, seed=8, resolved_prompt="old")

        self.assertEqual(first, repeated)
        self.assertNotEqual(first, changed)


if __name__ == "__main__":
    unittest.main()
