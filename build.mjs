import {readFile,mkdir,writeFile,copyFile} from 'node:fs/promises';
const read=p=>readFile(new URL(p,import.meta.url),'utf8');
const [template,css,app,recommendations,data,motion,glassOptics,glassRenderer]=await Promise.all(['index.html','style.css','app.js','recommendations.js','music-data.js','motion.js','glass-optics.js','glass-renderer.js'].map(read));
const recommendationCode=recommendations.replace(/export /g,'');
const dataCode=data.replace(/export /g,'');
let html=template.replace('/*STYLE*/',()=>css).replace('/*SCRIPT*/',()=>recommendationCode+'\n'+app+'\n'+motion+'\n'+glassOptics.replace(/export /g,'')+'\n'+glassRenderer);
const manifest=JSON.parse(await read('.openai/hosting.json'));
if(!manifest.project_id)throw new Error('Missing Site identity');
const worker=dataCode+'\nconst PAGE='+JSON.stringify(html)+';\n'+`
export default {
 async fetch(request,env,ctx){
  const url=new URL(request.url);
  if(request.method!=='GET'&&request.method!=='HEAD')return new Response('Method not allowed',{status:405,headers:{Allow:'GET, HEAD'}});
  if(url.pathname==='/api/charts'){
   const result=await getCharts(env,ctx);
   return Response.json(result,{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  }
  if(url.pathname==='/health')return Response.json({ok:true});
  if(url.pathname!=='/'&&url.pathname!=='/index.html')return new Response('Not found',{status:404});
  const bootstrap='window.SONAR_DATA='+JSON.stringify(initialData).replace(/</g,'\\u003c')+';';
  return new Response(request.method==='HEAD'?null:PAGE.replace('/*BOOTSTRAP*/',()=>bootstrap),{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Permissions-Policy':'camera=(), microphone=(), geolocation=()'}});
 }
};
`;
await mkdir(new URL('dist/server',import.meta.url),{recursive:true});
await mkdir(new URL('dist/.openai',import.meta.url),{recursive:true});
await writeFile(new URL('dist/server/index.js',import.meta.url),worker);
await copyFile(new URL('.openai/hosting.json',import.meta.url),new URL('dist/.openai/hosting.json',import.meta.url));
console.log('Built self-contained Worker: '+Buffer.byteLength(worker)+' bytes');
