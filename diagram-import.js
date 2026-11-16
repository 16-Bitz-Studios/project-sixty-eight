/* Local screenshot recognition and catalog row parsing. */
(function(g){
'use strict';
const tidy=v=>String(v||'').replace(/[ \t]+/g,' ').trim();
const skuRe=/\b\d{2}-\d{4}(?:-[A-Z0-9]{1,5})?\b/gi;
const partWords=/\b(?:fender|hood|grille|grill|bezel|bumper|cab|rocker|firewall|door|hinge|latch|handle|window|windshield|glass|tailgate|bed|box|panel|floor|mount|bracket|reinforcement|bolt|washer|nut|screw|clip|seal|gasket|trim|molding|moulding|light|lamp|mirror|radiator|support|engine|block|head|manifold|carburetor|pump|alternator|starter|transmission|clutch|axle|spring|shock|steering|brake|caliper|rotor|drum|wheel|tire|bearing|gauge|dash|seat|radio|wiring|harness|fuel tank|filter|hose|belt|bushing|hardware|kit|plug|valve)\b/i;
const skip=/^(?:full parts list|part(?: number)?\s+description|description\s+application|application\s+required|price\s+stock|availability|qty\b|in stock|out of stock|add to cart|shopping cart|image\s*["“]|see page|note:|https?:|required quantity)/i;
function normalize(v){return tidy(v).toLowerCase().replace(/[\u2018\u2019]/g,"'").replace(/\b(?:left[- ]hand|driver(?:'s)?[- ]side|lh|l h)\b/g,'left').replace(/\b(?:right[- ]hand|passenger(?:'s)?[- ]side|rh|r h)\b/g,'right').replace(/\b(?:complete|replacement|new|original|oem|primed|assembly)\b/g,' ').replace(/[^a-z0-9]+/g,' ').trim().split(/\s+/).map(x=>x.length>3&&x.endsWith('s')&&!x.endsWith('ss')?x.slice(0,-1):x).sort().join(' ');}
function fitmentWarning(app){const t=String(app||'');const years=[...t.matchAll(/\b(19[5-9]\d|[5-9]\d)(?:\s*[-–]\s*(19[5-9]\d|[5-9]\d))?\b/g)].map(m=>[Number(m[1])%100,Number(m[2]||m[1])%100]);if(years.length&&!years.some(([a,b])=>a<=68&&b>=68))return 'Listed years may not include 1968.';if(/\bGMC\b/i.test(t)&&!/\bChev(?:y|rolet)\b/i.test(t))return 'GMC application — verify Chevrolet fitment.';return '';}
function row(raw,partno='',callout=''){
 let line=tidy(raw.replace(/[\r\n]+/g,' ')).replace(/[|]/g,' ').replace(/\s+/g,' ');
 if(!line||skip.test(line))return null;
 const money=g.PartImporter.explicitMoney(line),price=money.length===1?money[0].price:null,currency=money.length===1?money[0].currency:'';
 const required=line.match(/(?:required\s*(?:quantity|qty)|reqd|req\.?\s*qty)\s*[:=]?\s*\(?(\d{1,3})\)?/i);
 const appMatch=line.match(/\b(?:Chevy(?:\s+GMC)?|Chevrolet(?:\s+GMC)?|GMC|Fleetside|Stepside|Shortbed|Longbed|1\/2T|3\/4T|1\/2\s+Ton)\b[^$]*?(?:\b(?:19[5-9]\d|[5-9]\d)(?:\s*[-–]\s*(?:19[5-9]\d|[5-9]\d))?\b)/i);
 const application=appMatch?tidy(appMatch[0]):'';
 let title=line.replace(/^\s*\(?\d{1,3}\)?[.)]?\s+/,'').replace(skuRe,'').trim();
 const cuts=[title.search(/\b(?:required\s*(?:quantity|qty)|reqd|availability|in stock|out of stock|add to cart|qty\s*:)\b/i),title.search(/(?:\b(?:CAD|USD|EUR|GBP|AUD|NZD)\s*\$?\s*\d|[$€£]\s*\d)/),application?title.indexOf(application):-1].filter(i=>i>=0);
 if(cuts.length)title=title.slice(0,Math.min(...cuts));
 title=tidy(title.replace(/["“][A-Z]["”]\s*$/,'').replace(/^[\s:;,.|–-]+|[\s:;,.|–-]+$/g,'')).slice(0,200);
 if(!title||!/[a-z]{2}/i.test(title)||skip.test(title)||(!partno&&!partWords.test(title)))return null;
 let qty=required?Number(required[1]):1;
 if(!required&&application){const suffix=line.slice(line.indexOf(application)+application.length);const m=suffix.match(/^\s*\((\d{1,3})\)/);if(m)qty=Number(m[1]);}
 return {title,partno,callout,application,qty:Math.max(1,Math.min(999,qty||1)),price:price===null?'':String(price),currency,category:g.PartImporter.category(title),raw:line.slice(0,1200),warning:[fitmentWarning(application),money.length>1?'Multiple prices in row — enter the correct price.':''].filter(Boolean).join(' '),source:'Text recognition'};
}
function parse(text){
 const lines=String(text||'').slice(0,100000).split(/\r?\n/).map(tidy).filter(Boolean),out=[];
 // Catalog table OCR normally keeps one SKU on a line. Wrapped descriptions and prices
 // can be joined until the next SKU, but never borrow a price from another SKU.
 let current=null;
 const flush=()=>{if(current){const x=row(current.raw,current.partno,current.callout);if(x)out.push(x);current=null;}};
 for(const line of lines){
  if(/^(?:image\s*["“]|note:|see page|if installing|for installation)/i.test(line)){flush();continue;}
  if(skip.test(line)&&!line.match(skuRe)){if(current&&/^(?:required quantity|reqd)\b/i.test(line))current.raw+=' '+line;continue;}
  const skus=[...line.matchAll(skuRe)];
  if(skus.length){flush();for(let i=0;i<skus.length;i++){const m=skus[i],before=line.slice(0,m.index).trim(),callout=i===0?(before.match(/^\(?(\d{1,3})\)?[.)]?$/)?.[1]||''):'';let tail=line.slice(m.index+m[0].length,i+1<skus.length?skus[i+1].index:line.length).trim();const first=tail.match(/^\(?(\d{1,3})\)?\s+/);current={partno:m[0].toUpperCase(),callout:callout||(first?first[1]:''),raw:tail};if(i+1<skus.length)flush();}continue;}
  if(current){if(/^\d{1,3}$/.test(line))continue;if(/^(?:price|availability|qty|in stock|out of stock)\b/i.test(line)&&!/\$\s*\d/.test(line))continue;current.raw+=' '+line;if(current.raw.length>1600)flush();continue;}
  const x=row(line);if(x)out.push(x);
 }
 flush();
 const seen=new Set();return out.filter(x=>{const key=x.partno||normalize(x.title);if(!key||seen.has(key))return false;seen.add(key);return true;}).slice(0,100);
}
function duplicate(a,b){const sku=v=>String(v||'').trim().toUpperCase();if(sku(a.partno)&&sku(b.partno))return sku(a.partno)===sku(b.partno);return !!normalize(a.title)&&normalize(a.title)===normalize(b.title);}
function visualRows(labels){return [...new Set(labels.map(tidy).filter(x=>x&&partWords.test(x)&&!/^(?:truck|car|vehicle|image|diagram|automotive parts)$/i.test(x)))].slice(0,30).map(title=>({title,partno:'',callout:'',application:'',qty:1,price:'',currency:'',category:g.PartImporter.category(title),raw:'',warning:'Visual guess only — verify against the diagram legend.',source:'Visual suggestion'}));}
let loader;
function loadOCR(){if(g.Tesseract)return Promise.resolve(g.Tesseract);if(!loader)loader=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';script.onload=()=>g.Tesseract?resolve(g.Tesseract):reject(Error('OCR library unavailable'));script.onerror=()=>reject(Error('Could not download OCR library'));document.head.appendChild(script)}).catch(e=>{loader=null;throw e});return loader;}
async function recognize(image,progress,onWorker,words=false){const t=await loadOCR();let worker;try{worker=await t.createWorker('eng',1,{workerPath:'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js',corePath:'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1',logger:m=>progress(m.status+(Number.isFinite(m.progress)?' '+Math.round(m.progress*100)+'%':''))});onWorker(worker);await worker.setParameters({tessedit_pageseg_mode:words?'11':'6',preserve_interword_spaces:'1'});const r=await worker.recognize(image);return words?(r.data.words||[]):(r.data.text||'');}finally{if(worker)await worker.terminate().catch(()=>{});onWorker(null);}}
g.DiagramImporter={parse,normalize,duplicate,visualRows,fitmentWarning,recognize};
})(globalThis);
