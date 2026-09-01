from html.parser import HTMLParser
import json
from pathlib import Path
import subprocess
import unittest


PAGE_ROOT = Path(__file__).resolve().parents[1]


class SemanticPageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.canonical = ""
        self.og_title = ""
        self.in_title = False
        self.title = ""
        self.in_paper_title = False
        self.paper_title = ""
        self.headings: list[tuple[str, str]] = []
        self.resources: list[dict[str, str]] = []
        self.elements: list[tuple[str, dict[str, str | None]]] = []
        self._heading_tag = ""
        self._heading_text: list[str] = []
        self._resource: dict[str, str] | None = None
        self._resource_text: list[str] = []
        self._section_ids: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        self.elements.append((tag, attributes))
        if tag == "link" and attributes.get("rel") == "canonical":
            self.canonical = attributes.get("href", "")
        if tag == "meta" and attributes.get("property") == "og:title":
            self.og_title = attributes.get("content", "")
        if tag == "title":
            self.in_title = True
        if tag == "p" and "paper-title" in (attributes.get("class") or "").split():
            self.in_paper_title = True
        if tag in {"h1", "h2", "h3"}:
            self._heading_tag = tag
            self._heading_text = []
        if tag == "section":
            self._section_ids.append(attributes.get("id", ""))
        if tag == "a" and "data-resource-id" in attributes:
            self._resource = {key: value or "" for key, value in attributes.items()}
            self._resource["section"] = self._section_ids[-1] if self._section_ids else ""
            self._resource["icon-count"] = "0"
            self._resource_text = []
        if tag == "svg" and self._resource is not None:
            self._resource["icon-count"] = str(int(self._resource["icon-count"]) + 1)

    def handle_endtag(self, tag: str) -> None:
        if tag == "title":
            self.in_title = False
        if tag == "p" and self.in_paper_title:
            self.in_paper_title = False
            self.paper_title = " ".join(self.paper_title.split())
        if tag == self._heading_tag:
            self.headings.append((tag, "".join(self._heading_text).strip()))
            self._heading_tag = ""
            self._heading_text = []
        if tag == "a" and self._resource is not None:
            self._resource["text"] = " ".join("".join(self._resource_text).split())
            self.resources.append(self._resource)
            self._resource = None
            self._resource_text = []
        if tag == "section":
            self._section_ids.pop()

    def handle_data(self, data: str) -> None:
        if self.in_title:
            self.title += data
        if self.in_paper_title:
            self.paper_title += data
        if self._heading_tag:
            self._heading_text.append(data)
        if self._resource is not None:
            self._resource_text.append(data)


def parse_page() -> SemanticPageParser:
    parser = SemanticPageParser()
    parser.feed((PAGE_ROOT / "index.html").read_text(encoding="utf-8"))
    return parser


def image_dimensions(path: Path) -> tuple[int, int]:
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height",
            "-of",
            "json",
            str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    stream = json.loads(result.stdout)["streams"][0]
    return stream["width"], stream["height"]


class PageSemanticsTests(unittest.TestCase):
    def test_identity_has_canonical_url_and_one_nexus_heading(self) -> None:
        page = parse_page()

        full_title = (
            "NEXUS: A Perceptive Foundation Policy for Cross-Domain Whole-Body Teleoperation"
        )
        self.assertEqual(page.title, full_title)
        self.assertEqual(page.og_title, full_title)
        self.assertEqual(
            page.paper_title,
            "A Perceptive Foundation Policy for Cross-Domain Whole-Body Teleoperation",
        )
        self.assertEqual(page.canonical, "https://nexus-humanoid.github.io/")
        self.assertEqual([heading for heading in page.headings if heading[0] == "h1"], [("h1", "NEXUS")])
        favicon = next(
            attrs for tag, attrs in page.elements if tag == "link" and attrs.get("rel") == "icon"
        )
        self.assertEqual(favicon.get("href"), "assets/images/favicon.svg")

    def test_academic_resources_are_complete_and_disabled_before_release(self) -> None:
        page = parse_page()

        self.assertEqual(
            [resource["data-resource-id"] for resource in page.resources],
            ["preview", "paper", "arxiv", "code", "model", "data", "bibtex"],
        )
        for resource in page.resources:
            self.assertNotIn("href", resource)
            self.assertEqual(resource["aria-disabled"], "true")
            self.assertEqual(resource["tabindex"], "-1")
            self.assertTrue(resource["text"].endswith("Coming Soon"))

    def test_primary_publication_links_precede_preview_and_use_familiar_icons(self) -> None:
        page = parse_page()

        primary = [resource for resource in page.resources if resource["section"] == "top"]
        additional = [resource for resource in page.resources if resource["section"] == "resources"]
        self.assertEqual(
            [resource["data-resource-id"] for resource in primary],
            ["preview", "paper", "arxiv", "code"],
        )
        self.assertTrue(all(resource["icon-count"] == "1" for resource in primary))
        self.assertEqual(
            [resource["data-resource-id"] for resource in additional],
            ["model", "data", "bibtex"],
        )

    def test_reservation_state_has_poster_and_hides_unconfigured_contact(self) -> None:
        page = parse_page()

        self.assertTrue(any("data-video-mount" in attrs for _, attrs in page.elements))
        self.assertTrue(any("data-video-coming-soon" in attrs for _, attrs in page.elements))
        self.assertFalse(any(tag == "iframe" for tag, _ in page.elements))
        poster = next(
            attrs
            for tag, attrs in page.elements
            if tag == "img" and attrs.get("src") == "assets/images/preview-poster.webp"
        )
        self.assertTrue(poster.get("alt"))

        email = next(attrs for _, attrs in page.elements if "data-contact-email" in attrs)
        wechat = next(attrs for _, attrs in page.elements if "data-wechat-trigger" in attrs)
        self.assertIn("hidden", email)
        self.assertIn("hidden", wechat)
        self.assertTrue(any(tag == "dialog" and "data-wechat-dialog" in attrs for tag, attrs in page.elements))

    def test_preview_poster_is_web_ready(self) -> None:
        poster = PAGE_ROOT / "assets/images/preview-poster.webp"

        self.assertTrue(poster.is_file())
        self.assertLess(poster.stat().st_size, 2_000_000)
        self.assertEqual(image_dimensions(poster), (1600, 900))

    def test_share_and_github_pages_assets_are_ready(self) -> None:
        social_card = PAGE_ROOT / "assets/images/social-card.webp"
        favicon = PAGE_ROOT / "assets/images/favicon.svg"
        wechat_qr = PAGE_ROOT / "assets/images/wechat-qr.jpg"

        self.assertTrue(social_card.is_file())
        self.assertLess(social_card.stat().st_size, 2_000_000)
        self.assertEqual(image_dimensions(social_card), (1200, 630))
        self.assertTrue(favicon.is_file())
        self.assertIn("<svg", favicon.read_text(encoding="utf-8"))
        self.assertTrue(wechat_qr.is_file())
        self.assertLess(wechat_qr.stat().st_size, 2_000_000)
        self.assertEqual(image_dimensions(wechat_qr), (888, 1131))
        self.assertTrue((PAGE_ROOT / ".nojekyll").is_file())


if __name__ == "__main__":
    unittest.main()
