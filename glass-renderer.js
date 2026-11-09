/** Refract only the narrow bevel. The clear pane uses the browser's live backdrop.
 * Small, clipped tiles keep Safari from rasterising a second, full-height page.
 * No frame-buffer copies, full-page mirrors or per-frame DOM reconstruction.
 */
(()=>{
 'use strict';
 const dock=document.getElementById('player'),lens=dock?.querySelector('.player-lens');
 const filter=document.getElementById('player-refraction');
 if(!lens||!filter)return;
 const padding=16,bevel=12;
 const rim=document.createElement('div');rim.className='glass-rim';rim.inert=true;rim.setAttribute('aria-hidden','true');
 const scene=document.createElement('div');scene.className='glass-scene';rim.append(scene);lens.append(rim);
 const mapCanvas=document.createElement('canvas'),context=mapCanvas.getContext('2d');
 if(!context)return;
 const immersive=document.getElementById('immersiveView');
 let frame=0,geometryKey='',candidates=[],tiles=new Map(),dirty=true,stopped=false,coasting=false,settleTimer=0;
 const scrollPositions=new WeakMap();
 const transparency=matchMedia('(prefers-reduced-transparency: reduce), (prefers-contrast: more)');
 function rebuildMap(bounds){
  const width=Math.round(bounds.width),height=Math.round(bounds.height);
  const radius=parseFloat(getComputedStyle(lens).borderTopLeftRadius)||26;
  const key=[width,height,radius].join(':');if(key===geometryKey)return;
  const map=createGlassDisplacementMap({width,height,radius,edgeBand:bevel,displacement:7,ior:1.45});
  mapCanvas.width=width+padding*2;mapCanvas.height=height+padding*2;
  context.fillStyle='rgb(128,128,128)';context.fillRect(0,0,mapCanvas.width,mapCanvas.height);
  context.putImageData(new ImageData(map.pixels,width,height),padding,padding);
  // Feather the inside of the bevel so there is no rectangular clear/soft seam.
  const maskCanvas=document.createElement('canvas');maskCanvas.width=width;maskCanvas.height=height;
  const maskPixels=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
   const depth=-roundedRectDistanceNormal(x+.5,y+.5,width,height,radius).distance;
   const fade=Math.max(0,Math.min(1,(depth-3)/(bevel-3)));
   const alpha=(1-fade*fade*(3-2*fade))*Math.max(0,Math.min(1,depth+.5));
   const i=(y*width+x)*4;maskPixels[i]=maskPixels[i+1]=maskPixels[i+2]=255;maskPixels[i+3]=Math.round(alpha*210);
  }
  maskCanvas.getContext('2d').putImageData(new ImageData(maskPixels,width,height),0,0);
  const maskURL='url('+maskCanvas.toDataURL()+')';rim.style.maskImage=maskURL;rim.style.webkitMaskImage=maskURL;
  const image=document.getElementById('glass-map');image.setAttribute('href',mapCanvas.toDataURL());
  for(const node of [image,filter]){node.setAttribute('width',mapCanvas.width);node.setAttribute('height',mapCanvas.height);}
  document.getElementById('glass-displacement').setAttribute('scale',map.scale);
  scene.style.cssText=`left:${-padding}px;top:${-padding}px;width:${mapCanvas.width}px;height:${mapCanvas.height}px`;
  geometryKey=key;
 }
 function collect(){
  // Independent tiles, never the application, a whole chart or fixed/sticky UI.
  // Each tile is clipped before the SVG filter, bounding the raster surface.
  const selector=immersive&&!immersive.hidden
   ? '.immersive-content>img,.immersive-content>div'
   : '.hero-art,.daily-strip,.section-heading,.chart-toolbar,.song-card,.more-row,.recommend-section,footer';
  const root=immersive&&!immersive.hidden?immersive:document.querySelector('.app-shell');
  candidates=[...root.querySelectorAll(selector)].map(source=>({source,clip:source.closest('.song-grid')}));
  for(const tile of tiles.values())tile.wrapper.remove();tiles.clear();dirty=false;
 }
 function makeTile(source){
  const copy=source.cloneNode(true),wrapper=document.createElement('div');
  wrapper.className='glass-tile';copy.classList.add('glass-tile-copy');
  for(const node of [copy,...copy.querySelectorAll('*')]){
   node.removeAttribute('id');node.removeAttribute('name');node.removeAttribute('autofocus');
   if(node.matches('button,a,input,[tabindex]'))node.setAttribute('tabindex','-1');
   if(node.tagName==='IMG'){node.loading='eager';node.decoding='async';}
  }
  copy.style.setProperty('position','absolute','important');copy.style.setProperty('margin','0','important');
  wrapper.append(copy);scene.append(wrapper);return {wrapper,copy};
 }
 function update(){
  frame=0;if(stopped||document.hidden||transparency.matches||coasting)return;
  const bounds=lens.getBoundingClientRect();if(!bounds.width||!bounds.height)return;
  if(dirty)collect();
  // Batch all layout reads before touching the optical tiles.
  const visible=[];
  const area={left:bounds.left-padding,top:bounds.top-padding,right:bounds.right+padding,bottom:bounds.bottom+padding};
  for(const {source,clip}of candidates){
   const r=source.getBoundingClientRect();
   if(!r.width||!r.height||r.bottom<area.top||r.top>area.bottom||r.right<area.left||r.left>area.right)continue;
   const c=clip?clip.getBoundingClientRect():r;
   const left=Math.max(r.left,c.left,area.left),top=Math.max(r.top,c.top,area.top);
   const right=Math.min(r.right,c.right,area.right),bottom=Math.min(r.bottom,c.bottom,area.bottom);
   if(right>left&&bottom>top)visible.push({source,r,left,top,width:right-left,height:bottom-top});
  }
  rebuildMap(bounds);
  const keep=new Set(visible.map(item=>item.source));
  for(const [source,tile]of tiles)if(!keep.has(source)){tile.wrapper.remove();tiles.delete(source);}
  for(const {source,r,left,top,width,height}of visible){
   let tile=tiles.get(source);if(!tile){tile=makeTile(source);tiles.set(source,tile);}
   tile.wrapper.style.cssText=`width:${width}px;height:${height}px;transform:translate3d(${left-area.left}px,${top-area.top}px,0)`;
   tile.copy.style.width=r.width+'px';tile.copy.style.height=r.height+'px';
   tile.copy.style.left=(r.left-left)+'px';tile.copy.style.top=(r.top-top)+'px';
  }
  dock.classList.add('lens-ready');
  dock.classList.remove('glass-coasting');
 }
 function schedule(refresh=false){dirty=dirty||refresh;if(!frame&&!stopped&&!document.hidden)frame=requestAnimationFrame(update);}
 for(const event of ['sonar:render','sonar:track'])window.addEventListener(event,()=>schedule(true));
 document.addEventListener('scroll',event=>{
  if(rim.contains(event.target))return;
  const target=event.target,now=performance.now();
  const x=target===document?scrollX:target.scrollLeft||0,y=target===document?scrollY:target.scrollTop||0;
  const previous=scrollPositions.get(target);scrollPositions.set(target,{x,y,time:now});
  const speed=previous?Math.hypot(x-previous.x,y-previous.y)/Math.max(8,Math.min(48,now-previous.time)):0;
  // During a fast fling the native pane stays attached to the compositor.
  // Avoid rerasterising an optical tile for every intermediate scroll position.
  if(speed>1.25||coasting){
   coasting=true;dock.classList.add('glass-coasting');clearTimeout(settleTimer);
   settleTimer=setTimeout(()=>{coasting=false;schedule();},100);
  }else schedule();
 },{capture:true,passive:true});
 // Safari's collapsing toolbar changes the visual viewport without a document
 // scroll. Reposition the small bevel, never animate the dock's bottom/height.
 window.visualViewport?.addEventListener('resize',()=>schedule(),{passive:true});
 window.visualViewport?.addEventListener('scroll',()=>schedule(),{passive:true});
 window.addEventListener('resize',()=>schedule(),{passive:true});
 document.fonts?.ready.then(()=>schedule(true));
 const observer=new ResizeObserver(()=>schedule());observer.observe(dock);
 const modalObserver=new MutationObserver(()=>schedule(true));
 if(immersive)modalObserver.observe(immersive,{attributes:true,attributeFilter:['hidden']});
 transparency.addEventListener('change',()=>schedule(true));
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule(true);});
 window.addEventListener('pagehide',()=>{stopped=true;clearTimeout(settleTimer);cancelAnimationFrame(frame);frame=0;});
 window.addEventListener('pageshow',()=>{stopped=false;coasting=false;schedule(true);});
 schedule(true);
})();
