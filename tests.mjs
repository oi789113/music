import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {recommend} from './recommendations.js';
import {initialData,getCharts} from './music-data.js';

const options={mood:'relax',seed:'2026-11-08',limit:6};
const daily=recommend(initialData.tracks,options);
assert.equal(daily.length,6);
assert.deepEqual(daily,recommend(initialData.tracks,options),'daily recommendations must be stable for identical preferences');
assert.equal(new Set(daily.map(t=>t.artist)).size,daily.length,'recommendations should not repeat an artist');
assert.ok(daily.every(t=>initialData.tracks.includes(t)),'recommendations must come from actual chart tracks');
assert.notDeepEqual(daily.map(t=>t.id),recommend(initialData.tracks,{...options,mood:'energy'}).map(t=>t.id),'a different mood should change the selection');
const fixtures=[
 {id:'a',title:'Quiet sound',artist:'Artist A',rank:1,genre:'Folk'},
 {id:'b',title:'Quiet sound',artist:'Artist B',rank:1,genre:'Hip-Hop/Rap'},
 {id:'c',title:'Quiet sound',artist:'Artist C',rank:1,genre:'Classical'},
 {id:'d',title:'Quiet sound',artist:'Artist D',rank:1,genre:'Pop'}
];
for(const [mood,id] of Object.entries({relax:'a',energy:'b',focus:'c',night:'d'}))assert.equal(recommend(fixtures,{mood,seed:'test',limit:1})[0].id,id,'mood should affect genre matching');
assert.equal(recommend(fixtures,{mood:'focus',seed:'test',favorites:[fixtures[1]],limit:1})[0].id,'b','favorite artists should affect recommendation order');
assert.equal(recommend(fixtures.slice(0,2),{mood:'focus',seed:'test',tastes:['说唱'],limit:1})[0].id,'b','saved music tastes should affect recommendation order');
assert.deepEqual(recommend([],options),[]);
assert.deepEqual(recommend(initialData.tracks,{limit:0}),[],'a zero-size recommendation request should be empty');

const worker=(await import('./dist/server/index.js')).default;
const page=await worker.fetch(new Request('https://sonar.test/'),{},{});
assert.equal(page.status,200);
assert.match(page.headers.get('Content-Type'),/text\/html/);
const html=await page.text();
assert.ok(!/\/\*(?:STYLE|SCRIPT|BOOTSTRAP)\*\//.test(html),'the deployable page must contain no unfinished template markers');
const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match=>match[1]);
assert.equal(scripts.length,2,'bootstrap data and application scripts should both be present');
for(const script of scripts)new vm.Script(script);
const sandbox={window:{}};vm.runInNewContext(scripts[0],sandbox);
assert.equal(sandbox.window.SONAR_DATA.tracks.length,40);
assert.equal(sandbox.window.SONAR_DATA.snapshot,true,'the instant initial content must honestly identify the saved snapshot');
assert.equal((await worker.fetch(new Request('https://sonar.test/',{method:'HEAD'}),{},{})).body,null);
assert.equal((await worker.fetch(new Request('https://sonar.test/missing'),{},{})).status,404);
assert.equal((await worker.fetch(new Request('https://sonar.test/',{method:'POST'}),{},{})).status,405);

