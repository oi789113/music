(()=>{'use strict';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const icon=id=>'<svg><use href="#'+id+'"/></svg>';
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeURL=u=>{try{const url=new URL(u);return url.protocol==='https:'?url.href:'';}catch{return '';}};
const load=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
const save=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch{toast('浏览器未允许保存，本次会话仍可使用。');}};
let data=window.SONAR_DATA,filter='all',page='discover',visible=12,query='',mood='relax',generation=0;
let favorites=load('sonar-favorites',[]),tastes=load('sonar-tastes',[]),mix=[],queue=[],current=null,shuffle=false;
if(!Array.isArray(favorites))favorites=[];if(!Array.isArray(tastes))tastes=[];
const audio=$('#audio');audio.volume=.7;
let toastTimer,modalRestore,featureIndex=0,deckHover=false,expanded=false;
const reducedMotion=matchMedia('(prefers-reduced-motion:reduce)').matches;
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),3700);}
function openModal(content,eyebrow='SONAR NOTES'){modalRestore=document.activeElement;$('#modalContent').innerHTML=content;$('#modalEyebrow').textContent=eyebrow;if(!$('#modal').open)$('#modal').showModal();}
function closeModal(){$('#modal').close();modalRestore?.focus();}
$('#closeModal').onclick=closeModal;$('#modal').addEventListener('click',e=>{if(e.target===$('#modal')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeModal();}});
const isLiked=id=>favorites.some(t=>t.id===id);
function allTracks(){return [...data.tracks,...favorites.filter(f=>!data.tracks.some(t=>t.id===f.id))];}
function card(t,i){return '<article data-track-id="'+escape(t.id)+'" class="song-card '+(current?.id===t.id?'current':'')+'" style="--i:'+i+'"><div class="song-art"><img src="'+escape(safeURL(t.cover))+'" alt="'+escape(t.album||t.title)+' 专辑封面" loading="lazy"><span class="rank"><small>'+escape(t.sourceId==='itunes'?'US':'CN')+'</small> '+String(t.rank).padStart(2,'0')+'</span><button class="art-hit" data-action="play" data-id="'+escape(t.id)+'" aria-label="'+escape((t.preview?'试听 ':'查看 ')+t.title)+'"><span class="card-play">'+icon(t.preview?'play':'arrow-up')+'</span></button></div><h3 title="'+escape(t.title)+'">'+escape(t.title)+'</h3><span class="artist" title="'+escape(t.artist)+'">'+escape(t.artist)+'</span><div class="song-meta"><span class="source-tag '+escape(t.sourceId)+'">'+(t.sourceId==='itunes'?'iTunes · 美国榜':'网易云 · 热歌榜')+'</span><button class="icon-btn '+(isLiked(t.id)?'liked':'')+'" data-action="like" data-id="'+escape(t.id)+'" aria-label="'+escape((isLiked(t.id)?'取消收藏 ':'收藏 ')+t.title)+'" aria-pressed="'+isLiked(t.id)+'">'+icon('heart')+'</button></div></article>';}
function filtered(){return (page==='favorites'?favorites:data.tracks).filter(t=>(filter==='all'||page==='favorites'||t.sourceId===filter)&&(!query||(t.title+' '+t.artist).toLowerCase().includes(query.toLowerCase())));}
function renderCards(container,tracks,keyPrefix=''){
 const key=keyPrefix+tracks.map(t=>t.id+'|'+t.cover+'|'+t.rank).join(';');
 if(container.dataset.cardsKey!==key){container.dataset.cardsKey=key;container.innerHTML=tracks.map(card).join('');return;}
 container.querySelectorAll('.song-card').forEach((element,index)=>{const t=tracks[index];if(!t)return;element.classList.toggle('current',current?.id===t.id);const heart=element.querySelector('[data-action="like"]');if(heart){heart.classList.toggle('liked',isLiked(t.id));heart.setAttribute('aria-pressed',isLiked(t.id));heart.setAttribute('aria-label',(isLiked(t.id)?'取消收藏 ':'收藏 ')+t.title);}});
}
function render(){
 const tracks=filtered();if(tracks.length)renderCards($('#songGrid'),tracks.slice(0,visible),page);else{$('#songGrid').dataset.cardsKey='';$('#songGrid').innerHTML='<div class="empty-state"><strong>'+(page==='favorites'?'收藏一点心动':'还没有找到这首歌')+'</strong><p>'+(page==='favorites'?'点击歌曲旁的爱心，把喜欢的声音留在这里。<br>收藏保存在当前浏览器。':'试试歌手名，或换一个关键词。')+'</p><button data-action="'+(page==='favorites'?'discover':'clear')+'">'+(page==='favorites'?'去发现好音乐 ↗':'清除搜索 ↗')+'</button></div>';} 
 $('#moreBtn').hidden=tracks.length<=visible;$('#moreBtn').innerHTML='展开全部 '+tracks.length+' 首 '+icon('arrow-up');
 $('#songGrid').classList.toggle('expanded',expanded);
 window.dispatchEvent(new Event('sonar:render'));
 const featured=allTracks().find(t=>t.id===$('#heroPlay').dataset.id);if(featured){$('#featureLike').classList.toggle('liked',isLiked(featured.id));$('#featureLike').setAttribute('aria-pressed',isLiked(featured.id));}
 $('#favCount').textContent=favorites.length?String(favorites.length):'';
 if(mix.length)renderCards($('#mixGrid'),mix,'mix');
 if(current){$('#playerLike').classList.toggle('liked',isLiked(current.id));$('#playerLike').setAttribute('aria-pressed',isLiked(current.id));}
}
function toggleLike(id){const t=allTracks().find(t=>t.id===id);if(!t)return;const liked=isLiked(id);favorites=liked?favorites.filter(f=>f.id!==id):[t,...favorites];save('sonar-favorites',favorites);render();toast(liked?'已从收藏移除':'心动已收藏，留给下一次循环。');}
function featureTracks(){return data.tracks.slice(0,8);}
function heroTrack(t,animate=false,direction=1){
 if(!t)return;const features=featureTracks();const found=features.findIndex(v=>v.id===t.id);if(found>=0)featureIndex=found;
 $('#heroCover').src=safeURL(t.cover);$('#heroTitle').textContent=t.title;$('#heroArtist').textContent=t.artist;$('#heroPlay').dataset.id=t.id;$('#heroCover').alt=t.title+' · 专辑封面';
 $('#heroSource').textContent=(t.sourceId==='itunes'?'ITUNES US':'网易云热歌榜')+' / NO.'+String(t.rank).padStart(2,'0');$('#heroPreviewTag').textContent=t.preview?'官方试听 · 点击播放':'在音乐平台收听';
 const prev=features[(featureIndex-1+features.length)%features.length],next=features[(featureIndex+1)%features.length];
 $('#heroBackCover1').src=safeURL(prev.cover);$('#heroBackCover2').src=safeURL(next.cover);
 $('#deckCounter').innerHTML=found<0?'NOW <i>/ PLAYING</i>':String(featureIndex+1).padStart(2,'0')+' <i>/ '+String(features.length).padStart(2,'0')+'</i>';
 $('#deckProgress').style.width=((featureIndex+1)/features.length*100)+'%';
 $('#featureLike').classList.toggle('liked',isLiked(t.id));$('#featureLike').setAttribute('aria-pressed',isLiked(t.id));
 if(animate&&!reducedMotion&&$('#heroPlay').animate){$('#heroPlay').getAnimations().forEach(a=>a.cancel());$('#heroPlay').animate([{opacity:.1,filter:'blur(14px)',transform:'translateX('+(direction*45)+'px) rotate('+(direction*8)+'deg) scale(.9)'},{opacity:1,filter:'blur(0)',transform:'rotate(-6deg) scale(1)'}],{duration:650,easing:'cubic-bezier(.16,1,.3,1)'});$('.deck-meta').animate([{opacity:0,filter:'blur(5px)',transform:'translateY(7px)'},{opacity:1,filter:'blur(0)',transform:'translateY(0)'}],{duration:550,easing:'cubic-bezier(.16,1,.3,1)'});}
 window.dispatchEvent(new CustomEvent('sonar:track',{detail:{track:t}}));
}
function shiftFeature(direction){const list=featureTracks();featureIndex=(featureIndex+direction+list.length)%list.length;heroTrack(list[featureIndex],true,direction);}
function initView(){
 const hero=current||featureTracks()[featureIndex]||data.tracks[0];heroTrack(hero);
 $('#miniCovers').innerHTML=data.tracks.slice(1,5).map(t=>'<img src="'+escape(safeURL(t.cover))+'" alt="'+escape(t.title)+'">').join('');
 updateStatus();render();
}
function fmtDate(value){const d=new Date(value);return Number.isNaN(+d)?'未知':d.toLocaleString('zh-CN',{timeZone:'UTC',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false})+' UTC';}
function updateStatus(){let state=data.snapshot?'已载入榜单快照':data.partial?'部分来源暂不可用':'每日热榜已同步';$('#updateText').textContent=state+' · 网易云热歌榜 + iTunes 美国榜 · '+fmtDate(data.updatedAt);}
async function syncCharts(manual=false){const btn=$('#refreshBtn');btn.classList.add('busy');btn.disabled=true;try{const r=await fetch('/api/charts',{cache:'no-store'});if(!r.ok)throw new Error();const next=await r.json();if(!Array.isArray(next.tracks)||!next.tracks.length)throw new Error();data=next;initView();if(manual)toast(data.partial?'已同步可用榜单；部分来源显示有日期的快照。':'已检查今日热榜，每日自动获取新榜单。');}catch{if(manual)toast('暂时无法同步，保留当前榜单快照。');$('#updateText').textContent='连接暂不可用 · 显示 '+fmtDate(data.updatedAt)+' 的榜单快照';}finally{btn.classList.remove('busy');btn.disabled=false;}}
function setPage(next,scroll=true){page=next;document.body.dataset.page=next;$$('.nav').forEach(b=>b.classList.toggle('active',b.dataset.page===next));if(next==='favorites'){$('#chartTitle').textContent='把心动，留在这里';$('#chartSubtitle').textContent='属于你的好声音，已在当前浏览器收藏。';$('#refreshBtn').hidden=true;$('#mixSection').hidden=true;visible=100;expanded=true;}else{$('#chartTitle').innerHTML='此刻，正在循环<span class="title-dot">.</span>';$('#chartSubtitle').textContent='网易云热歌榜 × iTunes 美国榜 · 各平台排名独立展示';$('#refreshBtn').hidden=false;visible=12;expanded=false;$('#mixSection').hidden=!mix.length;}
 render();if(scroll){if(next==='discover'||next==='favorites')window.scrollTo({top:0,behavior:reducedMotion?'auto':'smooth'});else $(next==='recommend'?'#recommend':'#charts').scrollIntoView({behavior:reducedMotion?'auto':'smooth'});}}
