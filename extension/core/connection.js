(function(scope){
  const DEFAULT_SERVERS=Object.freeze([
    "http://127.0.0.1:8765",
    "http://127.0.0.1:18765",
    "http://127.0.0.1:28765",
  ]);
  let resolvedConnection="";

  function connectionKey(connection){
    return `${connection.server}\n${connection.token}`;
  }

  function installedConnection(installed){
    const token=String(installed?.token||"").trim();
    if(!token) return null;
    return {
      server:String(installed.server||DEFAULT_SERVERS[0]).replace(/\/$/,""),
      token,
    };
  }

  async function pair(request,servers){
    for(const server of servers){
      try{
        const response=await request(server+"/api/pair",{
          method:"POST",
          headers:{"Content-Type":"application/json"},
          body:"{}",
        });
        if(!response.ok) continue;
        const paired=await response.json();
        if(paired.token) return {server,token:paired.token};
      }catch{
        // Try the next known local port.
      }
    }
    return null;
  }

  async function requestWithin(request,url,options,timeoutMs){
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),timeoutMs);
    try{
      return await request(url,{...options,signal:controller.signal});
    }finally{
      clearTimeout(timeout);
    }
  }

  async function load({storage,request,installed,force=false,preferCurrent=false}={}){
    storage=storage||chrome.storage.local;
    request=request||fetch;
    installed=installed||scope.PAGENEST_CONNECTION||{};
    const configured=installedConnection(installed);
    const current=await storage.get({
      server:configured?.server||DEFAULT_SERVERS[0],
      token:configured?.token||"",
    });
    if(configured&&connectionKey(current)!==connectionKey(configured)){
      await storage.set(configured);
      resolvedConnection=connectionKey(configured);
      return configured;
    }
    const currentKey=connectionKey(current);
    if(preferCurrent&&current.token){
      resolvedConnection=currentKey;
      return current;
    }
    if(!force&&current.token&&resolvedConnection===currentKey) return current;
    const servers=[current.server.replace(/\/$/,""),...DEFAULT_SERVERS]
      .filter((server,index,list)=>list.indexOf(server)===index);
    const connection=await pair(request,servers);
    if(!connection){
      if(current.token) resolvedConnection=currentKey;
      return current;
    }
    await storage.set(connection);
    resolvedConnection=connectionKey(connection);
    return connection;
  }

  async function connect({storage,request,installed,delays=[0,300,700,1500],sleep,requestTimeout=400}={}){
    storage=storage||chrome.storage.local;
    request=request||fetch;
    sleep=sleep||((delay)=>new Promise(resolve=>setTimeout(resolve,delay)));
    const boundedRequest=(url,options)=>requestWithin(request,url,options,requestTimeout);
    for(let attempt=0;attempt<delays.length;attempt++){
      if(delays[attempt]) await sleep(delays[attempt]);
      try{
        const connection=await load({
          storage,
          request:boundedRequest,
          installed,
          force:attempt>0,
          preferCurrent:attempt===0,
        });
        if(!connection.token) continue;
        const servers=[connection.server.replace(/\/$/,""),...DEFAULT_SERVERS]
          .filter((server,index,list)=>list.indexOf(server)===index);
        for(const server of servers){
          try{
            const response=await boundedRequest(server+"/api/meta",{
              method:"GET",
              headers:{Authorization:`Bearer ${connection.token}`},
            });
            const resolved={server,token:connection.token};
            if(response.status===404){
              const health=await boundedRequest(server+"/api/health",{
                method:"GET",
                headers:{Authorization:`Bearer ${connection.token}`},
              });
              if(health.ok){
                if(connectionKey(resolved)!==connectionKey(connection)) await storage.set(resolved);
                resolvedConnection=connectionKey(resolved);
                return {connection:resolved,meta:null,incompatible:true};
              }
            }
            if(!response.ok) continue;
            if(connectionKey(resolved)!==connectionKey(connection)) await storage.set(resolved);
            resolvedConnection=connectionKey(resolved);
            return {connection:resolved,meta:await response.json()};
          }catch{
            // The same valid token may belong to a service on another known port.
          }
        }
      }catch{
        // A short bounded retry handles service startup and known port fallback.
      }
    }
    return null;
  }

  function invalidate(){
    resolvedConnection="";
  }

  scope.PageNestConnection=Object.freeze({load,connect,invalidate,DEFAULT_SERVERS});
})(globalThis);
