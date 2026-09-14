#!/usr/bin/env python3
"""Build the GitHub Wiki working tree from the canonical repository docs.

The builder is deliberately dependency-free so the same command works locally and
on a stock GitHub Actions runner. It never edits source documentation. Existing
pages in a cloned Wiki are overlaid by the workflow instead of being deleted, so
historical pages remain recoverable even if the source layout changes later.
"""

from __future__ import annotations

import argparse
import re
import shutil
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from urllib.parse import quote, unquote, urlsplit


DEFAULT_REPOSITORY = "artkozk/Tessavia"
DEFAULT_REF = "main"
SOURCE_NOTICE = (
    "> Эта страница автоматически опубликована из `{source}`. "
    "Канонический исходник: [{source}]({source_url}). "
    "Ручные исправления следует вносить в основной репозиторий — следующий "
    "успешный запуск синхронизации обновит Wiki.\n\n"
)
MARKDOWN_LINK_RE = re.compile(r"(!?\[[^\]]*\]\()([^\s)]+)([^)]*\))")
HEADING_RE = re.compile(r"^#\s+(.+?)\s*$", re.MULTILINE)
DATE_RE = re.compile(r"(20\d{2})[-_](\d{2})[-_](\d{2})")


@dataclass(frozen=True)
class SourcePage:
    path: Path
    relative: PurePosixPath
    wiki_name: str
    title: str
    category: str


def slug_part(value: str) -> str:
    value = re.sub(r"[^0-9A-Za-zА-Яа-яЁё._-]+", "-", value.strip())
    value = re.sub(r"-+", "-", value).strip("-.")
    return value or "page"


def wiki_name(relative: PurePosixPath) -> str:
    if relative == PurePosixPath("README.md"):
        return "Project-README"
    parts = [slug_part(part) for part in relative.with_suffix("").parts]
    if parts and parts[0].lower() == "docs":
        parts = parts[1:]
    return "-".join(parts)


def first_heading(text: str, fallback: str) -> str:
    match = HEADING_RE.search(text)
    return match.group(1).strip() if match else fallback


def source_pages(root: Path) -> list[SourcePage]:
    candidates = [root / "README.md"]
    candidates.extend(sorted((root / "docs").rglob("*.md")))
    pages: list[SourcePage] = []
    used: dict[str, PurePosixPath] = {}
    for path in candidates:
        if not path.is_file():
            continue
        relative = PurePosixPath(path.relative_to(root).as_posix())
        name = wiki_name(relative)
        folded = name.casefold()
        if folded in used:
            raise ValueError(
                f"Wiki page collision: {relative} and {used[folded]} both map to {name}"
            )
        used[folded] = relative
        text = path.read_text(encoding="utf-8")
        category = relative.parts[1] if len(relative.parts) > 2 else "root"
        pages.append(
            SourcePage(
                path=path,
                relative=relative,
                wiki_name=name,
                title=first_heading(text, path.stem),
                category=category,
            )
        )
    return pages


def split_target(raw_target: str) -> tuple[str, str, str]:
    wrapped = raw_target.startswith("<") and raw_target.endswith(">")
    target = raw_target[1:-1] if wrapped else raw_target
    split = urlsplit(target)
    suffix = ""
    if split.query:
        suffix += f"?{split.query}"
    if split.fragment:
        suffix += f"#{split.fragment}"
    return unquote(split.path), suffix, "<" if wrapped else ""


def repository_url(repository: str, kind: str, ref: str, path: PurePosixPath) -> str:
    encoded_path = "/".join(quote(part) for part in path.parts)
    return f"https://github.com/{repository}/{kind}/{quote(ref, safe='')}/{encoded_path}"


def rewrite_links(
    text: str,
    page: SourcePage,
    page_by_relative: dict[PurePosixPath, SourcePage],
    repository: str,
    ref: str,
) -> str:
    def replace(match: re.Match[str]) -> str:
        prefix, raw_target, suffix_text = match.groups()
        target_path, target_suffix, wrapper = split_target(raw_target)
        lowered = raw_target.lower()
        if (
            not target_path
            or target_path.startswith("/")
            or raw_target.startswith("#")
            or lowered.startswith(("http://", "https://", "mailto:", "tel:", "data:"))
        ):
            return match.group(0)

        source_dir = page.relative.parent
        combined = source_dir.joinpath(PurePosixPath(target_path))
        normalized_parts: list[str] = []
        for part in combined.parts:
            if part in ("", "."):
                continue
            if part == "..":
                if not normalized_parts:
                    return match.group(0)
                normalized_parts.pop()
            else:
                normalized_parts.append(part)
        resolved = PurePosixPath(*normalized_parts)

        linked_page = page_by_relative.get(resolved)
        if linked_page:
            target = f"https://github.com/{repository}/wiki/{quote(linked_page.wiki_name)}{target_suffix}"
        else:
            kind = "raw" if prefix.startswith("![") else "blob"
            target = repository_url(repository, kind, ref, resolved) + target_suffix
        if wrapper:
            target = f"<{target}>"
        return f"{prefix}{target}{suffix_text}"

    return MARKDOWN_LINK_RE.sub(replace, text)


