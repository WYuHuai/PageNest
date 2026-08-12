const assert=require("assert");
const fs=require("fs");
const path=require("path");
require("../extension/core/connection.js");

function storage(initial){
  let saved={...initial};
  return {
    get:async defaults=>({...defaults,...saved}),
    set:async values=>{saved={...saved,...values}},
    value:()=>saved,
  };
}

(async()=>{
  const existing=storage({server:"http://127.0.0.1:8765",token:"existing"});
  let requests=0;
  assert.equal((await PageNestConnection.load({
    storage:existing,
    request:async()=>{requests++;return {ok:false};},
  })).token,"existing");
  assert.equal(requests,3);
  assert.equal((await PageNestConnection.load({
    storage:existing,
    request:async()=>{requests++;return {ok:false};},
  })).token,"existing");
  assert.equal(requests,3);

  const recovered=await PageNestConnection.load({
    storage:existing,
    force:true,
    request:async url=>url.includes(":18765/")
      ?{ok:true,json:async()=>({token:"recovered"})}
      :{ok:false},
  });
  assert.deepEqual(recovered,{server:"http://127.0.0.1:18765",token:"recovered"});

  const stale=storage({server:"http://127.0.0.1:8765",token:"stale"});
  const migrated=await PageNestConnection.load({
    storage:stale,
    request:async url=>url.includes(":18765/")
      ?{ok:true,json:async()=>({token:"migrated"})}
      :{ok:false},
  });
  assert.deepEqual(migrated,{server:"http://127.0.0.1:18765",token:"migrated"});
  assert.deepEqual(stale.value(),migrated);

  const preconfigured=storage({server:"http://127.0.0.1:18765",token:"stale"});
  const installed={server:"http://127.0.0.1:18765",token:"installed"};
  assert.deepEqual(await PageNestConnection.load({
    storage:preconfigured,
    installed,
    request:async()=>{throw new Error("pairing should not be needed")},
  }),installed);
  assert.deepEqual(preconfigured.value(),installed);

  const empty=storage({server:"http://127.0.0.1:8765",token:""});
  const pairRequests=[];
  const paired=await PageNestConnection.load({
    storage:empty,
    request:async(url,options)=>{
      pairRequests.push({url,options});
      if(url.includes(":8765/")) return {ok:false};
      return {ok:true,json:async()=>({token:"paired"})};
    },
  });
  assert.equal(paired.token,"paired");
  assert.equal(paired.server,"http://127.0.0.1:18765");
  assert.equal(empty.value().token,"paired");
  assert.deepEqual(pairRequests.map(item=>item.url),[
    "http://127.0.0.1:8765/api/pair",
    "http://127.0.0.1:18765/api/pair",
  ]);
  for(const {options} of pairRequests){
    assert.equal(options.method,"POST");
    assert.equal(options.headers["Content-Type"],"application/json");
    assert.equal(options.body,"{}");
  }

  const unavailable=storage({server:"http://127.0.0.1:8765",token:""});
  assert.equal((await PageNestConnection.load({
    storage:unavailable,
    request:async()=>({ok:false,status:403}),
  })).token,"");
  assert.equal(PageNestConnection.diagnostic(),"untrusted-extension");

  const pairingDisabled=storage({server:"http://127.0.0.1:8765",token:""});
  assert.equal((await PageNestConnection.load({
    storage:pairingDisabled,
    request:async()=>({ok:false,status:404}),
  })).token,"");
  assert.equal(PageNestConnection.diagnostic(),"pairing-disabled");

  PageNestConnection.invalidate();

  const running=storage({server:"http://127.0.0.1:8765",token:"running"});
  const online=await PageNestConnection.connect({
    storage:running,
    delays:[0,300,700,1500],
    sleep:async()=>assert.fail("an already running service must not retry"),
    request:async url=>{
      assert.equal(url,"http://127.0.0.1:8765/api/meta");
      return {ok:true,json:async()=>({service_version:"1.8.0"})};
    },
  });
  assert.equal(online.connection.server,"http://127.0.0.1:8765");
  assert.equal(online.meta.service_version,"1.8.0");

  PageNestConnection.invalidate();
  const starting=storage({server:"http://127.0.0.1:8765",token:"starting"});
  const waited=[];
  let metaRequests=0;
  const recoveredAfterStart=await PageNestConnection.connect({
    storage:starting,
    delays:[0,300,700,1500],
    sleep:async delay=>waited.push(delay),
    request:async url=>{
      if(url==="http://127.0.0.1:8765/api/meta"){
        metaRequests++;
        if(metaRequests===1) throw new TypeError("service is starting");
        return {ok:true,json:async()=>({service_version:"1.8.0"})};
      }
      if(url.endsWith("/api/meta")) return {ok:false};
      if(url.endsWith("/api/pair")) return {ok:true,json:async()=>({token:"starting"})};
      return {ok:false};
    },
  });
  assert.equal(recoveredAfterStart.connection.server,"http://127.0.0.1:8765");
  assert.deepEqual(waited,[300]);

  PageNestConnection.invalidate();
  const fallback=storage({server:"http://127.0.0.1:8765",token:"stale"});
  const recoveredFallback=await PageNestConnection.connect({
    storage:fallback,
    delays:[0,300],
    sleep:async()=>{},
    request:async(url,options)=>{
      if(url==="http://127.0.0.1:18765/api/pair") return {ok:true,json:async()=>({token:"fallback"})};
      if(
        url==="http://127.0.0.1:18765/api/meta"
        && options?.headers?.Authorization==="Bearer fallback"
      ) return {ok:true,json:async()=>({service_version:"1.8.0"})};
      return {ok:false};
    },
  });
  assert.deepEqual(recoveredFallback.connection,{server:"http://127.0.0.1:18765",token:"fallback"});

  const movedService=storage({server:"http://127.0.0.1:18765",token:"still-valid"});
  const movedRequests=[];
  const recoveredMovedService=await PageNestConnection.connect({
    storage:movedService,
    delays:[0],
    request:async(url,options)=>{
      movedRequests.push({url,authorization:options?.headers?.Authorization});
      if(url==="http://127.0.0.1:8765/api/meta"){
        return {ok:true,json:async()=>({service_version:"1.8.0"})};
      }
      return {ok:false};
    },
  });
  assert.deepEqual(recoveredMovedService.connection,{server:"http://127.0.0.1:8765",token:"still-valid"});
  assert.deepEqual(movedService.value(),{server:"http://127.0.0.1:8765",token:"still-valid"});
  assert.ok(movedRequests.some(item=>
    item.url==="http://127.0.0.1:8765/api/meta"&&item.authorization==="Bearer still-valid"
  ));

  PageNestConnection.invalidate();
  const legacyRequests=[];
  const legacyService=await PageNestConnection.connect({
    storage:storage({server:"http://127.0.0.1:18765",token:"legacy"}),
    delays:[0,300],
    sleep:async()=>assert.fail("an authenticated legacy service must not retry"),
    request:async(url,options)=>{
      legacyRequests.push({url,authorization:options?.headers?.Authorization});
      if(url==="http://127.0.0.1:18765/api/meta") return {ok:false,status:404};
      if(url==="http://127.0.0.1:18765/api/health") return {ok:true,status:200};
      return {ok:false,status:503};
    },
  });
  assert.equal(legacyService.incompatible,true);
  assert.deepEqual(legacyService.connection,{server:"http://127.0.0.1:18765",token:"legacy"});
  assert.deepEqual(legacyRequests.map(item=>item.url),[
    "http://127.0.0.1:18765/api/meta",
    "http://127.0.0.1:18765/api/health",
  ]);
  assert.ok(legacyRequests.every(item=>item.authorization==="Bearer legacy"));
  assert.ok(!legacyRequests.some(item=>item.url.endsWith("/api/collect")));

  PageNestConnection.invalidate();
  const offline=await PageNestConnection.connect({
    storage:storage({server:"http://127.0.0.1:8765",token:"offline"}),
    delays:[0,300],
    sleep:async()=>{},
    request:async()=>{throw new TypeError("offline")},
  });
  assert.equal(offline,null);

  const popupHtml=fs.readFileSync(path.resolve(__dirname,"../extension/popup.html"),"utf8");
  const popupJs=fs.readFileSync(path.resolve(__dirname,"../extension/popup.js"),"utf8");
  assert.match(popupHtml,/id="serviceStatus"/);
  assert.match(popupHtml,/id="reconnectService"/);
  assert.match(popupHtml,/id="folderStatus"/);
  assert.match(popupHtml,/id="vaultName"/);
  assert.match(popupHtml,/id="changeVault"[^>]*>更换仓库<\/button>/);
  assert.match(popupHtml,/id="refreshFolders"[^>]*aria-label="刷新当前 Vault"/);
  assert.match(popupHtml,/id="view-save"[^>]*data-view="save"/);
  assert.match(popupHtml,/id="view-identify"[^>]*data-view="identify"/);
  assert.match(popupHtml,/id="view-settings"[^>]*data-view="settings"/);
  assert.equal((popupHtml.match(/class="tab-button/g)||[]).length,3);
  assert.match(popupHtml,/class="tab-slider"/);
  assert.match(popupHtml,/id="tabBar"[^>]*data-active="save"/);
  assert.equal((popupHtml.match(/class="mode-guide"/g)||[]).length,1);
  assert.match(popupHtml,/网页 \+ AI 文字总结/);
  assert.match(popupHtml,/网页 \+ AI 图文总结/);
  assert.ok(popupHtml.indexOf("保存位置")<popupHtml.indexOf('id="serviceStatus"'));
  assert.match(popupJs,/function showView\(name\)/);
  assert.match(popupJs,/\$\("tabBar"\)\.dataset\.active=name/);
  assert.ok(!popupJs.includes("本地收藏服务未启动，请从开始菜单启动 PageNest 后重试"));
  assert.ok(!popupJs.includes("[object Object]"));
  assert.match(popupJs,/Service 版本过旧/);
  assert.match(popupJs,/%LOCALAPPDATA%\\\\Programs\\\\PageNest\\\\Extension/);
  assert.match(popupJs,/function selectVaultWithServiceCapabilities/);
  assert.match(popupJs,/request\("\/api\/vault\/select",\{\}\)/);
  assert.match(popupJs,/if\(data\.cancelled\)/);
  assert.match(popupJs,/textContent="重新选择"/);
  assert.ok(!popupJs.includes('} else {\n    showServiceStatus("disconnected");'));

  assert.deepEqual(PageNestConnection.DEFAULT_SERVERS,[
    "http://127.0.0.1:8765",
    "http://127.0.0.1:18765",
    "http://127.0.0.1:28765",
  ]);

  console.log("local extension pairing tests passed");
})().catch(error=>{console.error(error);process.exitCode=1});
