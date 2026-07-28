(function(scope){
  const DEFAULT_SERVER="http://127.0.0.1:8765";

  async function load({storage,request,installed}={}){
    storage=storage||chrome.storage.local;
    request=request||fetch;
    installed=installed||scope.PAGENEST_CONNECTION||{};
    const current=await storage.get({
      server:installed.server||DEFAULT_SERVER,
      token:installed.token||"",
    });
    if(current.token) return current;
    try{
      const response=await request(current.server.replace(/\/$/,"")+"/api/pair");
      if(!response.ok) return current;
      const paired=await response.json();
      if(!paired.token) return current;
      const connection={server:current.server,token:paired.token};
      await storage.set(connection);
      return connection;
    }catch{
      return current;
    }
  }

  scope.PageNestConnection=Object.freeze({load});
})(globalThis);
