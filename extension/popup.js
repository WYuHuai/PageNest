let article;
let tab;
const $ = id => document.getElementById(id);

function showView(name) {
  $("tabBar").dataset.active=name;
  document.querySelectorAll(".app-view").forEach(view=>{
    const active=view.dataset.view===name;
    view.hidden=!active;
    view.classList.toggle("is-active",active);
  });
  document.querySelectorAll(".tab-button").forEach(button=>{
    const active=button.dataset.target===name;
    button.classList.toggle("is-active",active);
    button.setAttribute("aria-selected",String(active));
  });
}

async function getSettings() {
  return PageNestConnection.load();
}

function fillSettings(data) {
  $("server").value=data.server;
  $("token").value=data.token;
}

function showServiceStatus(state, detail="") {
  const status=$("serviceStatus");
  const labels={
    connecting:"正在连接 PageNest 后台服务",
    connected:"PageNest 后台服务已连接",
    disconnected:"PageNest 后台服务未连接",
  };
  status.className=`service-status ${state}`;
  status.querySelector("strong").textContent=labels[state];
  $("serviceStatusDetail").textContent=detail||(
    state==="disconnected"?"请启动 PageNest 后重试":"通常只需要片刻"
  );
  $("reconnectService").classList.toggle("hidden",state!=="disconnected");
}

async function connectService() {
  showServiceStatus("connecting");
  const result=await PageNestConnection.connect();
  if(!result){
    showServiceStatus("disconnected");
    return false;
  }
  fillSettings(result.connection);
  if(result.incompatible){
    showServiceStatus("disconnected","Service 版本过旧，请升级 PageNest 本地服务");
    return false;
  }
  showServiceStatus("connected",`Service ${result.meta.service_version||"已就绪"}`);
  return true;
}

function captureKindForUrl(value) {
  try {
    const url = new URL(value);
    if (["http:", "https:"].includes(url.protocol)) return "web";
    if (url.protocol === "file:" && /\.(?:html?|xhtml)$/i.test(url.pathname)) return "local-html";
  } catch {}
  return "";
}

function localFileAccessMessage() {
  return [
    "PageNest 还没有访问本地 HTML 文件的权限。",
    "请：",
    "1. 右键 PageNest 扩展图标",
    "2. 选择“管理扩展程序”",
    "3. 开启“允许访问文件网址”",
    "4. 返回这个 HTML 页面重新点击 PageNest",
  ].join("\n");
}

async function ensureCaptureAccess(value, extensionApi=chrome.extension) {
  const kind = captureKindForUrl(value);
  if (kind === "local-html" || !String(value || "").trim()) {
    const allowed = await new Promise(resolve => extensionApi.isAllowedFileSchemeAccess(resolve));
    if (!allowed) throw new Error(localFileAccessMessage());
  }
  if (!kind) throw new Error("当前页面类型不支持收藏；请打开普通网页或本地 HTML 文件后重试");
  return kind;
}

function inlineImagePolicy(capture) {
  const hostname = new URL(capture.url || location.href).hostname;
  if (capture.source_kind === "local-html") return {maxImages: 40, maxBytes: 80 * 1024 * 1024};
  if (capture.page_variant === "feishu-document") return {maxImages: 200, maxBytes: 160 * 1024 * 1024};
  if (/(^|\.)xiaohongshu\.com$/i.test(hostname)) return {maxImages: 40, maxBytes: 80 * 1024 * 1024};
  return null;
}

async function inlineBrowserReadableImages(capture) {
  const policy = inlineImagePolicy(capture);
  if (!policy) return;
  const seen = new Set();
  const queue = (capture.images || []).filter(item => {
    const source = item.resolved_url || "";
    const allowed = capture.source_kind === "local-html" ? /^(?:https?|file):/i : /^https?:/i;
    if (item.data_url || !allowed.test(source) || seen.has(source)) return false;
    seen.add(source);
    return true;
  }).slice(0, policy.maxImages);
  let cursor=0;
  let totalBytes=0;
  const worker=async()=>{
    while(cursor<queue.length){
      const item=queue[cursor++];
      const controller=new AbortController();
      const timeout=setTimeout(()=>controller.abort(),15000);
      try{
        const response=await fetch(item.resolved_url,{credentials:"include",signal:controller.signal});
        if(!response.ok) continue;
        const blob=await response.blob();
        if(!blob.size||blob.size>25*1024*1024||!blob.type.startsWith("image/")||totalBytes+blob.size>policy.maxBytes) continue;
        totalBytes+=blob.size;
        item.data_url=await new Promise((resolve,reject)=>{
          const reader=new FileReader();
          reader.onload=()=>resolve(String(reader.result||""));
          reader.onerror=reject;
          reader.readAsDataURL(blob);
        });
      }catch{
        // HTTP(S) URLs can still be handled by the service; file URLs are redacted below.
      }finally{
        clearTimeout(timeout);
      }
    }
  };
  await Promise.all(Array.from({length:Math.min(6,queue.length)},worker));
}