function setCurrent(t){current=t;audio.pause();audio.removeAttribute('src');$('#playerCover').src=t.cover;$('#playerTitle').textContent=t.title;$('#playerArtist').textContent=t.artist;$('#platformLink').href=safeURL(t.url);$('#platformLink').title='在 '+t.source+' 打开';$('#previewLabel').textContent=t.preview?'官方试听':'平台收听';$('#seek').value=0;$('#elapsed').textContent='0:00';$('#duration').textContent='0:30';$('#playerLike').setAttribute('aria-label','收藏 '+t.title);heroTrack(t,true);syncImmersive();render();}
function platformModal(t){openModal('<h2>这首歌，去现场听。</h2><p>「'+escape(t.title)+'」来自'+escape(t.source)+'。当前来源未提供可嵌入的官方试听，可前往平台收听完整版。</p><a class="primary-btn" href="'+escape(safeURL(t.url))+'" target="_blank" rel="noopener">前往 '+escape(t.source)+' '+icon('arrow-up')+'</a><p style="font-size:10px;margin-top:20px">也可以继续试听列表中带播放标记的歌曲。</p>','LISTEN ON THE ORIGINAL PLATFORM');}
async function playTrack(t,tracks){if(!t)return;if(tracks)queue=tracks;if(current?.id===t.id&&t.preview){if(!audio.paused){audio.pause();return;}if(audio.src){try{await audio.play();}catch{toast('试听暂时不可用，可从右侧前往音乐平台。');}return;}}
 setCurrent(t);if(!t.preview){platformModal(t);return;}audio.src=safeURL(t.preview);try{await audio.play();}catch{toast('试听加载失败，请稍后重试或前往音乐平台。');}}
