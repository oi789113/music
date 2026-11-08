export const moods = {
  relax:{label:'松弛一下',subtitle:'慢一点，也很好。',genres:/country|folk|singer|acoustic|乡村|民谣/i,words:/海|风|慢|晴|home|you/i},
  focus:{label:'专注时刻',subtitle:'把注意力，留给此刻。',genres:/classical|instrumental|jazz|ambient|electronic|house|古典|纯音乐/i,words:/light|time|summer|光|夜/i},
  energy:{label:'满格能量',subtitle:'让热爱，重新满格。',genres:/hip.hop|rap|rock|dance|house|latin|说唱|摇滚/i,words:/alive|bad|wedding|99|热|火/i},
  night:{label:'深夜漫游',subtitle:'今晚，有音乐懂你。',genres:/r.b|soul|alternative|pop|流行/i,words:/night|heaven|eyes|失眠|想|念|忘|难过/i}
};
export function hash(text){let h=0;for(const char of text)h=(Math.imul(31,h)+char.codePointAt(0))|0;return h>>>0;}
export function recommend(tracks,{mood='relax',tastes=[],favorites=[],seed=new Date().toISOString().slice(0,10),limit=6}={}){
  if(limit<=0)return [];
  const config=moods[mood]||moods.relax;
  const favored=new Set(favorites.map(x=>x.artist));
  const tastePattern={华语:/流行|华语/,欧美:/pop|country|hip|rock|folk|r.b|house|latin/i,流行:/pop|流行/i,民谣:/folk|country|民谣/i,说唱:/hip|rap|说唱/i,电子:/dance|electronic|house/i,摇滚:/rock|摇滚/i};
  const ranked=tracks.map(t=>({track:t,score:100/(t.rank+8)+(config.genres.test(t.genre)?18:0)+(config.words.test(t.title)?9:0)+(favored.has(t.artist)?20:0)+tastes.reduce((s,taste)=>s+(tastePattern[taste]?.test(t.genre)?10:0),0)+(hash(seed+t.id)%1600)/100})).sort((a,b)=>b.score-a.score);
  const result=[],artists=new Set();
  for(const {track} of ranked){if(artists.has(track.artist))continue;result.push(track);artists.add(track.artist);if(result.length===limit)break;}
  return result;
}