const realFetch=globalThis.fetch;
const originalCaches=globalThis.caches;
let upstreamCalls=0;
let failNetEase=false;
const feedDate='2026-11-08T08:00:00Z';
globalThis.fetch=async input=>{
 upstreamCalls++;
 const url=String(input);
 if(url.includes('music.163.com')){
  if(failNetEase)return new Response('Unavailable',{status:503});
  return Response.json({result:{updateTime:Date.parse(feedDate),tracks:[{id:123,name:'真实热歌',artists:[{name:'歌手'}],album:{name:'专辑',picUrl:'http://images.example/cover.jpg'},duration:200000}]}});
 }
 if(url.includes('itunes.apple.com'))return Response.json({feed:{updated:{label:feedDate},entry:[{'im:name':{label:'Test track'},'im:artist':{label:'Test artist'},'im:collection':{'im:name':{label:'Test album'}},'im:image':[{label:'https://images.example/100x100bb.jpg'}],id:{attributes:{'im:id':'321'}},category:{attributes:{label:'Pop'}},link:[{attributes:{rel:'alternate',href:'https://music.apple.com/test'}},{attributes:{rel:'enclosure',href:'https://audio.example/preview.m4a'}}]}]}});
 throw new Error('Unexpected external request '+url);
};
try{
 globalThis.caches=undefined;
 const api=await worker.fetch(new Request('https://sonar.test/api/charts'),{},{});
 assert.equal(api.status,200);
 const result=await api.json();
 assert.equal(result.tracks.length,2);
 assert.equal(result.partial,false);
 assert.equal(result.snapshot,false);
 assert.ok(result.sources.every(s=>s.ok));
 assert.equal(result.tracks[0].sourceId,'itunes');
 assert.equal(result.tracks[1].cover,'https://images.example/cover.jpg');
 assert.equal(result.tracks[0].preview,'https://audio.example/preview.m4a');
 assert.equal(result.tracks[1].preview,null,'do not invent preview audio for unsupported tracks');
 assert.ok(result.tracks.every(t=>t.rank===1),'each platform keeps its own ranking');
 failNetEase=true;
 const partial=await getCharts();
 assert.equal(partial.partial,true);
 assert.equal(partial.sources.find(s=>s.id==='netease').ok,false);
 assert.equal(partial.sources.find(s=>s.id==='netease').type,'snapshot');
 assert.equal(partial.sources.find(s=>s.id==='netease').updatedAt,initialData.sources.find(s=>s.id==='netease').updatedAt,'fallback must retain the original chart timestamp');
 assert.equal(partial.sources.find(s=>s.id==='itunes').ok,true,'one unavailable platform must not hide the working platform');
 const cacheStore=new Map();
 globalThis.caches={default:{async match(request){const value=cacheStore.get(request.url);return value?new Response(value):undefined;},async put(request,response){cacheStore.set(request.url,await response.text());}}};
 failNetEase=false;
 await getCharts();const callsAfterFirst=upstreamCalls;
 await getCharts();assert.equal(upstreamCalls,callsAfterFirst,'repeated visits on the same UTC date should reuse daily cache');
 assert.ok([...cacheStore.keys()][0].endsWith(new Date().toISOString().slice(0,10)),'cache keys must roll over each UTC day');
}finally{globalThis.fetch=realFetch;globalThis.caches=originalCaches;}
console.log('Passed: recommendation behavior, deployed HTML/script integrity, Worker routes, source parsing, dated fallback, and daily cache.');