function playableQueue(){return (queue.length?queue:data.tracks).filter(t=>t.preview);}
function step(direction){const list=playableQueue();if(!list.length){toast('当前列表没有官方试听，可前往音乐平台收听。');return;}let index=list.findIndex(t=>t.id===current?.id);let next=shuffle?Math.floor(Math.random()*list.length):(index+direction+list.length)%list.length;if(index===-1)next=0;if(list.length>1&&shuffle&&list[next].id===current?.id)next=(next+1)%list.length;if(list[next].id===current?.id){audio.currentTime=0;if(audio.paused)audio.play().catch(()=>toast("试听暂时无法播放。"));}else playTrack(list[next]);}
function sourceModal(){const sourceRows=data.sources.map(s=>'<div class="source-row"><div><a href="'+escape(safeURL(s.url))+'" target="_blank" rel="noopener">'+escape(s.label||s.name)+' ↗</a><p style="margin:5px 0 0;font-size:10px">榜单更新 '+fmtDate(s.updatedAt)+'</p></div><span>'+(data.snapshot||!s.ok?'已保存快照':'当日已获取')+'</span></div>').join('');openModal('<h2>捕捉热度，保留出处。</h2><p>当前接入 2 个公开榜单：网易云热歌榜和 iTunes 美国热歌榜。综合精选交替展示各平台歌曲，封面角标是歌曲在所属榜单的名次。覆盖范围不代表全网所有音乐平台。</p>'+sourceRows+'<p>每天首次访问自动获取当日榜单，按 UTC 日期缓存。来源异常会保留有日期的快照，并在稍后重试。刷新按钮检查当日缓存，不会伪造新排名。</p><p>iTunes 提供官方试听片段；其他歌曲链接到原平台。封面、歌曲及音频版权归相应权利人所有。</p><p style="font-size:10px">推荐按音乐类型、标题关键词、收藏歌手与口味偏好筛选，并每日变化；不生成新歌曲，也未分析音频情绪。</p>','BEHIND THE SIGNAL');}
function tasteModal(){let draft=[...tastes];openModal('<h2>调到你的频率。</h2><p>选几个你偏爱的音乐方向。推荐时会优先考虑，随时可以更改。</p><div class="taste-options">'+['华语','欧美','流行','民谣','说唱','电子','摇滚'].map(t=>'<button class="taste-option '+(draft.includes(t)?'active':'')+'" data-taste="'+t+'" aria-pressed="'+draft.includes(t)+'">'+t+'</button>').join('')+'</div><button class="primary-btn" id="saveTaste">保存我的口味 '+icon('arrow-up')+'</button><p style="font-size:10px">口味与收藏仅保存在当前浏览器。</p>','YOUR MUSIC DNA');$$('[data-taste]').forEach(b=>b.onclick=()=>{const t=b.dataset.taste;draft=draft.includes(t)?draft.filter(v=>v!==t):[...draft,t];b.classList.toggle('active',draft.includes(t));b.setAttribute('aria-pressed',draft.includes(t));});$('#saveTaste').onclick=()=>{tastes=draft;save('sonar-tastes',tastes);closeModal();toast('你的音乐口味已保存。下一份推荐，会更合拍。');};}
function showQueue(){const list=queue.length?queue:data.tracks;openModal('<h2>下一首，继续心动。</h2><p>有官方试听的歌曲会连续播放，其他歌曲可前往平台收听。</p>'+list.map(t=>'<button class="modal-track" data-action="play" data-id="'+escape(t.id)+'"><img src="'+escape(safeURL(t.cover))+'" alt=""><span>'+escape(t.title)+'<small>'+escape(t.artist)+'</small></span>'+icon(t.preview?'play':'arrow-up')+'</button>').join(''),'UP NEXT · '+list.length+' TRACKS');}
document.addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(!b)return;const {action,id}=b.dataset;if(action==='like')toggleLike(id);if(action==='play'){if($('#modal').open)closeModal();playTrack(allTracks().find(t=>t.id===id),b.classList.contains('modal-track')?queue:mix.some(t=>t.id===id)&&b.closest('#mixGrid')?mix:filtered());}if(action==='clear'){$('#searchInput').value='';query='';render();}if(action==='discover')setPage('discover');});
$$('.nav').forEach(b=>b.onclick=()=>setPage(b.dataset.page));$$('.brand').forEach(b=>b.onclick=e=>{e.preventDefault();setPage('discover');});
$$('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;visible=12;expanded=false;$$('[data-filter]').forEach(v=>v.classList.toggle('active',b===v));render();});
$('#searchInput').oninput=e=>{const wasEmpty=!query;query=e.target.value;visible=40;expanded=!!query;render();if(query&&wasEmpty)$('#charts').scrollIntoView({behavior:reducedMotion?'auto':'smooth'});};$('#searchToggle').onclick=()=>{$('#searchBox').classList.toggle('open');if($('#searchBox').classList.contains('open'))$('#searchInput').focus();};
$('#moreBtn').onclick=()=>{visible=100;expanded=true;render();};$('#refreshBtn').onclick=()=>syncCharts(true);$('#sourceBtn').onclick=sourceModal;$('#footerSource').onclick=sourceModal;$('#tasteBtn').onclick=tasteModal;$('#exploreBtn').onclick=()=>setPage('charts');
$('#playDaily').onclick=()=>{const list=data.tracks.filter(t=>t.preview);playTrack(list[0],list);};$('#heroPlay').onclick=()=>playTrack(allTracks().find(t=>t.id===$('#heroPlay').dataset.id),data.tracks);
$('#playBtn').onclick=()=>current?current.preview?(audio.paused?playTrack(current):audio.pause()):platformModal(current):playTrack(data.tracks.find(t=>t.preview),data.tracks);
$('#nextBtn').onclick=()=>step(1);$('#prevBtn').onclick=()=>{if(audio.currentTime>3){audio.currentTime=0;return;}step(-1);};$('#playerLike').onclick=()=>current?toggleLike(current.id):toast('先选一首歌，再收藏这份心动。');
$('#shuffleBtn').onclick=()=>{shuffle=!shuffle;$('#shuffleBtn').classList.toggle('liked',shuffle);$('#shuffleBtn').setAttribute('aria-pressed',shuffle);toast(shuffle?'随机播放已开启':'按列表顺序播放');};$('#queueBtn').onclick=showQueue;
$('#volume').oninput=e=>{audio.volume=Number(e.target.value);audio.muted=false;};$('#volumeBtn').onclick=()=>{audio.muted=!audio.muted;$('#volumeBtn').style.opacity=audio.muted?'.4':'1';};
const time=s=>Math.floor((s||0)/60)+':'+String(Math.floor((s||0)%60)).padStart(2,'0');
audio.addEventListener('play',()=>{document.body.classList.add('playing');$('#playBtn').innerHTML=icon('pause');$('#playBtn').setAttribute('aria-label','暂停');});audio.addEventListener('pause',()=>{document.body.classList.remove('playing');$('#playBtn').innerHTML=icon('play');$('#playBtn').setAttribute('aria-label','播放');});
audio.addEventListener('loadedmetadata',()=>{$('#duration').textContent=time(audio.duration);});audio.addEventListener('timeupdate',()=>{const pct=(audio.currentTime/(audio.duration||30))*100;$('#seek').value=pct;$('#seek').style.background='linear-gradient(to right,var(--green) '+pct+'%,#53624e60 '+pct+'%)';$('#elapsed').textContent=time(audio.currentTime);});$('#seek').oninput=e=>{if(audio.src&&Number.isFinite(audio.duration))audio.currentTime=Number(e.target.value)/100*audio.duration;};audio.addEventListener('ended',()=>step(1));audio.addEventListener('error',()=>{if(audio.src&&audio.getAttribute('src'))toast('这段试听暂时无法播放，可前往原平台收听。');});
$$('[data-mood]').forEach(b=>b.onclick=()=>{mood=b.dataset.mood;$$('[data-mood]').forEach(v=>{v.classList.toggle('active',v===b);v.setAttribute('aria-pressed',v===b);});});
$('#generateBtn').onclick=()=>{const btn=$('#generateBtn');btn.classList.add('busy');btn.disabled=true;setTimeout(()=>{generation++;mix=recommend(data.tracks,{mood,tastes,favorites,seed:new Date().toISOString().slice(0,10)+':'+generation,limit:6});$('#mixTitle').textContent=moods[mood].label+' · 你的专属频率';$('#mixReason').textContent=moods[mood].subtitle+' 按类型、标题关键词与收藏偏好，从今日热榜里为你选出 '+mix.length+' 首。';$('#mixSection').hidden=false;render();$('#mixSection').scrollIntoView({behavior:reducedMotion?'auto':'smooth'});btn.classList.remove('busy');btn.disabled=false;},550);};
$('#playMix').onclick=()=>{const list=mix.filter(t=>t.preview);if(list.length)playTrack(list[0],mix);else toast('这份推荐暂无官方试听，可逐首前往平台收听。');};
const heroArt=$('#heroArt');
$('#deckPrev').onclick=()=>shiftFeature(-1);$('#deckNext').onclick=()=>shiftFeature(1);$('#heroBack1').onclick=()=>shiftFeature(-1);$('#heroBack2').onclick=()=>shiftFeature(1);
$('#featureLike').onclick=()=>toggleLike($('#heroPlay').dataset.id);
heroArt.addEventListener('pointerenter',()=>deckHover=true);heroArt.addEventListener('pointerleave',()=>deckHover=false);
let dragStart=null,suppressHeroClick=false;
$('#heroPlay').addEventListener('pointerdown',e=>{if(e.button!==0)return;dragStart={x:e.clientX,y:e.clientY,id:e.pointerId};});
window.addEventListener('pointerup',e=>{if(!dragStart||dragStart.id!==e.pointerId)return;const dx=e.clientX-dragStart.x,dy=e.clientY-dragStart.y;dragStart=null;if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)){suppressHeroClick=true;shiftFeature(dx>0?-1:1);setTimeout(()=>suppressHeroClick=false,100);}});
window.addEventListener('pointercancel',()=>dragStart=null);
$('#heroPlay').addEventListener('click',e=>{if(suppressHeroClick){e.stopImmediatePropagation();e.preventDefault();}},true);
if(!reducedMotion)setInterval(()=>{if(!document.hidden&&!deckHover&&audio.paused&&page==='discover'&&!$('#modal').open&&$('#immersiveView').hidden)shiftFeature(1);},8500);
$('#songsNext').onclick=()=>$('#songGrid').scrollBy({left:$('#songGrid').clientWidth*.78,behavior:reducedMotion?'auto':'smooth'});
$('#songsPrev').onclick=()=>$('#songGrid').scrollBy({left:-$('#songGrid').clientWidth*.78,behavior:reducedMotion?'auto':'smooth'});
function syncImmersive(){const t=current||data.tracks.find(t=>t.preview)||data.tracks[0];$('#immersiveCover').src=safeURL(t.cover);$('#immersiveBg').src=safeURL(t.cover);$('#immersiveTitle').textContent=t.title;$('#immersiveArtist').textContent=t.artist;}
function openImmersive(){syncImmersive();$('#immersiveView').hidden=false;$('#immersiveView').setAttribute('role','dialog');$('#immersiveView').setAttribute('aria-label','沉浸播放');$('.app-shell').inert=true;$('.sidebar').inert=true;document.body.classList.add('immersive-open');$('#closeImmersive').focus();}
function closeImmersive(){$('#immersiveView').hidden=true;$('.app-shell').inert=false;$('.sidebar').inert=false;document.body.classList.remove('immersive-open');$('#immersiveBtn').focus();}
$('#immersiveBtn').onclick=openImmersive;$('#closeImmersive').onclick=closeImmersive;$('#immersivePlay').onclick=()=>$('#playBtn').click();
document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();if(!$('#immersiveView').hidden)closeImmersive();$('#searchBox').classList.add('open');$('#searchInput').focus();}if(e.key==='Escape'&&!$('#immersiveView').hidden)closeImmersive();if(e.key==='Tab'&&!$('#immersiveView').hidden&&!$('#modal').open){const targets=[...$('#immersiveView').querySelectorAll('button'),...$('#player').querySelectorAll('button,a[href],input')].filter(n=>n.getClientRects().length);const index=targets.indexOf(document.activeElement);if(targets.length){e.preventDefault();targets[(index+(e.shiftKey?-1:1)+targets.length)%targets.length].focus();}}});
$('#todayDate').textContent=new Date().toLocaleDateString('zh-CN',{month:'2-digit',day:'2-digit'}).replaceAll('/','.');
$('#playerCover').src=data.tracks[0]?.cover||'';$('#year').textContent=new Date().getFullYear();$('#chartSubtitle').textContent='网易云热歌榜 × iTunes 美国榜 · 各平台排名独立展示';initView();syncCharts();
})();
