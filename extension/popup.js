let article;
let tab;
const $ = id => document.getElementById(id);
const t = (key, substitutions) => PageNestI18n.message(key, substitutions);

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

async function loadVideoCaptureQuality() {
  const selected=await PageNestVideoCaptureQuality.load(chrome.storage.local);
  $("videoCaptureQuality").value=selected.key;
}

function showServiceStatus(state, detail="") {
  const status=$("serviceStatus");
  const labels={
    connecting:t("serviceConnecting"),
    connected:t("serviceConnected"),
    disconnected:t("serviceDisconnected"),
  };
  status.className=`service-status ${state}`;
  status.querySelector("strong").textContent=labels[state];
  $("serviceStatusDetail").textContent=detail||(
    state==="disconnected"?t("startServiceRetry"):t("usuallyMoments")
  );
  $("reconnectService").classList.toggle("hidden",state!=="disconnected");
}

async function connectService() {
  showServiceStatus("connecting");
  const result=await PageNestConnection.connect();
  if(!result){
    const diagnostic=PageNestConnection.diagnostic();
    const detail={
      "untrusted-extension":t("diagnosticUntrusted"),
      "pairing-disabled":t("diagnosticPairingDisabled"),
      "service-unreachable":t("diagnosticUnreachable"),
    }[diagnostic]||t("diagnosticInvalid");
    showServiceStatus("disconnected",detail);
    return false;
  }
  fillSettings(result.connection);
  if(result.incompatible){
    showServiceStatus("disconnected",t("serviceOld"));
    return false;
  }
  showServiceStatus("connected",`Service ${result.meta.service_version||t("ready")}`);
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
  return t("localFileAccess");
}

async function ensureCaptureAccess(value, extensionApi=chrome.extension) {
  const kind = captureKindForUrl(value);
  if (kind === "local-html" || !String(value || "").trim()) {
    const allowed = await new Promise(resolve => extensionApi.isAllowedFileSchemeAccess(resolve));
    if (!allowed) throw new Error(localFileAccessMessage());
  }
  if (!kind) throw new Error(t("unsupportedPage"));
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
    ? t("localImagesUnavailable", String(failed))
    : "";
}

async function loadAiSettings() {
  const data=await api("/api/ai-settings");
  $("aiUrl").value=data.api_url||"";
  $("aiModel").value=data.model_name||"";
  $("aiKey").value=data.has_api_key?"********":"";
  $("aiKey").dataset.saved=data.has_api_key?"true":"false";
  $("aiKey").dataset.savedUrl=data.has_api_key?(data.api_url||""):"";
  syncAiPresetControls();
}

function fillAiProviderPresets() {
  const options=PageNestAiPresets.providers.map(provider=>new Option(t(provider.labelKey)||provider.label,provider.id));
  $("aiProviderPreset").replaceChildren(...options);
}

function syncAiPresetControls() {
  const provider=PageNestAiPresets.findProviderByUrl($("aiUrl").value);
  $("aiProviderPreset").value=provider.id;
}

function savedAiKeyCanBeReused() {
  return $("aiKey").dataset.saved==="true"
    && $("aiKey").value==="********"
    && $("aiKey").dataset.savedUrl===$("aiUrl").value.trim();
}

function clearStaleSavedAiKey() {
  if(savedAiKeyCanBeReused() || $("aiKey").value!=="********") return;
  $("aiKey").value="";
  $("aiKey").dataset.saved="false";
}

