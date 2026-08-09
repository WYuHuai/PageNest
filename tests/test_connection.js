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
    request:async()=>({ok:false}),
  })).token,"");

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
      if(url.endsWith("/api/meta")){
        metaRequests++;
        if(metaRequests===1) throw new TypeError("service is starting");
        return {ok:true,json:async()=>({service_version:"1.8.0"})};
      }
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
    request:async url=>{
      if(url==="http://127.0.0.1:18765/api/pair") return {ok:true,json:async()=>({token:"fallback"})};
      if(url==="http://127.0.0.1:18765/api/meta") return {ok:true,json:async()=>({service_version:"1.8.0"})};
      return {ok:false};
    },
  });
  assert.deepEqual(recoveredFallback.connection,{server:"http://127.0.0.1:18765",token:"fallback"});

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
  assert.ok(popupHtml.indexOf('id="serviceStatus"')<popupHtml.indexOf("保存位置"));
  assert.ok(!popupJs.includes("本地收藏服务未启动，请从开始菜单启动 PageNest 后重试"));
  assert.ok(!popupJs.includes("[object Object]"));

  assert.deepEqual(PageNestConnection.DEFAULT_SERVERS,[
    "http://127.0.0.1:8765",
    "http://127.0.0.1:18765",
    "http://127.0.0.1:28765",
  ]);

  console.log("local extension pairing tests passed");
})().catch(error=>{console.error(error);process.exitCode=1});
