"""对已配置的 OpenAI 兼容接口执行真实 Base64 图片能力测试并保存 JSON 报告。"""
import asyncio, base64, io, json, time
from pathlib import Path
import httpx
from PIL import Image, ImageDraw
from collector.config import settings

async def main():
    image = Image.new("RGB", (640, 360), "white"); draw = ImageDraw.Draw(image)
    draw.rectangle((40, 190, 180, 310), fill="#6c63ff"); draw.ellipse((250, 190, 370, 310), fill="#ff9f43")
    draw.line((430, 290, 500, 230, 570, 130), fill="#1976d2", width=8); draw.text((40, 40), "中文测试：物体与趋势", fill="black")
    buf = io.BytesIO(); image.save(buf, "PNG"); data = base64.b64encode(buf.getvalue()).decode()
    report = {"api": settings.hermes_api_url, "model": settings.hermes_model_name, "tests": []}
    if not settings.hermes_api_url: report["error"] = "HERMES_API_URL 未配置"
    else:
        content = [{"type":"text","text":"请描述图片中的主要物体，读取其中的中文文字，并解释图表表达的趋势。"},{"type":"image_url","image_url":{"url":f"data:image/png;base64,{data}"}}]
        payload={"model":settings.hermes_model_name,"messages":[{"role":"user","content":content}],"max_tokens":500}
        headers={"Authorization":f"Bearer {settings.hermes_api_key}"} if settings.hermes_api_key else {}
        started=time.perf_counter()
        try:
            async with httpx.AsyncClient(timeout=180) as client: response=await client.post(settings.hermes_api_url.rstrip('/')+'/chat/completions',json=payload,headers=headers)
            report["tests"].append({"format":"Base64 Data URL/content array","status":response.status_code,"seconds":time.perf_counter()-started,"response":response.text[:4000]})
        except Exception as exc: report["tests"].append({"format":"Base64 Data URL/content array","seconds":time.perf_counter()-started,"error":f"{type(exc).__name__}: {exc}"})
    out=Path(__file__).parent/'logs'/'vision-probe.json'; out.parent.mkdir(exist_ok=True); out.write_text(json.dumps(report,ensure_ascii=False,indent=2),'utf-8'); print(out)

asyncio.run(main())