async function identify() {
  $("progress").classList.remove("hidden");
  $("progress").textContent=t("identifyingBody");
  [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  const captureKind=await ensureCaptureAccess(tab.url||"");
  const target=captureKind==="web"?{tabId:tab.id,allFrames:true}:{tabId:tab.id};
  await chrome.scripting.executeScript({target,files:[
    "adapters/xiaohongshu-video-observer.js",
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
    "adapters/github.js",
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
  await PageNestXhsVideoBridge.apply(article,tab.id,chrome.scripting,false);
  $("title").textContent=article.title;
  $("detailTitle").textContent=article.title;
  $("domain").textContent=article.source_kind==="local-html"
    ?`Local HTML · ${article.source_name||t("localFile")}`
    :new URL(article.url).hostname;
  $("status").textContent=article.extraction_warning||(
    article.source_kind==="local-html"?t("localHtmlIdentified"):t("identifiedMethod", article.extraction_method)
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
  $("saveStatus").textContent=article.extraction_warning?t("reviewSuggested"):t("recognitionSuccess");
  $("saveStatus").className=`status-pill ${article.extraction_warning?"is-warning":"is-ready"}`;
  $("status").className="";
  $("progress").classList.add("hidden");
}

async function prepareCaptureForSave(capture,activeTab=tab) {
  await PageNestXhsVideoBridge.apply(capture,activeTab.id);
  await inlineBrowserReadableImages(capture);
  await inlineCommentAvatars(capture);
  redactLocalCapture(capture);
  return capture;
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
  const placementHtml=`<div class="placement ${appended||unplaced||failed||legacy?"warning":"ok"}"><b>${escapeHtml(t("imagePlacement"))}</b>: ${escapeHtml(t("imagePlacementCounts", [String(exact),String(ordinal),String(context),String(appended),String(unplaced),String(failed)]))}${unplaced?`<br>${escapeHtml(t("feishuPlacementWarning"))}`:""}${legacy?`<br>${escapeHtml(t("legacyCaptureWarning", chrome.runtime.getManifest().version))}`:""}</div>`;
  $("result").classList.remove("hidden");
  const heading=data.duplicate?t("alreadySaved"):incomplete?t("savedMediaIncomplete"):t("savedSingleFile");
  const savedVideos=Number(data.saved_videos)||0;
  const failedVideos=Number(data.failed_videos)||0;
  const videoValue=failedVideos?t("videosWithFailures",[String(savedVideos),String(failedVideos)]):t("videoCount",String(savedVideos));
  const organizerValue=data.hermes_success?t("organizedInSeconds",Number(data.hermes_seconds||0).toFixed(1)):t("bodyOnly");
  $("result").innerHTML=`<h2>${escapeHtml(heading)}</h2><div class="result-grid"><b>${escapeHtml(t("category"))}</b><span>${escapeHtml(data.category)}</span><b>${escapeHtml(t("offlinePage"))}</b><span>${escapeHtml(page)}</span><b>${escapeHtml(t("embeddedImages"))}</b><span>${escapeHtml(t("imageCount",String(Number(data.saved_images)||0)))}</span><b>${escapeHtml(t("embeddedVideos"))}</b><span>${escapeHtml(videoValue)}</span><b>${escapeHtml(t("fileFormat"))}</b><span>${escapeHtml(t("singleFileNoAssets"))}</span><b>${escapeHtml(t("aiOrganization"))}</b><span>${escapeHtml(organizerValue)}</span><b>${escapeHtml(t("imageProcessing"))}</b><span>${escapeHtml(t("seconds",Number(data.image_seconds||0).toFixed(1)))}</span><b>${escapeHtml(t("totalTime"))}</b><span>${escapeHtml(t("seconds",Number(data.total_seconds||0).toFixed(1)))}</span></div>${placementHtml}<div class="result-actions"><button id="openFolder">${escapeHtml(t("openFolder"))}</button><button id="copyPath">${escapeHtml(t("copyPath"))}</button><button id="openObsidian">${escapeHtml(t("openInObsidian"))}</button></div>`;
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
    const data=await response.json().catch(()=>({detail:t("unreadableServiceResponse")}));
    if(!response.ok) {
      const error=new Error(apiErrorMessage(data.detail,t("requestFailed",String(response.status))));
      error.status=response.status;
      error.detail=data.detail;
      throw error;
    }
    return data;
  } catch(error) {
    if(error.name==="AbortError") throw new Error(path==="/api/vault/select"
      ?t("vaultPickerTimeout")
      :t("saveTimeout"));
    if(error instanceof TypeError) throw new Error(t("serviceUnavailable"));
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
      const upgrade=new Error(t("serviceCaptureFormatOld"));
      upgrade.status=404;
      throw upgrade;
    }
    throw error;
  }
  const variant=payload.page_variant||"standard";
  if(!Array.isArray(capabilities?.supported_page_variants)||!capabilities.supported_page_variants.includes(variant)) {
    throw new Error(t("unsupportedCaptureVariant", variant));
  }
  return request("/api/collect",payload);
}

async function selectVaultWithServiceCapabilities(request=api) {
  const meta=await request("/api/meta");
  if(!Array.isArray(meta?.capabilities)||!meta.capabilities.includes("vault-selection")) {
    throw new Error(t("vaultChangeUnsupported"));
  }
  return request("/api/vault/select",{});
}

function applyFolderData(data) {
  const select=$("category");
  const selected=select.value;
  const auto=document.createElement("option");
  auto.value="auto";
  auto.textContent=t("autoFolder");
  select.replaceChildren(auto);
  for(const folder of data.folders) {
    const option=document.createElement("option");
    option.value=folder;
    option.textContent=folder;
    select.append(option);
  }
  select.value=data.folders.includes(selected)?selected:"auto";
  $("vaultName").textContent=data.vault_name;
  $("folderStatus").textContent=t("foldersFound",String(data.folders.length));
  $("folderStatus").className="";
  $("saveFolderStatus").textContent=t("vaultFolderCount",[data.vault_name,String(data.folders.length)]);
  $("saveFolderStatus").className="field-hint";
}

async function loadFolders() {
  $("folderStatus").textContent=t("readingFolders");
  $("folderStatus").className="";
  $("saveFolderStatus").textContent=t("readingFolders");
  $("saveFolderStatus").className="field-hint";
  applyFolderData(await api("/api/folders"));
}

document.querySelectorAll(".tab-button").forEach(button=>{
  button.onclick=()=>showView(button.dataset.target);
});

$("save").onclick=async()=>{
  let timer;
  try {
    if(!article) throw new Error(t("savingNotReady"));
    $("save").disabled=true;
    $("progress").classList.remove("hidden","error");
    const started=Date.now();
    const update=()=>{$("progress").textContent=t("savingElapsed",String(Math.floor((Date.now()-started)/1000)))};
    update();
    timer=setInterval(update,1000);
    article.user_note=$("note").value;
    article.mode=$("mode").value;
    article.category=$("category").value;
    await prepareCaptureForSave(article);
    const data=await collectWithServiceCapabilities(article);
    showResult(data);
    $("progress").classList.add("hidden");
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
  $("folderStatus").textContent=t("chooseVaultWindow");
  $("folderStatus").className="";
  try {
    const data=await selectVaultWithServiceCapabilities();
    if(data.cancelled) {
      $("vaultName").textContent=previousName;
      $("folderStatus").textContent=previousStatus;
      $("changeVault").textContent=previousLabel;
      return;
    }
    applyFolderData(data);
    $("changeVault").textContent=t("changeVault");
  } catch(error) {
    $("folderStatus").textContent=error.message;
    $("folderStatus").className="error";
    $("changeVault").textContent=t("chooseAgain");
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
  $("saveStatus").textContent=t("recognitionFailed");
  $("saveStatus").className="status-pill is-warning";
});
$("cancel").onclick=()=>window.close();
$("saveSettings").onclick=async()=>{
  await chrome.storage.local.set({server:$("server").value.replace(/\/$/,""),token:$("token").value});
  PageNestConnection.invalidate();
  try {
    if(!await connectService()) throw new Error(t("serviceDisconnected"));
    const data=await api("/api/health");
    $("connection").textContent=data.vault_configured?t("connectionFolders",String(data.folder_count)):t("vaultPathMissing");
    $("connection").className="ok";
    await Promise.all([loadFolders(),loadAiSettings()]);
  } catch(error) {
    $("connection").textContent=error.message;
    $("connection").className="error";
  }
};

$("videoCaptureQuality").onchange=async()=>{
  const status=$("videoCaptureQualityStatus");
  try {
    const selected=await PageNestVideoCaptureQuality.save(
      $("videoCaptureQuality").value,
      chrome.storage.local
    );
    $("videoCaptureQuality").value=selected.key;
    status.textContent=selected.key==="high"?t("qualityHighEnabled"):t("qualityStandardEnabled");
    status.className="field-hint ok";
  } catch(error) {
    status.textContent=error.message;
    status.className="field-hint error";
  }
};

fillAiProviderPresets();
syncAiPresetControls();
$("aiProviderPreset").onchange=()=>{
  const provider=PageNestAiPresets.findProvider($("aiProviderPreset").value);
  if(provider.url) $("aiUrl").value=provider.url;
  clearStaleSavedAiKey();
  syncAiPresetControls();
};
$("aiUrl").oninput=()=>{
  clearStaleSavedAiKey();
  syncAiPresetControls();
};
$("aiKey").oninput=()=>{$("aiKey").dataset.saved="false"};
$("saveAiSettings").onclick=async()=>{
  $("saveAiSettings").disabled=true;
  $("aiConnection").textContent=t("testingEndpoint");
  $("aiConnection").className="";
  try {
    const data=await api("/api/ai-settings",{
      api_url:$("aiUrl").value.trim(),
      model_name:$("aiModel").value.trim(),
      api_key:savedAiKeyCanBeReused()?null:$("aiKey").value
    });
    $("aiKey").value=data.has_api_key?"********":"";
    $("aiKey").dataset.saved=data.has_api_key?"true":"false";
    $("aiKey").dataset.savedUrl=data.has_api_key?(data.api_url||""):"";
    $("aiConnection").textContent=data.connection.online
      ?t("aiConnected",[data.connection.model,data.connection.vision?` · ${t("supportsImages")}`:""])
      :t("aiDisabled");
    $("aiConnection").className="ok";
  } catch(error) {
    $("aiConnection").textContent=error.message;
    $("aiConnection").className="error";
  } finally {
    $("saveAiSettings").disabled=false;
  }
};

async function initialize() {
  PageNestI18n.localizeDocument();
  $("extensionVersion").textContent=`v${chrome.runtime.getManifest().version}`;
  $("status").style.whiteSpace="pre-line";
  fillSettings(await getSettings());
  await loadVideoCaptureQuality();
  const [pageResult, serviceResult]=await Promise.allSettled([identify(),connectService()]);
  if(pageResult.status==="rejected") {
    $("status").textContent=pageResult.reason.message;
    $("status").className="error";
    $("saveStatus").textContent=t("recognitionFailed");
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
