let article;
let tab;
const $ = id => document.getElementById(id);

async function getSettings() {
  return chrome.storage.local.get({server:"http://127.0.0.1:8765", token:""});
}

function fillSettings(data) {
  $("server").value=data.server;
  $("token").value=data.token;
}

async function inlineProtectedImages(capture) {
  if(capture.page_variant!=="feishu-document") return;
  const queue=(capture.images||[]).filter(item=>!item.data_url&&/^https?:/i.test(item.resolved_url||""));
  let cursor=0;
  const worker=async()=>{
    while(cursor<queue.length){
      const item=queue[cursor++];
      const controller=new AbortController();
      const timeout=setTimeout(()=>controller.abort(),15000);
      try{
        const response=await fetch(item.resolved_url,{credentials:"include",signal:controller.signal});
        if(!response.ok) continue;
        const blob=await response.blob();
        if(!blob.size||blob.size>25*1024*1024||!blob.type.startsWith("image/")) continue;
        item.data_url=await new Promise((resolve,reject)=>{
          const reader=new FileReader();
          reader.onload=()=>resolve(String(reader.result||""));
          reader.onerror=reject;
          reader.readAsDataURL(blob);
        });
      }catch{
        // The local service still gets one final chance to download the URL.
      }finally{
        clearTimeout(timeout);
      }
    }
  };
  await Promise.all(Array.from({length:Math.min(6,queue.length)},worker));
}

async function loadAiSettings() {
  const data=await api("/api/ai-settings");
  $("aiUrl").value=data.api_url||"";
  $("aiModel").value=data.model_name||"";
  $("aiKey").value=data.has_api_key?"********":"";
  $("aiKey").dataset.saved=data.has_api_key?"true":"false";
}

