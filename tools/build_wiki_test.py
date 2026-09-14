import tempfile
import unittest
from pathlib import Path, PurePosixPath

from build_wiki import SourcePage, build, rewrite_links, source_pages, wiki_name


class WikiBuilderTest(unittest.TestCase):
    def test_names_are_stable_and_namespaced(self):
        self.assertEqual(wiki_name(PurePosixPath("README.md")), "Project-README")
        self.assertEqual(
            wiki_name(PurePosixPath("docs/architecture/MOBILE_SHELL_2026_09_14.md")),
            "architecture-MOBILE_SHELL_2026_09_14",
        )

    def test_relative_markdown_and_asset_links_are_rewritten(self):
        page = SourcePage(
            path=Path("a"),
            relative=PurePosixPath("docs/operations/release.md"),
            wiki_name="operations-release",
            title="Release",
            category="operations",
        )
        contract = SourcePage(
            path=Path("b"),
            relative=PurePosixPath("docs/architecture/contract.md"),
            wiki_name="architecture-contract",
            title="Contract",
            category="architecture",
        )
        text = "[контракт](../architecture/contract.md#границы) ![logo](../design/logo.png)"
        result = rewrite_links(
            text,
            page,
            {contract.relative: contract},
            "artkozk/Tessavia",
            "main",
        )
        self.assertIn("/wiki/architecture-contract#границы", result)
        self.assertIn("/raw/main/docs/design/logo.png", result)

    def test_project_build_generates_navigation_and_every_source(self):
        root = Path(__file__).resolve().parents[1]
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "wiki"
            written = build(root, output, "artkozk/Tessavia", "main", "abc123")
            sources = source_pages(root)
            self.assertGreaterEqual(len(written), len(sources) + 4)
            self.assertTrue((output / "Home.md").is_file())
            self.assertTrue((output / "Documentation.md").is_file())
            self.assertTrue((output / "_Sidebar.md").is_file())
            self.assertTrue((output / "_Footer.md").is_file())
            self.assertIn("abc123", (output / "Home.md").read_text(encoding="utf-8"))
            self.assertTrue((output / "architecture-MOBILE_SIDEBAR_GESTURES_2026_09_14.md").is_file())


if __name__ == "__main__":
    unittest.main()
