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
    request:async()=>{requests++;},
  })).token,"existing");
  assert.equal(requests,0);

  const empty=storage({server:"http://127.0.0.1:8765",token:""});
  let pairRequest;
  const paired=await PageNestConnection.load({
    storage:empty,
    request:async(url,options)=>{
      pairRequest={url,options};
      return {ok:true,json:async()=>({token:"paired"})};
    },
  });
  assert.equal(paired.token,"paired");
  assert.equal(empty.value().token,"paired");
  assert.equal(pairRequest.url,"http://127.0.0.1:8765/api/pair");
  assert.equal(pairRequest.options.method,"POST");
  assert.equal(pairRequest.options.headers["Content-Type"],"application/json");
  assert.equal(pairRequest.options.body,"{}");

  const unavailable=storage({server:"http://127.0.0.1:8765",token:""});
  assert.equal((await PageNestConnection.load({
    storage:unavailable,
    request:async()=>({ok:false}),
  })).token,"");

  console.log("local extension pairing tests passed");
})().catch(error=>{console.error(error);process.exitCode=1});
