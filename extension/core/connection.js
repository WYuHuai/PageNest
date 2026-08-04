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

  async function load({storage,request,installed,force=false}={}){
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

  function invalidate(){
    resolvedConnection="";
  }

  scope.PageNestConnection=Object.freeze({load,invalidate,DEFAULT_SERVERS});
})(globalThis);