// Exercise the shipped UI script against its actual HTML structure. This is a
// lightweight DOM fixture, not browser visual verification.
function createTestDOM(markup){
 const listeners=new Map(),storage=new Map(),timers=[];
 let document;
 class Classes{
  constructor(node){this.node=node;this.items=new Set();}
  set(value){this.items=new Set(value.split(/\s+/).filter(Boolean));}
  add(...items){items.forEach(v=>this.items.add(v));}
  remove(...items){items.forEach(v=>this.items.delete(v));}
  contains(item){return this.items.has(item);}
  toggle(item,force){const add=force===undefined?!this.contains(item):force;add?this.add(item):this.remove(item);return add;}
 }
 const matches=(n,selector)=>{
  if(selector.startsWith('#'))return n.id===selector.slice(1);
  if(selector.startsWith('.'))return n.classList.contains(selector.slice(1));
  const attr=selector.match(/^\[([^=\]]+)(?:="?([^"\]]+)"?)?\]$/);
  if(attr)return n.attributes.has(attr[1])&&(attr[2]===undefined||n.attributes.get(attr[1])===attr[2]);
  if(selector==='a[href]')return n.tagName==='a'&&n.attributes.has('href');
  return n.tagName===selector;
 };
 class Node{
  constructor(tag,attrs={}){this.tagName=tag;this.attributes=new Map();this.children=[];this.parentNode=null;this.classList=new Classes(this);this.style={setProperty(k,v){this[k]=v;},removeProperty(k){delete this[k];}};this.dataset={};this.events=new Map();this.hidden=false;this.disabled=false;this.open=false;this.inert=false;this.scrollLeft=0;this.clientWidth=900;this._text='';this._html='';this.value='';for(const [k,v]of Object.entries(attrs))this.setAttribute(k,v);}
  setAttribute(k,v){v=String(v);this.attributes.set(k,v);if(k==='id')this.id=v;if(k==='class')this.classList.set(v);if(k==='hidden')this.hidden=true;if(k.startsWith('data-'))this.dataset[k.slice(5).replace(/-([a-z])/g,(_,x)=>x.toUpperCase())]=v;}
  getAttribute(k){return this.attributes.get(k)??null;}
  removeAttribute(k){this.attributes.delete(k);if(k==='src')this.src='';}
  get innerHTML(){return this._html;}
  set innerHTML(value){this._html=String(value);this.children=[];parse(this._html,this);}
  get textContent(){return this._text||this.children.map(x=>x.textContent).join('');}
  set textContent(value){this._text=String(value);this.children=[];}
  querySelectorAll(selector){const selectors=selector.split(',').map(v=>v.trim()),result=[];const visit=n=>{for(const c of n.children){if(selectors.some(s=>matches(c,s)))result.push(c);visit(c);}};visit(this);return result;}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  closest(selector){for(let n=this;n;n=n.parentNode)if(matches(n,selector))return n;return null;}
  contains(other){for(let n=other;n;n=n.parentNode)if(n===this)return true;return false;}
  addEventListener(type,callback,options){const all=this.events.get(type)||[];all.push({callback,capture:options===true||options?.capture});this.events.set(type,all);}
  dispatchEvent(event){if(!event.target)event.target=this;for(const {callback}of this.events.get(event.type)||[])callback(event);return true;}
  click(){const e={type:'click',target:this,preventDefault(){},stopImmediatePropagation(){this.stopped=true;}};for(const {callback,capture}of this.events.get('click')||[])if(capture)callback(e);if(e.stopped)return;this.onclick?.(e);for(const {callback,capture}of this.events.get('click')||[])if(!capture)callback(e);document.dispatchEvent(e);}
  focus(){document.activeElement=this;}
  scrollIntoView(){this.scrolled=true;}
  scrollBy({left}){this.scrollLeft+=left;}
  getClientRects(){return this.hidden?[]:[{}];}
  getBoundingClientRect(){return {top:0,left:0,right:900,bottom:600,width:900,height:600};}
  animate(){return {cancel(){}};}
  getAnimations(){return [];}
  showModal(){this.open=true;}
  close(){this.open=false;}
 }
 function parse(source,parent){
  const stack=[parent];
  const voids=new Set(['meta','link','img','input','br','use','path','circle']);
  for(const match of source.matchAll(/<\/?[a-zA-Z][^>]*>/g)){
   const raw=match[0];if(raw.startsWith('</')){const tag=raw.slice(2,-1).trim();if(stack.at(-1)?.tagName===tag)stack.pop();continue;}
   const tag=raw.match(/^<([^\s/>]+)/)[1];const attrs={};for(const m of raw.slice(tag.length+1,-1).matchAll(/([\w:-]+)(?:="([^"]*)"|='([^']*)'|=([^\s>]+))?/g))attrs[m[1]]=m[2]??m[3]??m[4]??'';
   const node=new Node(tag,attrs);node.parentNode=stack.at(-1);stack.at(-1).children.push(node);if(!voids.has(tag)&&!raw.endsWith('/>'))stack.push(node);
  }
 }
 document=new Node('document');parse(markup.replace(/<script>[\s\S]*?<\/script>/g,'').replace(/<style>[\s\S]*?<\/style>/g,''),document);
 document.body=document.querySelector('body');document.documentElement=document.querySelector('html');document.activeElement=document.body;document.hidden=false;
 const window={SONAR_DATA:initialData,addEventListener(type,cb){const all=listeners.get(type)||[];all.push(cb);listeners.set(type,all);},dispatchEvent(e){for(const cb of listeners.get(e.type)||[])cb(e);},scrollTo(){}};
 const audio=document.querySelector('#audio');audio.paused=true;audio.duration=30;audio.currentTime=0;audio.src='';audio.play=async()=>{audio.paused=false;audio.dispatchEvent({type:'play'});};audio.pause=()=>{audio.paused=true;audio.dispatchEvent({type:'pause'});};
 const context={document,window,URL,console,Date,Event:class{constructor(type){this.type=type;}},CustomEvent:class{constructor(type,{detail}){this.type=type;this.detail=detail;}},matchMedia:()=>({matches:true,addEventListener(){}}),localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},setTimeout:(callback,delay)=>{timers.push({callback,delay});return timers.length;},clearTimeout(){},setInterval(){},fetch:async()=>Response.json(initialData)};
 return {context,document,window,storage,timers,node:id=>document.querySelector('#'+id),runTimers:delay=>{for(const task of timers.splice(0))if(task.delay===delay)task.callback();}};
}
const dom=createTestDOM(await readFile(new URL('./index.html',import.meta.url),'utf8'));
vm.runInNewContext((await readFile(new URL('./recommendations.js',import.meta.url),'utf8')).replace(/export /g,'')+'\n'+await readFile(new URL('./app.js',import.meta.url),'utf8'),dom.context);
await Promise.resolve();await Promise.resolve();await Promise.resolve();
assert.equal(dom.node('heroTitle').textContent,initialData.tracks[0].title,'initial boot should populate the actual hero DOM');
const firstFeature=dom.node('heroPlay').dataset.id;dom.node('deckNext').click();assert.notEqual(dom.node('heroPlay').dataset.id,firstFeature,'deck navigation should change the featured song');dom.node('deckPrev').click();assert.equal(dom.node('heroPlay').dataset.id,firstFeature);
dom.node('playDaily').click();await Promise.resolve();assert.equal(dom.node('audio').paused,false);assert.equal(dom.node('playerTitle').textContent,initialData.tracks.find(t=>t.preview).title);assert.ok(dom.document.body.classList.contains('playing'));
dom.node('playerLike').click();assert.equal(JSON.parse(dom.storage.get('sonar-favorites')).length,1,'the real player favorite action should persist its selected track');
const favoritesNav=dom.document.querySelectorAll('.nav').find(n=>n.dataset.page==='favorites');favoritesNav.click();assert.equal(dom.document.body.dataset.page,'favorites');assert.match(dom.node('songGrid').innerHTML,/Choosin/);
dom.document.querySelectorAll('.nav').find(n=>n.dataset.page==='discover').click();
dom.document.querySelectorAll('[data-mood]').find(n=>n.dataset.mood==='energy').click();dom.node('generateBtn').click();dom.runTimers(550);assert.equal(dom.node('mixSection').hidden,false);assert.match(dom.node('mixTitle').textContent,/满格能量/);assert.equal(dom.node('mixGrid').querySelectorAll('.song-card').length,6,'the generated recommendation must produce six usable song cards');
dom.node('immersiveBtn').click();assert.equal(dom.node('immersiveView').hidden,false);assert.equal(dom.document.querySelector('.app-shell').inert,true);assert.equal(dom.node('immersiveTitle').textContent,dom.node('playerTitle').textContent);dom.node('closeImmersive').click();assert.equal(dom.node('immersiveView').hidden,true);assert.equal(dom.document.querySelector('.app-shell').inert,false);
dom.node('footerSource').click();assert.equal(dom.node('modal').open,true);assert.match(dom.node('modalContent').innerHTML,/iTunes 美国热歌榜/);dom.node('closeModal').click();assert.equal(dom.node('modal').open,false);
dom.node('songsNext').click();assert.ok(dom.node('songGrid').scrollLeft>0,'the visible carousel arrow should advance the song row');
console.log('Passed: shipped UI boot, feature deck, player, favorite persistence, navigation, mood generation, immersive mode, source modal, and carousel controls.');

