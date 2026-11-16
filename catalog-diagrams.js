/* Interactive catalog: derive hotspots from PDF text coordinates and printed table callouts. */
(function(g){
'use strict';
const sku=/\b\d{2}-\d{4}(?:-[A-Z0-9]{1,5})?\b/gi;
const tidy=s=>String(s||'').replace(/\s+/g,' ').trim();
function positioned(items){
 const cells=items.filter(i=>typeof i.str==='string'&&i.str.trim()&&Array.isArray(i.transform)).map(i=>({text:i.str.trim(),x:i.transform[4],y:i.transform[5],w:Math.abs(i.width||0),h:Math.max(1,Math.abs(i.height||i.transform[3]||8))})).filter(i=>Number.isFinite(i.x)&&Number.isFinite(i.y));
 const lines=[];for(const c of [...cells].sort((a,b)=>b.y-a.y||a.x-b.x)){let l=lines.find(l=>Math.abs(l.y-c.y)<=Math.max(1.5,Math.min(4,c.h*.28)));if(!l){l={y:c.y,cells:[]};lines.push(l)}l.cells.push(c)}
 return {cells,lines:lines.sort((a,b)=>b.y-a.y).map(l=>({...l,cells:l.cells.sort((a,b)=>a.x-b.x)}))};
}
function joined(cells){let s='',end=null;for(const c of cells){if(end!==null&&(c.x-end>Math.max(.8,c.h*.14)||/[\w)]$/.test(s)&&/^[\w($]/.test(c.text)))s+=' ';s+=c.text;end=c.x+c.w;}return tidy(s)}
function tableRows(items,page){
 const {cells,lines}=positioned(items),anchors=[];
 for(const l of lines)for(const c of l.cells)for(const m of c.text.matchAll(sku)){
  const start=c.x+c.w*(m.index/Math.max(c.text.length,1));
  anchors.push({l,c,m,x:start});
 }
 const rows=[],zones=[],columns=[];
 for(const a of anchors){
  const next=anchors.find(b=>b.l===a.l&&b.x>a.x+1);
  const tail=a.c.text.slice(a.m.index),nextInCell=next&&next.c===a.c?next.m.index-a.m.index:tail.length;
  const following=a.l.cells.filter(c=>c.x>a.c.x+.1&&(!next||c.x<next.x-.1));
  let raw=tidy(tail.slice(0,nextInCell)+' '+joined(following));
  // Standalone printed SKUs above a diagram are not table rows.
  if(!/\$\s*(?:\d|\.\d)/.test(raw))continue;
  raw=raw.replace(/\$\s*\.(\d{2})\b/g,'$0.$1');
  if(!/^[A-Z0-9-]+\s+\(?\d{1,3}\)?\s+|^[A-Z0-9-]+\s+[A-Z]/i.test(raw))continue;
  const found=g.DiagramImporter.parse(raw);if(found.length!==1||!found[0].partno||found[0].price==='')continue;
  const r=found[0],after=raw.slice(a.m[0].length).trim(),explicit=after.match(/^\((\d{1,3})\)\s+/)?.[1]||'';
  // LMC's printed table places ILL# immediately after PART. Blank ILL# rows
  // inherit only from the same column, and only within a contiguous group.
  let col=columns.find(c=>Math.abs(c.x-a.x)<Math.max(7,a.c.h*1.4));
  if(!col){col={x:a.x,y:a.l.y,number:''};columns.push(col)}
  const gap=col.y-a.l.y;
  if(gap>Math.max(25,a.c.h*5)||gap<0)col.number='';
  if(explicit)col.number=explicit;
  const number=explicit||col.number;
  col.y=a.l.y;
  // Exclude the previous group's callout if a separate unnumbered table begins.
  const nextX=next?next.x:Math.max(...a.l.cells.map(c=>c.x+c.w));
  zones.push({x1:a.x-5,x2:nextX+3,y:a.l.y,h:a.c.h});
  rows.push({...r,callout:number,page,source:'Catalog PDF page '+page,raw});
 }
 // Preserve alternative applications even when SKU is shared.
 const seen=new Set();return {rows:rows.filter(r=>{const key=[r.callout,r.partno,r.title,r.application,r.price,r.qty].join('|');if(seen.has(key))return false;seen.add(key);return true}),zones,cells};
}
function hotspots(items,viewport,parsed){
 const groups=new Set(parsed.rows.map(r=>r.callout).filter(Boolean)),skuSet=new Set(parsed.rows.map(r=>r.partno.toUpperCase())),out=[];
 for(const c of parsed.cells){
  const m=c.text.match(/^\(?(\d{1,3})\)?$/),part=c.text.match(/^\d{2}-\d{4}(?:-[A-Z0-9]{1,5})?$/i);
  const key=m&&groups.has(m[1])?m[1]:part&&skuSet.has(part[0].toUpperCase())?'sku:'+part[0].toUpperCase():'';
  if(!key||parsed.zones.some(z=>c.x>=z.x1&&c.x<=z.x2&&Math.abs(c.y-z.y)<Math.max(4,z.h*.6)))continue;
  const p=viewport.convertToViewportPoint(c.x+c.w/2,c.y+c.h*.45),x=p[0]/viewport.width,y=p[1]/viewport.height;
  if(x<.025||x>.975||y<.035||y>.95)continue;
  if(out.some(a=>a.key===key&&Math.abs(a.x-x)<.012&&Math.abs(a.y-y)<.012))continue;
  out.push({key,label:key.startsWith('sku:')?key.slice(4):key,x,y});
 }
 return out;
}
function ocrHotspots(words,rows,width,height,zones){const groups=new Set(rows.map(r=>r.callout).filter(Boolean)),out=[];for(const w of words||[]){const m=String(w.text||'').trim().match(/^\(?([0-9]{1,3})\)?$/);if(!m||!groups.has(m[1])||Number(w.confidence)<65||!w.bbox)continue;const x=(w.bbox.x0+w.bbox.x1)/2/width,y=(w.bbox.y0+w.bbox.y1)/2/height;if(x<.025||x>.975||y<.035||y>.95||zones.some(z=>x>=z.x1&&x<=z.x2&&y>=z.y1&&y<=z.y2))continue;if(!out.some(p=>p.key===m[1]&&Math.abs(p.x-x)<.012&&Math.abs(p.y-y)<.012))out.push({key:m[1],label:m[1],x,y,ocr:true});}return out;}
function groupRows(rows,key){return rows.filter(r=>key==='all'||(key.startsWith('sku:')?r.partno.toUpperCase()===key.slice(4):r.callout===key))}
async function renderPage(doc,n,canvas,zoom=1){
 const page=await doc.getPage(n);try{const viewport=page.getViewport({scale:Math.min(3,1.7*zoom)});const content=await page.getTextContent();const parsed=tableRows(content.items,n);canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);await page.render({canvas,canvasContext:canvas.getContext('2d'),viewport,background:'white'}).promise;const zones=parsed.zones.map(z=>{const a=viewport.convertToViewportPoint(z.x1,z.y+z.h),b=viewport.convertToViewportPoint(z.x2,z.y-z.h*.55);return {x1:Math.min(a[0],b[0])/viewport.width,x2:Math.max(a[0],b[0])/viewport.width,y1:Math.min(a[1],b[1])/viewport.height,y2:Math.max(a[1],b[1])/viewport.height}});return {rows:parsed.rows,hotspots:hotspots(content.items,viewport,parsed),zones,width:viewport.width,height:viewport.height};}finally{page.cleanup();}
}
g.CatalogDiagrams={positioned,tableRows,hotspots,ocrHotspots,groupRows,renderPage};
})(globalThis);