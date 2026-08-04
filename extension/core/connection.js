(function(scope){
  const DEFAULT_SERVERS=Object.freeze([
    "http://127.0.0.1:8765",
    "http://127.0.0.1:18765",
    "http://127.0.0.1:28765",
  ]);
  let resolvedConnection="";

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

  async function load({storage,request,installed}={}){
    storage=storage||chrome.storage.local;
    request=request||fetch;
    installed=installed||scope.PAGENEST_CONNECTION||{};
    const current=await storage.get({
      server:installed.server||DEFAULT_SERVERS[0],
      token:installed.token||"",
    });
    const currentKey=`${current.server}\n${current.token}`;
    if(current.token&&resolvedConnection===currentKey) return current;
    const servers=[current.server.replace(/\/$/,""),...DEFAULT_SERVERS]
      .filter((server,index,list)=>list.indexOf(server)===index);
    const connection=await pair(request,servers);
    if(!connection){
      if(current.token) resolvedConnection=currentKey;
      return current;
    }
    await storage.set(connection);
    resolvedConnection=`${connection.server}\n${connection.token}`;
    return connection;
  }

  scope.PageNestConnection=Object.freeze({load,DEFAULT_SERVERS});
})(globalThis);
