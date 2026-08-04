const assert=require("assert");
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

  assert.deepEqual(PageNestConnection.DEFAULT_SERVERS,[
    "http://127.0.0.1:8765",
    "http://127.0.0.1:18765",
    "http://127.0.0.1:28765",
  ]);

  console.log("local extension pairing tests passed");
})().catch(error=>{console.error(error);process.exitCode=1});
