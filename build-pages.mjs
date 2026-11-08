import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {getCharts,initialData} from './music-data.js';
const read=p=>readFile(new URL(p,import.meta.url),'utf8');
const [template,css,app,recommendations,motion,glassOptics,glassRenderer,musicData] = await Promise.all(['index.html','style.css','app.js','recommendations.js','motion.js','glass-optics.js','glass-renderer.js','music-data.js'].map(read));
let charts=await getCharts();
let previous;
try { previous=JSON.parse(await read('docs/api/charts.json')); } catch { previous=initialData; }
// A failed provider keeps its latest dated snapshot; a temporary outage must not
// replace a more recent snapshot with the old bundled fallback.
for (let i=0;i<charts.sources.length;i++) {
 const source=charts.sources[i];
 if(source.ok) continue;
 const saved=previous.sources.find(s=>s.id===source.id);
 const oldTracks=previous.tracks.filter(t=>t.sourceId===source.id);
 if(saved&&oldTracks.length){
  charts.sources[i]={...saved,ok:false,type:'snapshot',error:'暂时无法连接，显示注明日期的最近快照'};
  const current=charts.tracks.filter(t=>t.sourceId!==source.id);
  const groups={itunes:[],netease:[]};
  for(const track of [...current,...oldTracks])if(groups[track.sourceId])groups[track.sourceId].push(track);
  charts.tracks=[];for(let n=0;n<Math.max(groups.itunes.length,groups.netease.length);n++)for(const id of ['itunes','netease'])if(groups[id][n])charts.tracks.push(groups[id][n]);
 }
}
charts.note='榜单由 GitHub Actions 定时更新；iTunes 榜单也会在浏览器中刷新。各平台名次独立。';
const source=musicData.replace(/^export const initialData = .*?;\n/m,'const initialData = window.SONAR_DATA;\n').replace(/export /g,'');
const runtime=`(()=>{\n${source}\nwindow.SONAR_FETCH_CHARTS=async()=>{\n const response=await fetch('./api/charts.json',{cache:'no-cache'});\n if(!response.ok)return response;\n const data=await response.json();\n try{\n  const live=await fetchSource(SOURCE_CONFIG.find(s=>s.id==='itunes'));\n  const netease=data.tracks.filter(t=>t.sourceId==='netease');\n  const combined=[];for(let i=0;i<Math.max(live.tracks.length,netease.length);i++){if(live.tracks[i])combined.push(live.tracks[i]);if(netease[i])combined.push(netease[i]);}\n  data.tracks=combined;data.sources=data.sources.map(s=>s.id==='itunes'?live.source:s);\n  data.partial=data.sources.some(s=>!s.ok);data.snapshot=data.sources.every(s=>!s.ok);data.updatedAt=new Date().toISOString();\n }catch{}\n return {ok:true,json:async()=>data};\n};\n})();`;
const pageApp=app.replace("fetch('/api/charts',{cache:'no-store'})",'window.SONAR_FETCH_CHARTS()')
 .replace('每天首次访问自动获取当日榜单，按 UTC 日期缓存。来源异常会保留有日期的快照，并在稍后重试。刷新按钮检查当日缓存，不会伪造新排名。','榜单由 GitHub Actions 每日更新；iTunes 美国榜还会在打开页面时尝试实时获取。来源异常会保留有日期的最近快照。')
 .replace('已检查今日热榜，每日自动获取新榜单。','已检查榜单，网易云每日更新，iTunes 可实时同步。');
const bootstrap='window.SONAR_DATA='+JSON.stringify(charts).replace(/</g,'\\u003c')+';';
const html=template.replace('/*STYLE*/',()=>css).replace('/*BOOTSTRAP*/',()=>bootstrap).replace('/*SCRIPT*/',()=>recommendations.replace(/export /g,'')+'\n'+runtime+'\n'+pageApp+'\n'+motion+'\n'+glassOptics.replace(/export /g,'')+'\n'+glassRenderer);
await mkdir(new URL('docs/api/',import.meta.url),{recursive:true});
await writeFile(new URL('docs/index.html',import.meta.url),html);
await writeFile(new URL('docs/api/charts.json',import.meta.url),JSON.stringify(charts));
await writeFile(new URL('docs/.nojekyll',import.meta.url),'');
console.log(`Built GitHub Pages: ${charts.tracks.length} tracks; ${charts.sources.map(s=>s.name+': '+s.type).join(', ')}`);
