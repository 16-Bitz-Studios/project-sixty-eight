/* Session-only catalog browser: no catalog content bundled or uploaded. */
(function(g){
'use strict';
const skuPattern=/\b\d{2}-\d{4}(?:-[A-Z0-9]{1,5})?\b/gi;
const normalize=s=>String(s||'').toLowerCase().replace(/[\u2010-\u2015]/g,'-').replace(/\b(?:lh|left[- ]hand|driver(?:'s)? side)\b/g,'left').replace(/\b(?:rh|right[- ]hand|passenger(?:'s)? side)\b/g,'right').replace(/[^a-z0-9-]+/g,' ').trim();
function tokens(q){return normalize(q).split(/\s+/).filter(Boolean);}
function matches(value,q){const t=normalize(value);return tokens(q).every(x=>t.includes(x));}
function rowsFromText(text,page){
 const result=[];
 // Require a part number and one price on the same printed row, not nearby prose.
 for(const line of String(text||'').split(/\r?\n/)){
  const anchors=[...line.matchAll(skuPattern)];
  for(let i=0;i<anchors.length;i++){
   const anchor=anchors[i],segment=line.slice(anchor.index,anchors[i+1]?.index??line.length);
   if(!/\$\s*\d/.test(segment)||/^\s*#/.test(line.slice(0,anchor.index)))continue;
   const rows=g.DiagramImporter.parse(segment);
   for(const r of rows){
    if(!r.partno||r.price===''||!r.title||r.title.length<3)continue;
    result.push({...r,page,source:'Catalog PDF page '+page});
   }
  }
 }
 return result;
}
function uniqueRows(rows){const seen=new Set();return rows.filter(r=>{const key=[r.partno,r.title.toUpperCase(),r.price,r.application,r.qty].join('|');if(seen.has(key))return false;seen.add(key);return true;});}
function fitment(r){const a=String(r.application||'');if(r.warning&&/years may not|GMC application/i.test(r.warning))return 'other';if(/\b(?:K10|K20|K30|C20|C30|BLAZER|JIMMY|SUBURBAN|GMC)\b/i.test(a)&&!/\b(?:C10|CHEVY|CHEVROLET)\b/i.test(a))return 'other';if(/\b(?:C10|CHEVY|CHEVROLET)\b/i.test(a)&&/\b(?:1968|68|67\s*[-–]\s*(?:68|69|70|71|72)|68\s*[-–]\s*(?:69|70|71|72))\b/i.test(a))return 'possible';return 'verify';}
async function read(file,{active,progress,onTask}){
 const doc=await g.PdfCatalog.open(file,onTask);const pages=[],rows=[],errors=[];
 if(doc.numPages>500)throw Error('PDF exceeds 500 pages. Split it into smaller files.');
 for(let n=1;n<=doc.numPages;n++){
  if(!active())throw Error('Stopped');progress(n,doc.numPages,rows.length);
  let page;try{page=await doc.getPage(n);const c=await page.getTextContent();const text=g.PdfCatalog.linesFromItems(c.items);pages.push({page:n,text:text.slice(0,100000)});rows.push(...rowsFromText(text,n));}catch(e){if(!active())throw e;errors.push(n);}finally{page?.cleanup();}
  if(n%5===0)await new Promise(r=>setTimeout(r,0));
 }
 return {pages,rows:uniqueRows(rows),errors,count:doc.numPages};
}
function search(index,q,category,fit){const list=index.rows.filter(r=>(!category||r.category===category)&&(!fit||fitment(r)!=='other')&&matches([r.title,r.partno,r.application,r.category].join(' '),q));const pages=q?index.pages.filter(p=>matches(p.text,q)).map(p=>p.page):[];return {rows:list,pages};}
g.CatalogBrowser={read,search,rowsFromText,uniqueRows,fitment};
})(globalThis);