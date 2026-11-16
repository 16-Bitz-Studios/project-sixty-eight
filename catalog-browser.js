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
function uniqueRows(rows){const seen=new Set();return rows.filter(r=>{const key=[r.page,r.partno,r.title.toUpperCase(),r.price,r.application,r.qty].join('|');if(seen.has(key))return false;seen.add(key);return true;});}
function fitment(r){const a=String(r.application||'');if(r.warning&&/years may not|GMC application/i.test(r.warning))return 'other';if(/\b(?:K10|K20|K30|C20|C30|BLAZER|JIMMY|SUBURBAN|GMC)\b/i.test(a)&&!/\b(?:C10|CHEVY|CHEVROLET)\b/i.test(a))return 'other';if(/\b(?:C10|CHEVY|CHEVROLET)\b/i.test(a)&&/\b(?:1968|68|67\s*[-–]\s*(?:68|69|70|71|72)|68\s*[-–]\s*(?:69|70|71|72))\b/i.test(a))return 'possible';return 'verify';}
async function read(file,{active,progress,onTask}){
 const doc=await g.PdfCatalog.open(file,onTask);const pages=[],rows=[],errors=[];
 if(doc.numPages>500)throw Error('PDF exceeds 500 pages. Split it into smaller files.');
 for(let n=1;n<=doc.numPages;n++){
  if(!active())throw Error('Stopped');progress(n,doc.numPages,rows.length);
  let page;try{page=await doc.getPage(n);const c=await page.getTextContent();const text=g.PdfCatalog.linesFromItems(c.items);pages.push({page:n,text:text.slice(0,100000)});const diagramRows=g.CatalogDiagrams?.tableRows(c.items,n).rows||[];rows.push(...(diagramRows.length?diagramRows:rowsFromText(text,n)));}catch(e){if(!active())throw e;errors.push(n);}finally{page?.cleanup();}
  if(n%5===0)await new Promise(r=>setTimeout(r,0));
 }
 return {pages,rows:uniqueRows(rows),errors,count:doc.numPages};
}
function search(index,q,category,fit){const list=index.rows.filter(r=>(!category||r.category===category)&&(!fit||fitment(r)!=='other')&&matches([r.title,r.partno,r.application,r.category].join(' '),q));const pages=q?index.pages.filter(p=>matches(p.text,q)).map(p=>p.page):[];return {rows:list,pages};}

// Search related assemblies only for recognized broad terms. Never invent catalog entries.
const systems=[
 {name:'Fuel system',queries:['fuel','fuel system','gas system'],terms:['fuel','gas tank','gas line','gas cap','gas filler','sending unit','sender unit','tank strap','tank mounting','tank vent','filler neck','filler hose','carburetor','carburettor','carburetor linkage','choke cable','accelerator pump']},
 {name:'Brakes',queries:['brake','brakes','brake system'],terms:['brake','master cylinder','wheel cylinder','caliper','rotor','brake drum','proportioning valve','parking brake','brake booster']},
 {name:'Cooling system',queries:['cooling','cooling system','radiator'],terms:['radiator','coolant','water pump','thermostat','fan shroud','heater hose','radiator hose','cooling fan','fan clutch']},
 {name:'Steering',queries:['steering','steering system'],terms:['steering','tie rod','pitman arm','idler arm','drag link','steering shaft','rag joint']},
 {name:'Suspension',queries:['suspension','suspension system'],terms:['suspension','coil spring','leaf spring','shock absorber','control arm','ball joint','sway bar','spring shackle','spring hanger']},
 {name:'Electrical',queries:['electrical','wiring','electrical system'],terms:['electrical','wiring','wire harness','fuse box','alternator','starter','voltage regulator','battery cable','ignition switch','relay']},
 {name:'Fuel tank',queries:['fuel tank','gas tank'],terms:['fuel tank','gas tank','tank strap','tank mounting','tank vent','sending unit','sender unit','filler neck','filler hose','gas cap','fuel cap']},
 {name:'Fuel pump',queries:['fuel pump','gas pump'],terms:['fuel pump','gas pump','fuel pump gasket','fuel pump push rod']},
 {name:'Front fender',queries:['front fender','fender'],terms:['front fender','fender','inner fender','wheelhouse','fender hardware','fender brace']}
];
const words=s=>normalize(s).replace(/-/g,' ').split(/\s+/).filter(Boolean);
function wordMatch(value,query){const text=words(value),q=words(query);return !!q.length&&q.every(t=>text.some(w=>w===t||w===t+'s'||w===t+'es'||t===w+'s'||t===w+'es'));}
function exactQuery(value,query){const q=normalize(query);if(/^\d{2}-\d{4}(?:-[a-z0-9]{1,5})?$/.test(q))return normalize(value).split(/\s+/).includes(q);return wordMatch(value,q);}
function relevance(row,query,system){const title=[row.title,row.partno,row.category].join(' '),all=[title,row.application].join(' ');if(exactQuery(title,query))return 3;if(exactQuery(all,query))return 2;if(system&&system.terms.some(t=>wordMatch(row.title,t)))return 1;return 0;}
function diagramSearch(index,query,category='',fit=true,related=true){
 const q=String(query||'').trim();if(!q)return {groups:[],totalRows:0,system:''};
 const system=related?systems.find(s=>s.queries.includes(words(q).join(' '))):null;
 const groups=new Map(),ensure=page=>{if(!groups.has(page))groups.set(page,{page,rows:[],direct:0,related:0,textOnly:false,score:0,snippet:''});return groups.get(page)};
 for(const r of index.rows){if(category&&r.category!==category||fit&&fitment(r)==='other')continue;const score=relevance(r,q,system);if(!score)continue;const group=ensure(r.page);group.rows.push({row:r,score});if(score>1)group.direct++;else group.related++;group.score=Math.max(group.score,score);}
 // Include text-only pages as a secondary result, even if the parts table was not parsed.
 // Restrict text matches to the query, not a broad synonym across unrelated page prose.
 if(!category)for(const p of index.pages){if(!exactQuery(p.text,q))continue;const group=ensure(p.page);const line=String(p.text).split(/\r?\n/).find(s=>exactQuery(s,q));group.snippet=String(line||'').trim().slice(0,180);if(!group.rows.length){group.textOnly=true;group.score=0;}}
 const result=[...groups.values()];for(const group of result){group.rows.sort((a,b)=>b.score-a.score||a.row.title.localeCompare(b.row.title));}
 result.sort((a,b)=>b.score-a.score||b.direct-a.direct||b.related-a.related||a.page-b.page);
 return {groups:result,totalRows:result.reduce((n,p)=>n+p.rows.length,0),system:system?.name||''};
}

g.CatalogBrowser={read,search,diagramSearch,rowsFromText,uniqueRows,fitment};
})(globalThis);