"""Probe the configured organizer with a small generated image."""

import asyncio
import base64
import io
import json
from pathlib import Path
from time import perf_counter

import httpx
from PIL import Image, ImageDraw

from collector.config import settings


REPORT_PATH = Path(__file__).parent / "logs" / "vision-probe.json"
PROMPT = "请描述图片中的主要物体，读取其中的中文文字，并解释图表表达的趋势。"


def image_data_url() -> str:
    image = Image.new("RGB", (640, 360), "white")
    draw = ImageDraw.Draw(image)
    draw.rectangle((40, 190, 180, 310), fill="#6c63ff")
    draw.ellipse((250, 190, 370, 310), fill="#ff9f43")
    draw.line((430, 290, 500, 230, 570, 130), fill="#1976d2", width=8)
    draw.text((40, 40), "中文测试：物体与趋势", fill="black")
    output = io.BytesIO()
    image.save(output, "PNG")
    encoded = base64.b64encode(output.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def request_payload() -> dict:
    content = [
        {"type": "text", "text": PROMPT},
        {"type": "image_url", "image_url": {"url": image_data_url()}},
    ]
    return {
        "model": settings.hermes_model_name,
        "messages": [{"role": "user", "content": content}],
        "max_tokens": 500,
    }


async def run_probe() -> dict:
    report = {
        "api": settings.hermes_api_url,
        "model": settings.hermes_model_name,
        "tests": [],
    }
    if not settings.hermes_api_url:
        report["error"] = "HERMES_API_URL 未配置"
        return report

    headers = (
        {"Authorization": f"Bearer {settings.hermes_api_key}"}
        if settings.hermes_api_key
        else {}
    )
    started = perf_counter()
    try:
        async with httpx.AsyncClient(timeout=180) as client:
            response = await client.post(
                settings.hermes_api_url.rstrip("/") + "/chat/completions",
                json=request_payload(),
                headers=headers,
            )
        result = {
            "format": "Base64 Data URL/content array",
            "status": response.status_code,
            "seconds": perf_counter() - started,
            "response": response.text[:4000],
        }
    except Exception as exc:
        result = {
            "format": "Base64 Data URL/content array",
            "seconds": perf_counter() - started,
            "error": f"{type(exc).__name__}: {exc}",
        }
    report["tests"].append(result)
    return report


async def main() -> None:
    report = await run_probe()
    REPORT_PATH.parent.mkdir(exist_ok=True)
    REPORT_PATH.write_text(
        json.dumps(report, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(REPORT_PATH)


if __name__ == "__main__":
    asyncio.run(main())
