const http=require('http'),fs=require('fs'),path=require('path');
const root=path.resolve(process.argv[2]),port=+process.argv[3];
const T={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.jpg':'image/jpeg','.json':'application/json'};
http.createServer((req,res)=>{let u=decodeURIComponent(req.url.split('?')[0]);if(u.endsWith('/'))u+='index.html';const p=path.join(root,u);if(!p.startsWith(root)){res.writeHead(403);return res.end()}
fs.readFile(p,(e,d)=>{if(e){console.log("404 "+req.url);res.writeHead(404);return res.end()}res.writeHead(200,{'content-type':T[path.extname(p)]||'application/octet-stream','cache-control':'no-store'});res.end(d)})}).listen(port,'127.0.0.1',()=>console.log('up',port));
