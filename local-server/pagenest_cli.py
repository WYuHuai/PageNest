import argparse
import json
import sys
from dataclasses import asdict
from pathlib import Path

from collector.config import settings
from collector.document_text import PageNestDocument
from collector.library import read_document_file, require_vault, search_documents


def document_markdown(document: PageNestDocument) -> str:
    lines = [f"# {document.title or '未命名收藏'}"]
    for label, value in (
        ("来源", document.source),
        ("作者", document.author),
        ("收藏时间", document.captured_at),
        ("分类", document.category),
    ):
        if value:
            lines.append(f"- {label}：{value}")
    if document.summary:
        lines.extend(("", "## AI 整理", "", document.summary))
    if document.note:
        lines.extend(("", "## 我的收藏备注", "", document.note))
    if document.text:
        lines.extend(("", "## 网页正文", "", document.text))
    if document.comments:
        lines.extend(("", "## 已加载评论", "", *(f"- {comment}" for comment in document.comments)))
    if document.image_descriptions:
        lines.extend(("", "## 图片说明", "", *(f"- {value}" for value in document.image_descriptions)))
    return "\n".join(lines).rstrip() + "\n"


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="PageNest", description="读取和搜索本地 PageNest 收藏")
    parser.add_argument("--vault", type=Path, help="覆盖当前配置的 Obsidian Vault（开发和测试用途）")
    commands = parser.add_subparsers(dest="command", required=True)

    read = commands.add_parser("read", help="输出一个收藏的干净正文")
    read.add_argument("path", help="当前 Vault 内的 .pagenest 或 .hermes 路径")
    read.add_argument("--format", choices=("text", "markdown", "json"), default="markdown")

    search = commands.add_parser("search", help="搜索当前 Vault 内的 PageNest 收藏")
    search.add_argument("query")
    search.add_argument("--limit", type=int, default=20)
    search.add_argument("--json", action="store_true", dest="as_json")
    return parser


def _vault(override: Path | None) -> Path:
    configured = override or settings.vault
    if configured is None:
        raise ValueError("尚未配置 Obsidian Vault，请先在 PageNest 设置中选择仓库")
    return require_vault(configured)


def _configure_utf8_output() -> None:
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if callable(reconfigure):
            reconfigure(encoding="utf-8", errors="strict")


def main(argv: list[str] | None = None) -> int:
    _configure_utf8_output()
    args = _parser().parse_args(argv)
    try:
        vault = _vault(args.vault)
        if args.command == "read":
            document = read_document_file(vault, args.path)
            if args.format == "json":
                output = json.dumps(asdict(document), ensure_ascii=False, indent=2) + "\n"
            elif args.format == "text":
                output = document.text.rstrip() + "\n"
            else:
                output = document_markdown(document)
        else:
            results = search_documents(vault, args.query, limit=args.limit)
            if args.as_json:
                output = json.dumps([asdict(result) for result in results], ensure_ascii=False, indent=2) + "\n"
            else:
                output = "\n".join(
                    f"{index}. {result.title}\n   {result.path}\n   {result.snippet}"
                    for index, result in enumerate(results, 1)
                )
                output = (output or "没有找到匹配的 PageNest 收藏") + "\n"
        sys.stdout.write(output)
        return 0
    except (OSError, ValueError) as error:
        print(f"PageNest：{error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
