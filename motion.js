/** Atmospheric rendering and pointer motion. All interactions retain a static reduced-motion state. */
(()=>{
 'use strict';
 const canvasElement=document.getElementById('ambientCanvas');
 const reduceQuery=matchMedia('(prefers-reduced-motion: reduce)');
 const finePointer=matchMedia('(hover: hover) and (pointer: fine)');
 let reduced=reduceQuery.matches,canvas=canvasElement,gl=null,context2d=null,program=null,uniforms={},frame=0,lastFrame=0,clock=0;
 let pointer={x:.62,y:.42,targetX:.62,targetY:.42};
 let color=[.52,.34,.96],targetColor=[.52,.34,.96],energy=0;
 const tilts=new Map();
 const glass=document.getElementById('player');
 const glassLight={x:28,y:0,targetX:28,targetY:0};
 const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
 function rgb(h,s,l){
  const f=n=>{const k=(n+h*12)%12,a=s*Math.min(l,1-l);return l-a*Math.max(-1,Math.min(k-3,9-k,1));};
  return [f(0),f(8),f(4)];
 }
 function trackPalette(event){
  const track=event.detail?.track;if(!track)return;
  let hash=0;for(const letter of String(track.id||track.title||''))hash=(Math.imul(hash,31)+letter.charCodeAt(0))|0;
  // Deliberate, limited hues retain the site's art direction as songs change.
  const hues=[.71,.64,.84,.94,.55];
  targetColor=rgb(hues[(hash>>>0)%hues.length],.72,.58);
  document.documentElement.style.setProperty('--ambient-accent',`rgb(${targetColor.map(v=>Math.round(v*255)).join(',')})`);
  if(reduced)draw(0);
 }
 window.addEventListener('sonar:track',trackPalette);
 function makeShader(type,source){
  const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);
  if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){gl.deleteShader(shader);return null;}return shader;
 }
 function setupGL(){
  if(!canvas)return false;
  try{gl=canvas.getContext('webgl',{alpha:false,antialias:false,depth:false,stencil:false,powerPreference:'low-power',preserveDrawingBuffer:false});}catch{}
  if(!gl)return false;
  const vertex=makeShader(gl.VERTEX_SHADER,'attribute vec2 aPosition;void main(){gl_Position=vec4(aPosition,0.,1.);}');
  const fragment=makeShader(gl.FRAGMENT_SHADER,`
   precision mediump float;
   uniform vec2 uResolution;uniform vec2 uPointer;uniform float uTime;uniform float uEnergy;uniform vec3 uColor;
   float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
   float field(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
   float bloom(vec2 p,vec2 c,vec2 s){vec2 d=(p-c)/s;return exp(-dot(d,d)*2.1);}
   void main(){
    vec2 uv=gl_FragCoord.xy/uResolution;
    float t=uTime*.065;
    vec2 drift=vec2(sin(t*.7),cos(t*.58))*.08;
    vec2 warp=vec2(field(uv*2.6+t*.2),field(uv*2.6+8.-t*.16))-.5;
    vec2 p=uv+warp*.20+(uPointer-.5)*.035;
    float primary=bloom(p,vec2(.72,.62)+drift,vec2(.55,.55));
    float blue=bloom(p,vec2(.95,.35)-drift*.6,vec2(.38,.5));
    float rose=bloom(p,vec2(.36,.88)+drift*.7,vec2(.45,.23));
    float pulse=1.+uEnergy*sin(uTime*.85)*.06;
    vec3 col=vec3(.025,.029,.046);
    col+=uColor*primary*.30*pulse;
    col+=vec3(.13,.23,.65)*blue*.16;
    col+=vec3(.50,.18,.30)*rose*.10;
    float grain=(hash(gl_FragCoord.xy+fract(uTime)*100.)-.5)*.014;
    col+=grain;
    gl_FragColor=vec4(col,1.);
   }
  `);
  if(!vertex||!fragment)return false;
  program=gl.createProgram();gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);
  gl.deleteShader(vertex);gl.deleteShader(fragment);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))return false;
  gl.useProgram(program);
  const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
  const position=gl.getAttribLocation(program,'aPosition');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
  for(const name of ['uResolution','uPointer','uTime','uEnergy','uColor'])uniforms[name]=gl.getUniformLocation(program,name);
  return true;
 }
 function setupFallback(){
  if(!canvas)return;
  if(gl){const replacement=canvas.cloneNode();canvas.replaceWith(replacement);canvas=replacement;gl=null;}
  try{context2d=canvas.getContext('2d',{alpha:false});}catch{}
 }
 function resize(){
  if(!canvas)return;
  // This is a soft atmospheric texture: a smaller backing surface avoids unnecessary GPU work.
  const mobile=innerWidth<700,scale=Math.min(devicePixelRatio||1,1.5)*(mobile?.55:.7);
  canvas.width=Math.max(1,Math.round(innerWidth*scale));canvas.height=Math.max(1,Math.round(innerHeight*scale));
  if(gl)gl.viewport(0,0,canvas.width,canvas.height);
  if(reduced||document.hidden)draw(0);
 }
 function draw(delta){
  const amount=reduced?1:Math.min(1,delta*.0018);
  color=color.map((v,i)=>v+(targetColor[i]-v)*amount);
  pointer.x+=(pointer.targetX-pointer.x)*Math.min(1,delta*.003);
  pointer.y+=(pointer.targetY-pointer.y)*Math.min(1,delta*.003);
  energy+=((document.body.classList.contains('playing')?1:0)-energy)*Math.min(1,delta*.003);
  if(gl){
   gl.uniform2f(uniforms.uResolution,canvas.width,canvas.height);gl.uniform2f(uniforms.uPointer,pointer.x,pointer.y);
   gl.uniform1f(uniforms.uTime,clock*.001);gl.uniform1f(uniforms.uEnergy,energy);gl.uniform3fv(uniforms.uColor,color);
   gl.drawArrays(gl.TRIANGLES,0,6);
  }else if(context2d){
   const w=canvas.width,h=canvas.height;context2d.fillStyle='#080a11';context2d.fillRect(0,0,w,h);
   const x=w*(.72+Math.sin(clock*.000035)*.08),y=h*(.4+Math.cos(clock*.000027)*.08);
   const gradient=context2d.createRadialGradient(x,y,0,x,y,w*.65);
   gradient.addColorStop(0,`rgba(${color.map(v=>Math.round(v*255)).join(',')},.22)`);gradient.addColorStop(1,'rgba(8,10,17,0)');
   context2d.fillStyle=gradient;context2d.fillRect(0,0,w,h);
  }
  window.SonarLens?.capture(canvas);
  if(glass&&!reduced&&(Math.abs(glassLight.targetX-glassLight.x)+Math.abs(glassLight.targetY-glassLight.y)>.02)){
   const speed=Math.min(1,delta*.009);
   glassLight.x+=(glassLight.targetX-glassLight.x)*speed;glassLight.y+=(glassLight.targetY-glassLight.y)*speed;
   glass.style.setProperty('--glass-x',glassLight.x.toFixed(2)+'%');glass.style.setProperty('--glass-y',glassLight.y.toFixed(2)+'%');
  }
  for(const [element,state] of tilts){
   if(!element.isConnected){tilts.delete(element);continue;}
   const rate=Math.min(1,delta*.008);state.x+=(state.targetX-state.x)*rate;state.y+=(state.targetY-state.y)*rate;
   element.style.setProperty('--tilt-x',state.x.toFixed(2)+'deg');element.style.setProperty('--tilt-y',state.y.toFixed(2)+'deg');
   if(state.reset&&Math.abs(state.x)+Math.abs(state.y)<.02){element.style.removeProperty('--tilt-x');element.style.removeProperty('--tilt-y');tilts.delete(element);}
  }
 }
 function tick(now){
  frame=0;if(document.hidden||reduced)return;
  const delta=lastFrame?now-lastFrame:34;
  // Aurora runs at 30fps; CSS and native scroll remain at the display refresh rate.
  if(delta>=32){clock+=Math.min(delta,80);lastFrame=now;draw(Math.min(delta,80));}
  frame=requestAnimationFrame(tick);
 }
 function start(){if(!frame&&!document.hidden&&!reduced){lastFrame=0;frame=requestAnimationFrame(tick);}else if(reduced)draw(0);}
 function stop(){cancelAnimationFrame(frame);frame=0;lastFrame=0;}
 let hovered=null;
 document.addEventListener('pointermove',event=>{
  if(reduced||!finePointer.matches)return;
  pointer.targetX=event.clientX/innerWidth;pointer.targetY=1-event.clientY/innerHeight;
  const next=event.target.closest?.('.song-art, #heroArt');
  if(hovered&&hovered!==next){const previous=tilts.get(hovered);if(previous){previous.targetX=0;previous.targetY=0;previous.reset=true;}}
  hovered=next;if(!next)return;
  const rect=next.getBoundingClientRect(),x=clamp((event.clientX-rect.left)/rect.width,0,1),y=clamp((event.clientY-rect.top)/rect.height,0,1);
  next.style.setProperty('--pointer-x',(x*100).toFixed(1)+'%');next.style.setProperty('--pointer-y',(y*100).toFixed(1)+'%');
  const state=tilts.get(next)||{x:0,y:0,targetX:0,targetY:0};
  const strength=next.id==='heroArt'?4:7;state.targetX=(.5-y)*strength;state.targetY=(x-.5)*strength;state.reset=false;tilts.set(next,state);
 },{passive:true});
 document.addEventListener('pointerout',event=>{
  if(!hovered||event.relatedTarget&&hovered.contains(event.relatedTarget))return;
  const state=tilts.get(hovered);if(state){state.targetX=0;state.targetY=0;state.reset=true;}hovered=null;
 },{passive:true});
 if(glass){
  glass.addEventListener('pointermove',event=>{
   if(reduced||!finePointer.matches)return;
   const bounds=glass.getBoundingClientRect();
   glassLight.targetX=clamp((event.clientX-bounds.left)/bounds.width*100,0,100);
   glassLight.targetY=clamp((event.clientY-bounds.top)/bounds.height*100,0,100);
  },{passive:true});
  glass.addEventListener('pointerleave',()=>{glassLight.targetX=28;glassLight.targetY=0;},{passive:true});
 }
 if(canvas){if(!setupGL())setupFallback();resize();start();}
 window.addEventListener('resize',resize,{passive:true});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();else start();});
 reduceQuery.addEventListener('change',event=>{
  reduced=event.matches;stop();
  if(reduced&&glass){glass.style.removeProperty('--glass-x');glass.style.removeProperty('--glass-y');glassLight.x=glassLight.targetX=28;glassLight.y=glassLight.targetY=0;}
  for(const [element]of tilts){element.style.removeProperty('--tilt-x');element.style.removeProperty('--tilt-y');}tilts.clear();
  document.querySelectorAll('.reveal').forEach(element=>element.classList.add('is-visible'));start();
 });
 // Reveal only below-fold content, and reveal everything if observation is unavailable.
 const reveals=document.querySelectorAll('.reveal');
 if(!reduced&&'IntersectionObserver'in window){
  document.documentElement.classList.add('motion-ready');
  const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){entry.target.classList.add('is-visible');observer.unobserve(entry.target);}},{rootMargin:'0px 0px 40px 0px',threshold:.06});
  reveals.forEach(element=>{if(element.getBoundingClientRect().top<innerHeight)element.classList.add('is-visible');else observer.observe(element);});
 }else reveals.forEach(element=>element.classList.add('is-visible'));
 window.addEventListener('sonar:lens-ready',()=>draw(0));
 window.addEventListener('pagehide',stop);
 window.addEventListener('pageshow',start);
})();