def newest_first(page: SourcePage) -> tuple[str, str, str]:
    match = DATE_RE.search(page.relative.name)
    date = "".join(match.groups()) if match else "00000000"
    return date, page.title.casefold(), page.wiki_name.casefold()


def index_page(title: str, pages: list[SourcePage], repository: str) -> str:
    lines = [f"# {title}", "", "Индекс формируется автоматически из канонического каталога документации.", ""]
    for page in sorted(pages, key=newest_first, reverse=True):
        url = f"https://github.com/{repository}/wiki/{quote(page.wiki_name)}"
        lines.append(f"- [{page.title}]({url}) — `{page.relative}`")
    lines.append("")
    return "\n".join(lines)


def build(root: Path, output: Path, repository: str, ref: str, source_commit: str) -> list[Path]:
    root = root.resolve()
    output = output.resolve()
    if output == root or root in output.parents:
        raise ValueError("Output directory must be outside the repository working tree")
    if output.exists():
        shutil.rmtree(output)
    output.mkdir(parents=True)

    pages = source_pages(root)
    page_by_relative = {page.relative: page for page in pages}
    written: list[Path] = []
    for page in pages:
        source_url = repository_url(repository, "blob", ref, page.relative)
        notice = SOURCE_NOTICE.format(source=page.relative, source_url=source_url)
        content = page.path.read_text(encoding="utf-8")
        content = rewrite_links(content, page, page_by_relative, repository, ref)
        target = output / f"{page.wiki_name}.md"
        target.write_text(notice + content.rstrip() + "\n", encoding="utf-8", newline="\n")
        written.append(target)

    category_titles = {
        "architecture": "Архитектура и контракты",
        "product": "Продукт",
        "operations": "Эксплуатация и выпуски",
        "design": "Дизайн",
        "verification": "Проверка",
    }
    category_indexes: list[tuple[str, str]] = []
    for category, title in category_titles.items():
        category_pages = [page for page in pages if page.category == category]
        if not category_pages:
            continue
        index_name = f"Index-{slug_part(category.title())}"
        target = output / f"{index_name}.md"
        target.write_text(index_page(title, category_pages, repository), encoding="utf-8", newline="\n")
        written.append(target)
        category_indexes.append((title, index_name))

    commit_label = source_commit or ref
    source_commit_url = f"https://github.com/{repository}/commit/{quote(commit_label, safe='')}"
    home = f"""# Tessavie

Tessavie — рабочее пространство для личных дел, привычек, знаний, проектов и совместного построения бизнеса.

Wiki автоматически собрана из канонического репозитория [{repository}](https://github.com/{repository}) на версии [`{commit_label}`]({source_commit_url}). Ручные правки производятся в `README.md` и `docs/`, чтобы код, подробная документация и Wiki не расходились.

## Навигация

- [Полное актуальное README](https://github.com/{repository}/wiki/Project-README)
- [Вся документация](https://github.com/{repository}/wiki/Documentation)
- [Production](https://control.e-rd.ru/)

Исторические документы сохраняются. Статус отдельной функции подтверждается её контрактом, проверками и production-отчётом; один только текст Wiki не означает, что функция опубликована.
"""
    home_path = output / "Home.md"
    home_path.write_text(home, encoding="utf-8", newline="\n")
    written.append(home_path)

    documentation_lines = [
        "# Документация Tessavie",
        "",
        f"Собрано из `{len(pages)}` Markdown-источников репозитория на версии [`{commit_label}`]({source_commit_url}).",
        "",
    ]
    documentation_lines.extend(
        f"- [{title}](https://github.com/{repository}/wiki/{quote(index_name)})"
        for title, index_name in category_indexes
    )
    documentation_lines.extend(
        ["", f"- [README](https://github.com/{repository}/wiki/Project-README)", ""]
    )
    documentation_path = output / "Documentation.md"
    documentation_path.write_text("\n".join(documentation_lines), encoding="utf-8", newline="\n")
    written.append(documentation_path)

    sidebar_lines = [
        "## Tessavie",
        "",
        f"- [Главная](https://github.com/{repository}/wiki/Home)",
        f"- [README](https://github.com/{repository}/wiki/Project-README)",
        f"- [Вся документация](https://github.com/{repository}/wiki/Documentation)",
        "",
        "### Разделы",
        "",
    ]
    sidebar_lines.extend(
        f"- [{title}](https://github.com/{repository}/wiki/{quote(index_name)})"
        for title, index_name in category_indexes
    )
    sidebar_lines.append("")
    sidebar_path = output / "_Sidebar.md"
    sidebar_path.write_text("\n".join(sidebar_lines), encoding="utf-8", newline="\n")
    written.append(sidebar_path)

    footer = (
        f"Автоматически синхронизировано из "
        f"[{repository}@{commit_label}]({source_commit_url}). "
        "Канонические изменения вносятся в основной репозиторий.\n"
    )
    footer_path = output / "_Footer.md"
    footer_path.write_text(footer, encoding="utf-8", newline="\n")
    written.append(footer_path)
    return written


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--repository", default=DEFAULT_REPOSITORY)
    parser.add_argument("--ref", default=DEFAULT_REF)
    parser.add_argument("--source-commit", default="")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    written = build(args.root, args.output, args.repository, args.ref, args.source_commit)
    print(f"WIKI_PAGES={len(written)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
