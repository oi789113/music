/** A clipped, inert view of the real page, refracted with a shaped optical map.
 * CSS filter works on the mirrored scenery across engines; it does not depend
 * on the Chromium-only SVG backdrop-filter path. No backdrop blur is involved.
 */
(()=>{
 'use strict';
 const dock=document.getElementById('player');
 const lens=dock?.querySelector('.player-lens');
 const page=document.querySelector('.app-shell');
 const immersive=document.getElementById('immersiveView');
 const filter=document.getElementById('player-refraction');
 if(!dock||!lens||!page||!filter)return;
 const padding=36;
 const scene=document.createElement('div');scene.className='glass-scene';
 scene.setAttribute('aria-hidden','true');scene.inert=true;
 const ambient=document.createElement('canvas');ambient.className='glass-scene-ambient';
 const world=document.createElement('div');world.className='glass-scene-world';
 scene.append(ambient,world);lens.append(scene);
 const ambientContext=ambient.getContext('2d',{alpha:false});
 const mapCanvas=document.createElement('canvas');
 const mapContext=mapCanvas.getContext('2d');
 if(!ambientContext||!mapContext)return;
 let frame=0,needsClone=true,geometryKey='',bounds=null,pairs=[],scrollPairs=[],destroyed=false;
 const readBounds=()=>{const r=lens.getBoundingClientRect();return {left:r.left,top:r.top,width:Math.round(r.width),height:Math.round(r.height)};};
 function rebuildMap(){
  const radius=parseFloat(getComputedStyle(lens).borderTopLeftRadius)||28;
  const key=[bounds.width,bounds.height,radius].join(':');if(key===geometryKey)return;
  const width=Math.max(1,bounds.width),height=Math.max(1,bounds.height);
  const map=createGlassDisplacementMap({width,height,radius,edgeBand:Math.min(19,height*.25),displacement:width<700?19:26,ior:1.5,zoom:1});
  mapCanvas.width=width+padding*2;mapCanvas.height=height+padding*2;
  mapContext.fillStyle='rgb(128,128,128)';mapContext.fillRect(0,0,mapCanvas.width,mapCanvas.height);
  mapContext.putImageData(new ImageData(map.pixels,width,height),padding,padding);
  const mapImage=document.getElementById('glass-map');
  mapImage.setAttribute('href',mapCanvas.toDataURL('image/png'));
  mapImage.setAttribute('width',mapCanvas.width);mapImage.setAttribute('height',mapCanvas.height);
  filter.setAttribute('width',mapCanvas.width);filter.setAttribute('height',mapCanvas.height);
  for(const node of filter.querySelectorAll('feFuncR,feFuncG')){node.setAttribute('slope',map.channelSlope);node.setAttribute('intercept',map.channelIntercept);}
  for(const [id,factor]of [['glass-red',1.035],['glass-green',1],['glass-blue',.965]])document.getElementById(id).setAttribute('scale',map.scale*factor);
  scene.style.width=mapCanvas.width+'px';scene.style.height=mapCanvas.height+'px';
  scene.style.left=-padding+'px';scene.style.top=-padding+'px';
  ambient.width=mapCanvas.width;ambient.height=mapCanvas.height;
  ambientContext.fillStyle='#100c19';ambientContext.fillRect(0,0,ambient.width,ambient.height);
  geometryKey=key;
 }
 function mirror(source){
  const copy=source.cloneNode(true);
  const originals=[source,...source.querySelectorAll('*')];
  const copies=[copy,...copy.querySelectorAll('*')];
  for(let i=0;i<originals.length;i++){
   const from=originals[i],to=copies[i];
   if(from.id){to.dataset.lensId=from.id;to.removeAttribute('id');}
   to.removeAttribute('autofocus');to.removeAttribute('name');
   if(to.hasAttribute('tabindex'))to.setAttribute('tabindex','-1');
   if(from.id&&getComputedStyle(from).display==='none')to.style.setProperty('display','none','important');
   if(from.scrollWidth>from.clientWidth+1||from.scrollHeight>from.clientHeight+1)scrollPairs.push({from,to});
   if(from.tagName==='IMG'){to.loading='eager';to.removeAttribute('srcset');}
  }
  copy.classList.add('glass-scene-copy');
  copy.style.setProperty('position','absolute','important');copy.style.setProperty('margin','0','important');
  copy.setAttribute('aria-hidden','true');copy.inert=true;
  world.append(copy);pairs.push({from:source,to:copy});
 }
 function syncScene(){
  world.replaceChildren();pairs=[];scrollPairs=[];
  mirror(page);if(immersive&&!immersive.hidden)mirror(immersive);
  needsClone=false;
 }
 function placeScene(){
  world.style.width=innerWidth+'px';world.style.height=innerHeight+'px';
  world.style.transform='translate('+(padding-bounds.left)+'px,'+(padding-bounds.top)+'px)';
  for(const {from,to}of pairs){const r=from.getBoundingClientRect();to.style.left=r.left+'px';to.style.top=r.top+'px';to.style.width=r.width+'px';}
  for(const {from,to}of scrollPairs){to.scrollLeft=from.scrollLeft;to.scrollTop=from.scrollTop;}
 }
 function update(){
  frame=0;if(destroyed||document.hidden)return;
  try{bounds=readBounds();if(!bounds.width||!bounds.height)return;rebuildMap();if(needsClone)syncScene();placeScene();dock.classList.add('lens-ready');window.dispatchEvent(new Event('sonar:lens-ready'));}
  catch{dock.classList.remove('lens-ready');}
 }
 function schedule(rebuild=false){needsClone=needsClone||rebuild;if(!frame&&!document.hidden)frame=requestAnimationFrame(update);}
 // Copy the procedural scene immediately after it draws, before WebGL discards
 // its drawing buffer. Only the dock-sized crop is copied, not a full screenshot.
 window.SonarLens={capture(source){
  if(!bounds||destroyed||!source.width||!source.height)return;
  const sx=source.width/innerWidth,sy=source.height/innerHeight;
  const x=bounds.left-padding,y=bounds.top-padding;
  ambientContext.fillStyle='#100c19';ambientContext.fillRect(0,0,ambient.width,ambient.height);
  ambientContext.drawImage(source,x*sx,y*sy,ambient.width*sx,ambient.height*sy,0,0,ambient.width,ambient.height);
 }};
 for(const event of ['sonar:render','sonar:track'])window.addEventListener(event,()=>schedule(true));
 document.addEventListener('scroll',event=>{if(!scene.contains(event.target))schedule();},{capture:true,passive:true});
 window.addEventListener('resize',()=>schedule(true),{passive:true});
 document.fonts?.ready.then(()=>schedule(true));
 // Visibility and responsive layout changes update both geometry and backdrop.
 const resize=typeof ResizeObserver==='function'?new ResizeObserver(()=>schedule(true)):null;
 resize?.observe(dock);resize?.observe(page);
 const pageObserver=typeof MutationObserver==='function'?new MutationObserver(()=>schedule(true)):null;
 pageObserver?.observe(page,{attributes:true,subtree:true,attributeFilter:['class','hidden']});
 const immersiveObserver=typeof MutationObserver==='function'?new MutationObserver(()=>schedule(true)):null;
 if(immersive)immersiveObserver?.observe(immersive,{attributes:true,attributeFilter:['hidden']});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule(true);});
 window.addEventListener('pagehide',()=>{if(frame)cancelAnimationFrame(frame);frame=0;destroyed=true;});
 window.addEventListener('pageshow',()=>{destroyed=false;schedule(true);});
 schedule(true);
})();