async function identify() {
  $("progress").classList.remove("hidden");
  $("progress").textContent="正在识别网页正文……";
  [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  if(!/^https?:/.test(tab.url||"")) throw new Error("浏览器内部页面不能采集，请打开普通网页后重试");
  const target={tabId:tab.id,allFrames:true};
  await chrome.scripting.executeScript({target,files:[
    "media-capture.js",
    "core/extractor-core.js",
    "core/canvas.js",
    "core/adapter-registry.js",
    "adapters/bilibili.js",
    "adapters/feishu.js",
    "adapters/wechat.js",
    "adapters/csdn.js",
    "adapters/generic.js",
    "extractor.js",
  ]});
  const captures=await chrome.scripting.executeScript({
    target,
    func:async()=>{
      try { return await collectPage(); }
      catch(error) { return {capture_error:`${error?.name||"Error"}: ${error?.message||error}`}; }
    }
  });
  article=selectBestCapture(captures,tab);
  await inlineProtectedImages(article);
  $("title").textContent=article.title;
  $("domain").textContent=new URL(article.url).hostname;
  $("status").textContent=article.extraction_warning||`已识别 · ${article.extraction_method}`;
  $("length").textContent=`${article.article_text.length.toLocaleString()} 字`;
  $("images").textContent=`${article.images.length} 张图片 · ${(article.media||[]).length} 个视频`;
  $("progress").classList.add("hidden");
}

function escapeHtml(value) {
  return String(value??"").replace(/[&<>"']/g,character=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[character]));
}

function showResult(data) {
  const page=data.page_path||data.markdown_path;
  const placement=data.image_placement||{};
  const exact=Number(placement.exact)||0;
  const ordinal=Number(placement.ordinal)||0;
  const context=Number(placement.context)||0;
  const appended=Number(placement.appended)||0;
  const unplaced=Number(placement.unplaced)||0;
  const legacy=Number(data.capture_version||1)<12;
  const failed=Number(data.failed_images)||0;
  const incomplete=data.media_complete===false;
  const placementHtml=`<div class="placement ${appended||unplaced||failed||legacy?"warning":"ok"}"><b>图片位置</b>：原位 ${exact} 张 · 顺序回填 ${ordinal} 张 · 文字定位 ${context} 张 · 末尾兜底 ${appended} 张 · 未定位 ${unplaced} 张 · 下载失败 ${failed} 张${unplaced?"<br>飞书图片未找到对应内容块，已停止末尾堆放；请把这组数字反馈用于诊断。":""}${legacy?"<br>检测到旧版采集协议，请到 edge://extensions 点击“重新加载”，并确认扩展版本为 1.7.4。":""}</div>`;
  $("result").classList.remove("hidden");
  $("result").innerHTML=`<h2>${data.duplicate?"这篇网页已经收藏过":incomplete?"页面已保存，但有媒体未嵌入":"单文件页面已保存"}</h2><div class="result-grid"><b>分类</b><span>${escapeHtml(data.category)}</span><b>离线页面</b><span>${escapeHtml(page)}</span><b>内嵌图片</b><span>${Number(data.saved_images)||0} 张</span><b>内嵌视频</b><span>${Number(data.saved_videos)||0} 个${Number(data.failed_videos)||0?`（${Number(data.failed_videos)} 个提取失败）`:""}</span><b>文件形式</b><span>一个离线页面，无附件目录</span><b>智能整理</b><span>${data.hermes_success?`整理成功 · ${Number(data.hermes_seconds||0).toFixed(1)} 秒`:"仅保留正文"}</span><b>图片处理</b><span>${Number(data.image_seconds||0).toFixed(1)} 秒</span><b>总耗时</b><span>${Number(data.total_seconds||0).toFixed(1)} 秒</span></div>${placementHtml}<div class="result-actions"><button id="openFolder">打开文件夹</button><button id="copyPath">复制路径</button><button id="openObsidian">在 Obsidian 中打开</button></div>`;
  $("openFolder").onclick=()=>api("/api/open-folder",{path:data.folder_path});
  $("copyPath").onclick=()=>navigator.clipboard.writeText(page);
  $("openObsidian").onclick=()=>chrome.tabs.create({url:`obsidian://open?path=${encodeURIComponent(page)}`});
}

async function api(path, body) {
  const cfg=await getSettings();
  const controller=new AbortController();
  const timeoutMs=body?300000:15000;
  const timeout=setTimeout(()=>controller.abort(),timeoutMs);
  try {
    const response=await fetch(cfg.server+path,{method:body?"POST":"GET",headers:{"Content-Type":"application/json","Authorization":`Bearer ${cfg.token}`},body:body?JSON.stringify(body):undefined,signal:controller.signal});
    const data=await response.json().catch(()=>({detail:"本地服务返回了无法读取的内容"}));
    if(!response.ok) throw new Error(data.detail||`请求失败（${response.status}）`);
    return data;
  } catch(error) {
    if(error.name==="AbortError") throw new Error("保存超过 5 分钟，已停止等待；已落盘的离线页面不会丢失");
    if(error instanceof TypeError) throw new Error("本地收藏服务未启动，请双击“启动网页收藏器.bat”后重试");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function loadFolders() {
  const select=$("category");
  const selected=select.value;
  $("folderStatus").textContent="正在读取 Obsidian 文件夹…";
  $("folderStatus").className="";
  const data=await api("/api/folders");
  const auto=document.createElement("option");
  auto.value="auto";
  auto.textContent="智能整理自动判断";
  select.replaceChildren(auto);
  for(const folder of data.folders) {
    const option=document.createElement("option");
    option.value=folder;
    option.textContent=folder;
    select.append(option);
  }
  select.value=data.folders.includes(selected)?selected:"auto";
  $("folderStatus").textContent=`${data.vault_name} · 已识别 ${data.folders.length} 个文件夹；每次打开扩展都会刷新`;
}

$("save").onclick=async()=>{
  let timer;
  try {
    if(!article) throw new Error("网页正文尚未识别完成");
    $("save").disabled=true;
    $("progress").classList.remove("hidden","error");
    const started=Date.now();
    const update=()=>{$("progress").textContent=`正在保存离线页面，正文会先落盘；已等待 ${Math.floor((Date.now()-started)/1000)} 秒`};
    update();
    timer=setInterval(update,1000);
    article.user_note=$("note").value;
    article.mode=$("mode").value;
    article.category=$("category").value;
    const data=await api("/api/collect",article);
    $("progress").textContent=data.media_complete===false
      ?`页面已保存，但有 ${Number(data.failed_images||0)+Number(data.image_placement?.unplaced||0)} 张图片和 ${Number(data.failed_videos||0)} 个视频未嵌入。`
      :data.hermes_error?`页面已保存，但智能整理未完成：${data.hermes_error}`:"单文件页面保存完成。";
    showResult(data);
  } catch(error) {
    $("progress").textContent=error.message;
    $("progress").classList.add("error");
  } finally {
    if(timer) clearInterval(timer);
    $("save").disabled=false;
  }
};

$("refreshFolders").onclick=()=>loadFolders().catch(error=>{
  $("folderStatus").textContent=error.message;
  $("folderStatus").className="error";
});
$("retry").onclick=()=>identify().catch(error=>{$("status").textContent=error.message;$("status").className="error"});
$("cancel").onclick=()=>window.close();
$("saveSettings").onclick=async()=>{
  await chrome.storage.local.set({server:$("server").value.replace(/\/$/,""),token:$("token").value});
  try {
    const data=await api("/api/health");
    $("connection").textContent=data.vault_configured?`连接正常，已识别 ${data.folder_count} 个文件夹`:"连接正常，但还需要填写 OBSIDIAN_VAULT_PATH";
    $("connection").className="ok";
    await Promise.all([loadFolders(),loadAiSettings()]);
  } catch(error) {
    $("connection").textContent=error.message;
    $("connection").className="error";
  }
};

$("aiKey").oninput=()=>{$("aiKey").dataset.saved="false"};
$("saveAiSettings").onclick=async()=>{
  $("saveAiSettings").disabled=true;
  $("aiConnection").textContent="正在测试接口…";
  $("aiConnection").className="";
  try {
    const keyUnchanged=$("aiKey").dataset.saved==="true" && $("aiKey").value==="********";
    const data=await api("/api/ai-settings",{
      api_url:$("aiUrl").value.trim(),
      model_name:$("aiModel").value.trim(),
      api_key:keyUnchanged?null:$("aiKey").value
    });
    $("aiKey").value=data.has_api_key?"********":"";
    $("aiKey").dataset.saved=data.has_api_key?"true":"false";
    $("aiConnection").textContent=data.connection.online
      ?`连接成功 · ${data.connection.model}${data.connection.vision?" · 支持图片":""}`
      :"已关闭智能整理，网页仍可正常保存";
    $("aiConnection").className="ok";
  } catch(error) {
    $("aiConnection").textContent=error.message;
    $("aiConnection").className="error";
  } finally {
    $("saveAiSettings").disabled=false;
  }
};

async function initialize() {
  $("extensionVersion").textContent=`v${chrome.runtime.getManifest().version}`;
  fillSettings(await getSettings());
  const [pageResult, folderResult, aiResult]=await Promise.allSettled([identify(),loadFolders(),loadAiSettings()]);
  if(pageResult.status==="rejected") {
    $("status").textContent=pageResult.reason.message;
    $("status").className="error";
    $("progress").classList.add("hidden");
  }
  if(folderResult.status==="rejected") {
    $("folderStatus").textContent=folderResult.reason.message;
    $("folderStatus").className="error";
  }
  if(aiResult.status==="rejected") {
    $("aiConnection").textContent=aiResult.reason.message;
    $("aiConnection").className="error";
  }
}

initialize();
