const projectId = "project-59230b61-4119-4d4d-abeb-ef765a9130d1";
const targets = await (await fetch("http://127.0.0.1:9224/json/list")).json();
const target = targets.find((item) => item.type === "page");
if (!target) throw new Error("CDP page target not found");
const socket = new WebSocket(target.webSocketDebuggerUrl);
const expression = `(async()=>{try{const b=await window.longShortFactory.bootstrap();return {ok:true,runtime:b.runtime}}catch(error){return {ok:false,error:String(error)}}})()`;
await new Promise((resolve, reject) => {
  socket.addEventListener("open", () => {
    socket.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression, awaitPromise: true, returnByValue: true } }));
  });
  socket.addEventListener("message", (event) => {
    const result = JSON.parse(event.data);
    if (result.id !== 1) return;
    console.log(JSON.stringify(result, null, 2));
    socket.close();
    resolve();
  });
  socket.addEventListener("error", reject);
});