// Verify the optical field itself: a lens must bend edge scenery while keeping
// the center unchanged. This detects a neutral/blur-only map or wrong SVG sign.
{
 const {createGlassDisplacementMap,sampleGlassDisplacement}=await import('./glass-optics.js');
 for(const config of [
  {width:1180,height:82,radius:30,edgeBand:19,displacement:26},
  {width:337,height:67,radius:25,edgeBand:16.75,displacement:19}
 ]){
  const {width,height,edgeBand,displacement}=config;
  const lensMap=createGlassDisplacementMap(config);
  const center=(Math.floor(height/2)*width+Math.floor(width/2))*4;
  assert.deepEqual([...lensMap.pixels.slice(center,center+4)],[128,128,128,255],'the central pane must sample the backdrop without displacement');
  assert.equal(lensMap.mask[0],0,'rounded corners must be outside the lens shape');
  assert.deepEqual([...lensMap.pixels.slice(0,4)],[128,128,128,255],'outside pixels must remain opaque neutral to avoid premultiplication artifacts');
  assert.ok(Math.abs(128/255*lensMap.channelSlope+lensMap.channelIntercept-.5)<1e-12,'SVG channel correction must remove 8-bit neutral bias');
  assert.equal(lensMap.scale,displacement*2,'SVG scale must express both positive and negative ray offsets');
  let peak=0,peakDepth=0;
  for(let depth=.1;depth<edgeBand;depth+=.1){
   const left=sampleGlassDisplacement(depth,height/2,config);
   const right=sampleGlassDisplacement(width-depth,height/2,config);
   const top=sampleGlassDisplacement(width/2,depth,config);
   assert.ok(left.dx>=0&&right.dx<=0&&top.dy>=0,'edge rays must sample inward to magnify the scene');
   assert.ok(Math.abs(left.dx+right.dx)<1e-7,'opposite sides must refract symmetrically');
   assert.ok(Math.abs(left.dx-top.dy)<1e-7,'flat vertical and horizontal edges must use the same optical profile');
   assert.ok(Math.hypot(left.dx,left.dy)<=displacement+.001,'ray travel must stay within the encoded map range');
   if(left.dx>peak){peak=left.dx;peakDepth=depth;}
  }
  assert.ok(peak>displacement*.99,'the lens should produce a visibly strong edge bend');
  let previous=peak;
  for(let depth=peakDepth+.1;depth<edgeBand;depth+=.1){const value=sampleGlassDisplacement(depth,height/2,config).dx;assert.ok(value<=previous+1e-6,'the bevel must settle smoothly into the clear center');previous=value;}
  assert.ok(Math.abs(sampleGlassDisplacement(edgeBand-.01,height/2,config).dx)<1e-6,'the inner bevel join must have no hard displacement seam');
  assert.equal(sampleGlassDisplacement(edgeBand+.01,height/2,config).dx,0);
  const corner=sampleGlassDisplacement(config.radius*.4,config.radius*.4,config);
  assert.ok(Math.abs(corner.dx-corner.dy)<1e-7,'rounded corners must have a radial optical normal');
 }
 console.log('Passed: real inward lens refraction, clear center, rounded geometry, SVG neutral correction, smooth bevel, and mobile optics.');
}