async function inlineCommentAvatars(capture) {
  if (capture.page_variant !== "xiaohongshu-note") return;
  const comments=[];
  for (const comment of capture.comments || []) comments.push(comment,...(comment.replies || []));
  const cache=new Map();
  const sources=[...new Set(comments.map(comment=>comment.avatar_url||"").filter(source=>/^https:\/\//i.test(source)))];
  let cursor=0;
  let totalBytes=0;
  const worker=async()=>{
    while(cursor<sources.length){
      const source=sources[cursor++];
      const controller=new AbortController();
      const timeout=setTimeout(()=>controller.abort(),8000);
      try {
        const response=await fetch(source,{credentials:"include",signal:controller.signal});
        if (!response.ok) continue;
        const blob=await response.blob();
        if (!blob.size || blob.size>256*1024 || totalBytes+blob.size>4*1024*1024 || !blob.type.startsWith("image/")) continue;
        const dataUrl=await new Promise((resolve,reject)=>{
          const reader=new FileReader();
          reader.onload=()=>resolve(String(reader.result||""));
          reader.onerror=reject;
          reader.readAsDataURL(blob);
        });
        totalBytes+=blob.size;
        cache.set(source,dataUrl);
      } catch {} finally {
        clearTimeout(timeout);
      }
    }
  };
  await Promise.all(Array.from({length:Math.min(4,sources.length)},worker));
  for (const comment of comments) comment.avatar_data_url=cache.get(comment.avatar_url)||"";
}

function redactLocalCapture(capture) {
  if (capture.source_kind !== "local-html") return;
  const parsed = new DOMParser().parseFromString(capture.article_html, "text/html");
  HermesExtractorCore.redactLocalResources(parsed.body, capture.images || [], capture.media || []);
  capture.article_html = parsed.body.innerHTML;
  const failed = (capture.images || []).filter(image => image.source_type === "local-file-unavailable").length;
  capture.extraction_warning = failed
    ? `${failed} 张本地图片无法由浏览器读取，正文仍可保存；请检查文件访问权限或图片路径。`
    : "";
}

async function loadAiSettings() {
  const data=await api("/api/ai-settings");
  $("aiUrl").value=data.api_url||"";
  $("aiModel").value=data.model_name||"";
  $("aiKey").value=data.has_api_key?"********":"";
  $("aiKey").dataset.saved=data.has_api_key?"true":"false";
  syncAiPresetControls();
}

function fillAiProviderPresets() {
  const options=PageNestAiPresets.providers.map(provider=>new Option(provider.label,provider.id));
  $("aiProviderPreset").replaceChildren(...options);
}

function fillAiModelPresets(providerId) {
  const provider=PageNestAiPresets.findProvider(providerId);
  const custom=new Option("自己填写（使用上方当前模型）","");
  const options=provider.models.map(model=>new Option(model,model));
  $("aiModelPreset").replaceChildren(custom,...options);
  $("aiModelHint").textContent=provider.models.length
    ?"选择后会填入上方，仍可继续手动修改。"
    :"该接口的模型由本机或账号决定，请在上方填写模型 ID。";
}

function syncAiPresetControls() {
  const provider=PageNestAiPresets.findProviderByUrl($("aiUrl").value);
  $("aiProviderPreset").value=provider.id;
  fillAiModelPresets(provider.id);
  const model=$("aiModel").value.trim();
  $("aiModelPreset").value=provider.models.includes(model)?model:"";
}

async function identify() {
  $("progress").classList.remove("hidden");
  $("progress").textContent="正在识别网页正文……";
  [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  const captureKind=await ensureCaptureAccess(tab.url||"");
  const target=captureKind==="web"?{tabId:tab.id,allFrames:true}:{tabId:tab.id};
  await chrome.scripting.executeScript({target,files:[
    "media-capture.js",
    "core/content-quality.js",
    "core/extractor-core.js",
    "core/canvas.js",
    "core/adapter-registry.js",
    "adapters/bilibili.js",
    "adapters/feishu.js",
    "adapters/wechat.js",
    "adapters/csdn.js",
    "adapters/guyue.js",
    "adapters/xiaohongshu.js",
    "adapters/local-html.js",
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
  await inlineBrowserReadableImages(article);
  await inlineCommentAvatars(article);
  redactLocalCapture(article);
  $("title").textContent=article.title;
  $("detailTitle").textContent=article.title;
  $("domain").textContent=article.source_kind==="local-html"
    ?`本地 HTML · ${article.source_name||"本地文件"}`
    :new URL(article.url).hostname;
  $("status").textContent=article.extraction_warning||(
    article.source_kind==="local-html"?"已识别 · 本地 HTML":`已识别 · ${article.extraction_method}`
  );
  const textLength=article.article_text.length.toLocaleString();
  const imageCount=article.images.length;
  const videoCount=(article.media||[]).length;
  $("length").textContent=textLength;
  $("images").textContent=imageCount.toLocaleString();
  $("videos").textContent=videoCount.toLocaleString();
  $("saveLength").textContent=textLength;
  $("saveImages").textContent=imageCount.toLocaleString();
  $("saveVideos").textContent=videoCount.toLocaleString();
  $("saveStatus").textContent=article.extraction_warning?"建议检查":"识别成功";
  $("saveStatus").className=`status-pill ${article.extraction_warning?"is-warning":"is-ready"}`;
  $("status").className="";
  $("progress").classList.add("hidden");
}

function escapeHtml(value) {
  return String(value??"").replace(/[&<>"']/g,character=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[character]));
}

function apiErrorMessage(detail, fallback) {
  if (typeof detail === "string" && detail.trim()) return detail;
  if (detail && typeof detail === "object") {
    if (typeof detail.message === "string" && detail.message.trim()) return detail.message;
    if (Array.isArray(detail)) {
      const messages = detail.map(item => typeof item === "string" ? item : item?.msg || item?.message || "").filter(Boolean);
      if (messages.length) return messages.join("；");
    }
    try { return JSON.stringify(detail); } catch {}
  }
  return fallback;
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
  const placementHtml=`<div class="placement ${appended||unplaced||failed||legacy?"warning":"ok"}"><b>图片位置</b>：原位 ${exact} 张 · 顺序回填 ${ordinal} 张 · 文字定位 ${context} 张 · 末尾兜底 ${appended} 张 · 未定位 ${unplaced} 张 · 下载失败 ${failed} 张${unplaced?"<br>飞书图片未找到对应内容块，已停止末尾堆放；请把这组数字反馈用于诊断。":""}${legacy?`<br>检测到旧版采集协议，请到 edge://extensions 点击“重新加载”，并确认扩展版本为 v${chrome.runtime.getManifest().version}。`:""}</div>`;
  $("result").classList.remove("hidden");
  $("result").innerHTML=`<h2>${data.duplicate?"这篇网页已经收藏过":incomplete?"页面已保存，但有媒体未嵌入":"单文件页面已保存"}</h2><div class="result-grid"><b>分类</b><span>${escapeHtml(data.category)}</span><b>离线页面</b><span>${escapeHtml(page)}</span><b>内嵌图片</b><span>${Number(data.saved_images)||0} 张</span><b>内嵌视频</b><span>${Number(data.saved_videos)||0} 个${Number(data.failed_videos)||0?`（${Number(data.failed_videos)} 个提取失败）`:""}</span><b>文件形式</b><span>一个离线页面，无附件目录</span><b>智能整理</b><span>${data.hermes_success?`整理成功 · ${Number(data.hermes_seconds||0).toFixed(1)} 秒`:"仅保留正文"}</span><b>图片处理</b><span>${Number(data.image_seconds||0).toFixed(1)} 秒</span><b>总耗时</b><span>${Number(data.total_seconds||0).toFixed(1)} 秒</span></div>${placementHtml}<div class="result-actions"><button id="openFolder">打开文件夹</button><button id="copyPath">复制路径</button><button id="openObsidian">在 Obsidian 中打开</button></div>`;
  $("openFolder").onclick=()=>api("/api/open-folder",{path:data.folder_path});
  $("copyPath").onclick=()=>navigator.clipboard.writeText(page);
  $("openObsidian").onclick=()=>chrome.tabs.create({url:`obsidian://open?path=${encodeURIComponent(page)}`});
}

async function api(path, body, retryPairing=true) {
  const cfg=await getSettings();
  const controller=new AbortController();
  const timeoutMs=path==="/api/vault/select"?3600000:body?300000:15000;
  const timeout=setTimeout(()=>controller.abort(),timeoutMs);
  try {
    const response=await fetch(cfg.server+path,{method:body?"POST":"GET",headers:{"Content-Type":"application/json","Authorization":`Bearer ${cfg.token}`},body:body?JSON.stringify(body):undefined,signal:controller.signal});
    if(response.status===401&&retryPairing){
      PageNestConnection.invalidate();
      const refreshed=await PageNestConnection.load({force:true});
      if(refreshed.token&&(`${refreshed.server}\n${refreshed.token}`!==`${cfg.server}\n${cfg.token}`)){
        return api(path,body,false);
      }
    }
    const data=await response.json().catch(()=>({detail:"本地服务返回了无法读取的内容"}));
    if(!response.ok) {
      const error=new Error(apiErrorMessage(data.detail,`请求失败（${response.status}）`));
      error.status=response.status;
      error.detail=data.detail;
      throw error;
    }
    return data;
  } catch(error) {
    if(error.name==="AbortError") throw new Error(path==="/api/vault/select"
      ?"文件夹选择器等待超时，请重新选择仓库"
      :"保存超过 5 分钟，客户端已停止等待；请先检查知识库中是否出现新页面，再决定是否重试");
    if(error instanceof TypeError) throw new Error("PageNest 后台服务未连接，请启动 PageNest 后重试");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function collectWithServiceCapabilities(payload, request=api) {
  let capabilities;
  try {
    capabilities=await request("/api/meta");
  } catch(error) {
    if(error.status===404) {
      const upgrade=new Error("本地 PageNest Service 版本过旧，不支持当前网页保存格式，请升级本地服务。");
      upgrade.status=404;
      throw upgrade;
    }
    throw error;
  }
  const variant=payload.page_variant||"standard";
  if(!Array.isArray(capabilities?.supported_page_variants)||!capabilities.supported_page_variants.includes(variant)) {
    throw new Error(`本地 PageNest Service 不支持当前网页保存格式：${variant}，请升级本地服务。`);
  }
  return request("/api/collect",payload);
}

function applyFolderData(data) {
  const select=$("category");
  const selected=select.value;
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
  $("vaultName").textContent=data.vault_name;
  $("folderStatus").textContent=`已识别 ${data.folders.length} 个文件夹`;
  $("folderStatus").className="";
  $("saveFolderStatus").textContent=`${data.vault_name} · ${data.folders.length} 个文件夹`;
  $("saveFolderStatus").className="field-hint";
}

async function loadFolders() {
  $("folderStatus").textContent="正在读取 Obsidian 文件夹…";
  $("folderStatus").className="";
  $("saveFolderStatus").textContent="正在读取 Obsidian 文件夹…";
  $("saveFolderStatus").className="field-hint";
  applyFolderData(await api("/api/folders"));
}

document.querySelectorAll(".tab-button").forEach(button=>{
  button.onclick=()=>showView(button.dataset.target);
});

$("save").onclick=async()=>{
  let timer;
  try {
    if(!article) throw new Error("网页正文尚未识别完成");
    $("save").disabled=true;
    $("progress").classList.remove("hidden","error");
    const started=Date.now();
    const update=()=>{$("progress").textContent=`正在生成完整离线页面，完成后会一次性写入知识库；已等待 ${Math.floor((Date.now()-started)/1000)} 秒`};
    update();
    timer=setInterval(update,1000);
    article.user_note=$("note").value;
    article.mode=$("mode").value;
    article.category=$("category").value;
    const data=await collectWithServiceCapabilities(article);
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
  $("saveFolderStatus").textContent=error.message;
  $("saveFolderStatus").className="field-hint error";
});
$("changeVault").onclick=async()=>{
  const previousName=$("vaultName").textContent;
  const previousStatus=$("folderStatus").textContent;
  const previousLabel=$("changeVault").textContent;
  $("changeVault").disabled=true;
  $("refreshFolders").disabled=true;
  $("folderStatus").textContent="请在 Windows 窗口中选择 Obsidian Vault…";
  $("folderStatus").className="";
  try {
    const data=await api("/api/vault/select",{});
    if(data.cancelled) {
      $("vaultName").textContent=previousName;
      $("folderStatus").textContent=previousStatus;
      $("changeVault").textContent=previousLabel;
      return;
    }
    applyFolderData(data);
    $("changeVault").textContent="更换仓库";
  } catch(error) {
    $("folderStatus").textContent=error.message;
    $("folderStatus").className="error";
    $("changeVault").textContent="重新选择";
  } finally {
    $("changeVault").disabled=false;
    $("refreshFolders").disabled=false;
  }
};
$("reconnectService").onclick=async()=>{
  if(await connectService()) await Promise.all([loadFolders(),loadAiSettings()]);
};
$("retry").onclick=()=>identify().catch(error=>{
  $("status").textContent=error.message;
  $("status").className="error";
  $("saveStatus").textContent="识别失败";
  $("saveStatus").className="status-pill is-warning";
});
$("cancel").onclick=()=>window.close();
$("saveSettings").onclick=async()=>{
  await chrome.storage.local.set({server:$("server").value.replace(/\/$/,""),token:$("token").value});
  PageNestConnection.invalidate();
  try {
    if(!await connectService()) throw new Error("PageNest 后台服务未连接");
    const data=await api("/api/health");
    $("connection").textContent=data.vault_configured?`连接正常，已识别 ${data.folder_count} 个文件夹`:"连接正常，但还需要填写 OBSIDIAN_VAULT_PATH";
    $("connection").className="ok";
    await Promise.all([loadFolders(),loadAiSettings()]);
  } catch(error) {
    $("connection").textContent=error.message;
    $("connection").className="error";
  }
};

fillAiProviderPresets();
syncAiPresetControls();
$("aiProviderPreset").onchange=()=>{
  const provider=PageNestAiPresets.findProvider($("aiProviderPreset").value);
  if(provider.url) $("aiUrl").value=provider.url;
  fillAiModelPresets(provider.id);
  $("aiModelPreset").value=provider.models.includes($("aiModel").value.trim())?$("aiModel").value.trim():"";
};
$("aiModelPreset").onchange=()=>{
  if($("aiModelPreset").value) $("aiModel").value=$("aiModelPreset").value;
};
$("aiUrl").oninput=syncAiPresetControls;
$("aiModel").oninput=()=>{
  const model=$("aiModel").value.trim();
  const provider=PageNestAiPresets.findProvider($("aiProviderPreset").value);
  $("aiModelPreset").value=provider.models.includes(model)?model:"";
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
  $("status").style.whiteSpace="pre-line";
  fillSettings(await getSettings());
  const [pageResult, serviceResult]=await Promise.allSettled([identify(),connectService()]);
  if(pageResult.status==="rejected") {
    $("status").textContent=pageResult.reason.message;
    $("status").className="error";
    $("saveStatus").textContent="识别失败";
    $("saveStatus").className="status-pill is-warning";
    $("progress").classList.add("hidden");
  }
  if(serviceResult.status==="fulfilled"&&serviceResult.value) {
    const [folderResult,aiResult]=await Promise.allSettled([loadFolders(),loadAiSettings()]);
    if(folderResult.status==="rejected") {
      $("folderStatus").textContent=folderResult.reason.message;
      $("folderStatus").className="error";
      $("saveFolderStatus").textContent=folderResult.reason.message;
      $("saveFolderStatus").className="field-hint error";
    }
    if(aiResult.status==="rejected") {
      $("aiConnection").textContent=aiResult.reason.message;
      $("aiConnection").className="error";
    }
  } else if(serviceResult.status==="rejected") {
    showServiceStatus("disconnected",serviceResult.reason.message);
  }
}

initialize();
