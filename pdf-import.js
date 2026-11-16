/* Local PDF catalog extraction: no file upload or paid APIs. */
(function(g){
'use strict';
const base='https://cdn.jsdelivr.net/npm/pdfjs-dist@6.5.438/';
let library;
async function load(){if(!library)library=import(base+'legacy/build/pdf.mjs').then(m=>{m.GlobalWorkerOptions.workerSrc=base+'legacy/build/pdf.worker.min.mjs';return m}).catch(e=>{library=null;throw e});return library;}
function linesFromItems(items){
 const cells=items.filter(x=>typeof x.str==='string'&&x.str.trim()&&Array.isArray(x.transform)).map(x=>({text:x.str.trim(),x:x.transform[4],y:x.transform[5],h:Math.max(1,Math.abs(x.height||x.transform[3]||8)),w:Math.abs(x.width||0)})).filter(x=>Number.isFinite(x.x)&&Number.isFinite(x.y)).sort((a,b)=>b.y-a.y||a.x-b.x);
 const rows=[];for(const c of cells){let r=rows.find(r=>Math.abs(r.y-c.y)<=Math.max(2,Math.min(5,c.h*.35)));if(!r){r={y:c.y,cells:[]};rows.push(r);}r.cells.push(c);}
 return rows.sort((a,b)=>b.y-a.y).map(r=>{let str='',end=null;for(const c of r.cells.sort((a,b)=>a.x-b.x)){if(end!==null&&c.x-end>Math.max(1,c.h*.16))str+=' ';str+=c.text;end=c.x+c.w;}return str.trim();}).filter(Boolean).join('\n');
}
function parsePage(text,page){
 return g.DiagramImporter.parse(text).map(r=>({...r,page,source:'PDF page '+page}));
}
function combinePages(pages){const rows=[],seen=new Map();for(const p of pages){for(const r of parsePage(p.text,p.page)){const key=r.partno?'sku:'+r.partno.toUpperCase():'name:'+g.DiagramImporter.normalize(r.title);const old=seen.get(key);if(old&&old.price===r.price&&old.currency===r.currency&&old.qty===r.qty&&old.application===r.application&&g.DiagramImporter.normalize(old.title)===g.DiagramImporter.normalize(r.title))continue;if(old)r.warning=[r.warning,'Repeated catalog entry with different details — verify before selecting.'].filter(Boolean).join(' ');else seen.set(key,r);rows.push(r);}}return rows;}
function parseText(text){const chunks=String(text||'').split(/^--- PDF page (\d+) ---\s*$/m);if(chunks.length===1)return g.DiagramImporter.parse(text);const pages=[];if(chunks[0].trim())pages.push({page:1,text:chunks[0]});for(let i=1;i<chunks.length;i+=2)pages.push({page:Number(chunks[i]),text:chunks[i+1]||''});return combinePages(pages);}
async function open(file,onTask){const lib=await load(),bytes=new Uint8Array(await file.arrayBuffer());const task=lib.getDocument({data:bytes,isEvalSupported:false,enableXfa:false,cMapUrl:base+'cmaps/',cMapPacked:true,standardFontDataUrl:base+'standard_fonts/',wasmUrl:base+'wasm/'});onTask(task);return task.promise;}
async function pageImage(page){const view=page.getViewport({scale:1}),scale=Math.min(3,2400/Math.max(view.width,view.height));const viewport=page.getViewport({scale}),canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);try{await page.render({canvas,canvasContext:canvas.getContext('2d'),viewport,background:'white'}).promise;return canvas.toDataURL('image/png');}finally{canvas.width=canvas.height=1;}}
async function extract(doc,first,last,{progress,active,onWorker,ocr=true}){
 const pages=[],warnings=[];for(let n=first;n<=last;n++){if(!active())throw Error('Import stopped');progress('Reading PDF page '+n+' of '+last+'…');const page=await doc.getPage(n);try{const content=await page.getTextContent();let text=linesFromItems(content.items),rows=parsePage(text,n);const hasSKU=rows.some(r=>r.partno);if(ocr&&(!rows.length||(!hasSKU&&text.trim().length<100))){try{progress('Page '+n+' has little catalog text; reading image locally…');const image=await pageImage(page);if(!active())throw Error('Import stopped');const scanned=await g.DiagramImporter.recognize(image,p=>progress('Page '+n+': '+p),onWorker);if(!active())throw Error('Import stopped');const ocrRows=parsePage(scanned,n);if(ocrRows.length>rows.length||(!hasSKU&&ocrRows.some(r=>r.partno))){text=scanned;rows=ocrRows;}}catch(e){if(!active())throw e;warnings.push('Page '+n+': image OCR unavailable; embedded text retained.');}}
 if(!rows.length)warnings.push('Page '+n+': no catalog rows recognized.');pages.push({page:n,text:text.slice(0,100000)});}finally{page.cleanup();}}
 const rows=combinePages(pages),text=pages.map(p=>'--- PDF page '+p.page+' ---\n'+p.text).join('\n\n');return {rows,text,warnings,pages};
}
function fileData(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>{const data=String(r.result||'').replace(/^data:[^;]*;base64,/,'data:application/pdf;base64,');if(!/^data:application\/pdf;base64,JVBERi0[A-Za-z0-9+/=]*$/.test(data)){reject(Error('Invalid PDF file'));return;}resolve(data)};r.onerror=()=>reject(Error('Could not retain source PDF'));r.readAsDataURL(file)});}
g.PdfCatalog={open,extract,linesFromItems,combinePages,parseText,fileData};
})(globalThis);
