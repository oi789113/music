/** Compositor-driven atmosphere; pointer motion runs only while it is settling. */
(()=>{
 'use strict';
 const reduce=matchMedia('(prefers-reduced-motion: reduce)');
 const fine=matchMedia('(hover: hover) and (pointer: fine)');
 const glass=document.getElementById('player');
 const tilts=new Map();let frame=0,last=0,hovered=null;
 const light={x:28,y:0,tx:28,ty:0};
 const clamp=(n,a,b)=>Math.max(a,Math.min(n,b));
 function tick(now){
  frame=0;if(document.hidden||reduce.matches)return;
  const dt=last?Math.min(now-last,40):16;last=now;
  const ease=1-Math.exp(-dt/80);let moving=false;
  if(Math.abs(light.tx-light.x)+Math.abs(light.ty-light.y)>.03){
   light.x+=(light.tx-light.x)*ease;light.y+=(light.ty-light.y)*ease;
   glass?.style.setProperty('--glass-x',light.x.toFixed(2)+'%');
   glass?.style.setProperty('--glass-y',light.y.toFixed(2)+'%');moving=true;
  }
  for(const [node,state]of tilts){
   if(!node.isConnected){tilts.delete(node);continue;}
   state.x+=(state.tx-state.x)*ease;state.y+=(state.ty-state.y)*ease;
   node.style.setProperty('--tilt-x',state.x.toFixed(2)+'deg');node.style.setProperty('--tilt-y',state.y.toFixed(2)+'deg');
   if(Math.abs(state.tx-state.x)+Math.abs(state.ty-state.y)>.01)moving=true;
   else if(state.tx===0&&state.ty===0){node.style.removeProperty('--tilt-x');node.style.removeProperty('--tilt-y');tilts.delete(node);}
  }
  if(moving)frame=requestAnimationFrame(tick);else last=0;
 }
 function wake(){if(!frame&&!document.hidden&&!reduce.matches)frame=requestAnimationFrame(tick);}
 function resetHover(){const state=tilts.get(hovered);if(state){state.tx=state.ty=0;wake();}hovered=null;}
 document.addEventListener('pointermove',event=>{
  if(reduce.matches||!fine.matches||event.pointerType==='touch')return;
  const next=event.target.closest?.('.song-art,#heroArt');
  if(hovered!==next)resetHover();hovered=next;
  if(next){
   const r=next.getBoundingClientRect(),x=clamp((event.clientX-r.left)/r.width,0,1),y=clamp((event.clientY-r.top)/r.height,0,1);
   const state=tilts.get(next)||{x:0,y:0,tx:0,ty:0};
   state.tx=(.5-y)*3;state.ty=(x-.5)*3;tilts.set(next,state);
   next.style.setProperty('--pointer-x',x*100+'%');next.style.setProperty('--pointer-y',y*100+'%');wake();
  }
 },{passive:true});
 document.addEventListener('pointerout',event=>{if(hovered&&(!event.relatedTarget||!hovered.contains(event.relatedTarget)))resetHover();},{passive:true});
 glass?.addEventListener('pointermove',event=>{
  if(reduce.matches||!fine.matches||event.pointerType==='touch')return;
  const r=glass.getBoundingClientRect();light.tx=clamp((event.clientX-r.left)/r.width*100,0,100);light.ty=clamp((event.clientY-r.top)/r.height*100,0,100);wake();
 },{passive:true});
 glass?.addEventListener('pointerleave',()=>{light.tx=28;light.ty=0;wake();});
 window.addEventListener('sonar:track',event=>{
  const t=event.detail?.track;if(!t)return;
  let hash=0;for(const char of String(t.id))hash=(Math.imul(hash,31)+char.charCodeAt(0))|0;
  const hues=['#7452bc','#5269b0','#9151a6','#9a526e','#426e98'];
  document.documentElement.style.setProperty('--ambient-accent',hues[(hash>>>0)%hues.length]);
 });
 function stop(){cancelAnimationFrame(frame);frame=0;last=0;}
 // Keep interaction responsive on devices without an accelerated compositor.
 // Sample briefly, then stop; only decorative loops are paused if frames remain
 // slow. Scrolling, refraction, cover changes and control feedback stay live.
 setTimeout(()=>{
  if(reduce.matches||document.hidden)return;
  let previous=0,samples=0,slow=0;
  function calibrate(now){
   if(document.hidden||reduce.matches)return;
   if(previous){
    samples++;slow=now-previous>55?slow+1:0;
    if(slow>=5){document.body.classList.add('motion-lite');return;}
   }
   previous=now;if(samples<36)requestAnimationFrame(calibrate);
  }
  requestAnimationFrame(calibrate);
 },800);
 document.addEventListener('visibilitychange',()=>{document.body.classList.toggle('motion-paused',document.hidden);if(document.hidden)stop();else wake();});
 reduce.addEventListener('change',()=>{stop();resetHover();for(const [node]of tilts){node.style.removeProperty('--tilt-x');node.style.removeProperty('--tilt-y');}tilts.clear();glass?.style.removeProperty('--glass-x');glass?.style.removeProperty('--glass-y');});
 window.addEventListener('pagehide',stop);
})();
