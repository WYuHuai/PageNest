import base64
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "local-server"))

from collector.notebooks.models import Notebook, NotebookEntry  # noqa: E402
from collector.notebooks.rendering import render_notebook  # noqa: E402


OUTPUT = ROOT / "store-assets" / "edge" / "demo"


def image_data(name: str, directory: Path = ROOT / "store" / "assets") -> str:
    body = (directory / name).read_bytes()
    return "data:image/png;base64," + base64.b64encode(body).decode("ascii")


def build_demo() -> Path:
    notebook = Notebook(
        id="public-release-demo",
        title="产品设计公开课 · Video Notebook",
        source_url="https://example.com/videos/product-design",
        source_title="PageNest 无隐私演示视频",
        created_at="2026-08-25T10:00:00+08:00",
        updated_at="2026-08-25T10:12:00+08:00",
        revision=6,
        entries=[
            NotebookEntry(
                id="demo-01",
                captured_at="2026-08-25T10:02:00+08:00",
                video_timestamp_seconds=42,
                image_data=image_data("promo-marquee-1400x560.png"),
                title="课程开场：建立本地知识收藏",
                summary=(
                    "内容摘要\n介绍 PageNest 的本地知识收藏定位。\n\n"
                    "关键知识点\n• 网页与视频笔记保存到自己的 Vault\n"
                    "• 视频截图按时间线组织\n\n"
                    "画面关键信息\n• PageNest 品牌开场画面"
                ),
                analysis_status="complete",
            ),
            NotebookEntry(
                id="demo-02",
                captured_at="2026-08-25T10:05:00+08:00",
                video_timestamp_seconds=185,
                image_data=image_data(
                    "01_web_capture.png",
                    ROOT / "store-assets" / "edge" / "screenshots",
                ),
                title="保存完整网页的操作演示",
                summary=(
                    "内容摘要\n画面展示新版扩展完成正文识别后，选择保存模式和目标文件夹。\n\n"
                    "关键知识点\n• 网页模式不调用 AI\n"
                    "• AI 模式失败时仍保留原网页\n\n"
                    "画面关键信息\n• 三种模式显示清晰的相对耗时说明"
                ),
                analysis_status="complete",
            ),
            NotebookEntry(
                id="demo-03",
                captured_at="2026-08-25T10:09:00+08:00",
                video_timestamp_seconds=428,
                image_data=image_data("01-popup-save.png"),
                title="PageNest 网页收藏入口",
                summary=(
                    "内容摘要\n扩展 Popup 已完成正文识别，用户可以选择保存模式和 Vault 文件夹。\n\n"
                    "关键知识点\n• 新收藏不再包含收藏备注\n"
                    "• 保存结果为本地单文件页面\n\n"
                    "画面关键信息\n• PageNest 1.10.2 保存界面"
                ),
                analysis_status="complete",
            ),
        ],
    )
    OUTPUT.mkdir(parents=True, exist_ok=True)
    destination = OUTPUT / "notebook.raw.html"
    destination.write_text(render_notebook(notebook), encoding="utf-8", newline="\n")
    return destination


if __name__ == "__main__":
    print(build_demo())
