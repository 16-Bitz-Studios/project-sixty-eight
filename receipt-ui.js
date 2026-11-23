/* Project Sixty-Eight receipt and invoice UI. Needs ReceiptImport, DiagramImporter and PdfCatalog. */
globalThis.ReceiptUI=(function(){
'use strict';
const app=()=>globalThis.PS68_BRIDGE, $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n=v=>Number(v)||0,fmt=v=>app().money(Number(v)||0);
let draft=null,file=null,run=0,worker=null,busy=false;
const isHEIC=f=>/\.(?:heic|heif)$/i.test(f?.name||'')||/^image\/(?:heic|heif|heic-sequence|heif-sequence)$/i.test(f?.type||'');
let heicLoader=null;
async function loadHeicConverter(){
 if(typeof globalThis.heic2any==='function')return globalThis.heic2any;
 if(!heicLoader)heicLoader=new Promise((resolve,reject)=>{
  const script=document.createElement('script');
  script.src='https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js';
  script.async=true;script.onload=()=>typeof globalThis.heic2any==='function'?resolve(globalThis.heic2any):reject(Error('HEIC decoder did not initialize'));
  script.onerror=()=>reject(Error('Could not load the HEIC decoder. Connect to the internet and retry.'));
  document.head.appendChild(script);
 }).catch(e=>{heicLoader=null;throw e});
 return heicLoader;
}
async function readableImage(f){
 if(!isHEIC(f))return f;
 status('Converting HEIC/HEIF to JPEG locally on this device…');
 const convert=await loadHeicConverter();
 let blob=await convert({blob:f,toType:'image/jpeg',quality:0.9});
 if(Array.isArray(blob))blob=blob[0];
 if(!(blob instanceof Blob)||!blob.size)throw Error('HEIC decoder did not return a usable image.');
 return new File([blob],String(f.name||'receipt').replace(/\.(?:heic|heif)$/i,'')+'.jpg',{type:'image/jpeg',lastModified:f.lastModified||Date.now()});
}
function enhanceCanvas(canvas){const ctx=canvas.getContext('2d',{willReadFrequently:true}),img=ctx.getImageData(0,0,canvas.width,canvas.height),v=img.data;for(let i=0;i<v.length;i+=4){const gray=.299*v[i]+.587*v[i+1]+.114*v[i+2],bright=Math.max(0,Math.min(255,(gray-100)*1.65+120));v[i]=v[i+1]=v[i+2]=bright;}ctx.putImageData(img,0,0);return canvas;}
async function enhancedImage(file){const bitmap=await createImageBitmap(file),canvas=document.createElement('canvas'),scale=Math.min(2.3,2200/Math.max(bitmap.width,bitmap.height));canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();return enhanceCanvas(canvas);}
function row(x={}){return {description:String(x.description||''),sku:String(x.sku||''),qty:Number(x.qty)||1,lineTotal:Number(x.lineTotal)||0,category:app().cats.includes(x.category)?x.category:'General',selected:x.selected!==false,lookupUrl:String(x.lookupUrl||''),lookupNote:String(x.lookupNote||''),partId:String(x.partId||'')};}
function view(){const list=[...(app().data.receipts||[])].sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
 return '<div class="topline"><div><h2>Receipts & invoices</h2><p class="muted">Scan store receipts and online invoices. Record purchased materials and actual spending.</p></div><button class="btn primary" data-action="receiptnew-receipt">+ Scan receipt</button></div>'+
 '<div class="stats"><div class="stat"><span>Invoices recorded</span><strong>'+list.length+'</strong></div><div class="stat"><span>Receipts · CAD</span><strong>'+fmt(list.reduce((sum,r)=>sum+n(r.totalCAD),0))+'</strong></div></div>'+
 '<div class="panel"><p class="muted">Photograph Canadian Tire and other paper receipts, upload PDFs from Amazon or online suppliers, or paste invoice text. Review line items, tax, shipping and final total before saving. Original documents are included in backups and cloud sync when storage allows.</p></div>'+
 '<div class="items">'+(list.length?list.map(receiptCard).join(''):'<div class="empty">No purchases recorded yet. Add your first receipt.</div>')+'</div>';
}
function receiptCard(r){
 const price=fmt(r.totalCAD),id=esc(r.id);
 const lines=r.lines.map((l,i)=>'<div class="rowline"><strong>'+esc(l.description)+'</strong><p class="muted">'+esc(l.sku||'No SKU')+' · '+esc(l.category)+' · Qty '+esc(l.qty)+' · '+Number(l.lineTotal).toFixed(2)+' '+esc(r.currency)+'</p><div class="actions">'+
 (l.sku?'<a class="btn small" href="'+esc(ReceiptImport.searchUrl(r.merchant,l.sku))+'" target="_blank" rel="noopener noreferrer">Search product</a>':'')+
 (l.partId?'<span class="muted">Linked to purchased inventory</span>':/\b(?:eco fee|environmental fee|enviro fee|deposit|recycling levy)\b/i.test(l.description)?'<span class="muted">Purchase fee · not inventory</span>':'<button class="btn small" data-action="receiptpart-receipt" data-id="'+id+'" data-line="'+i+'">Add as purchased part → Inventory</button>')+'</div></div>').join('');
 return '<article class="item"><div><span class="muted">'+esc(r.date)+'</span><h3>'+esc(r.merchant)+'</h3><div class="tags"><span class="tag">'+esc(r.currency)+'</span><span class="tag">'+r.lines.length+' items</span></div><strong>'+price+' CAD</strong>'+
 (r.currency!=='CAD'?'<p class="muted">'+Number(r.total).toFixed(2)+' '+esc(r.currency)+' · Rate '+Number(r.fxRate).toFixed(5)+'</p>':'')+
 '<details class="part-notes"><summary>Purchased items & part numbers</summary>'+lines+'</details></div><div class="actions">'+
 (r.sourceData?'<button class="btn small" data-action="receiptdoc-receipt" data-id="'+id+'">View original</button>':'')+
 '<button class="btn small" data-action="receiptedit-receipt" data-id="'+id+'">Edit</button><button class="btn small danger" data-action="receiptdelete-receipt" data-id="'+id+'">Delete</button></div></article>';
}
function stop(){run++;if(worker)worker.terminate().catch(()=>{});worker=null;busy=false;setBusy(false);}
function status(v){if($('receiptstatus'))$('receiptstatus').textContent=v;}
function summary(){
 if(!$('receiptcount'))return;const selected=draft.lines.filter(l=>l.selected),items=selected.reduce((sum,l)=>sum+n(l.lineTotal),0),total=Number($('rtotal').value),currency=$('rcurrency').value,rate=Number($('rrate').value),cad=currency==='CAD'?total:total*rate;
 $('receiptcount').textContent=selected.length+' selected · Items subtotal '+items.toFixed(2)+' '+currency+' · Invoice '+(Number.isFinite(total)?total.toFixed(2):'?')+' '+currency+(Number.isFinite(cad)&&cad>0?' ≈ '+fmt(cad)+' CAD':' · CAD rate required');
 $('receiptsave').disabled=busy||!Number.isFinite(total)||total<=0||(currency!=='CAD'&&!(rate>0))||!selected.some(l=>l.description.trim());
}
function setBusy(v){busy=v;for(const id of ['receiptcamera','receiptfile','receiptocr','receiptparse','receiptadd','receiptcancel','receiptsave'])if($(id))$(id).disabled=v;if($('receiptstop'))$('receiptstop').hidden=!v;if(!v)summary();}
function editRows(){
 const el=$('receiptrows');if(!el)return;
 el.innerHTML=draft.lines.map((l,i)=>'<div class="panel receipt-line"><label class="check"><input type="checkbox" data-line="'+i+'" data-field="selected" '+(l.selected?'checked':'')+'> <strong>Item '+(i+1)+'</strong></label>'+
 '<label>Product description<input maxlength="200" data-line="'+i+'" data-field="description" value="'+esc(l.description)+'"></label>'+
 '<div class="pair"><label>Product number / SKU<input maxlength="80" data-line="'+i+'" data-field="sku" value="'+esc(l.sku)+'"></label><label>Category<select data-line="'+i+'" data-field="category">'+app().cats.map(c=>'<option'+(c===l.category?' selected':'')+'>'+esc(c)+'</option>').join('')+'</select></label></div>'+
 '<div class="pair"><label>Quantity<input type="number" min="1" step="1" data-line="'+i+'" data-field="qty" value="'+esc(l.qty)+'"></label><label>Line price (before tax)<input type="number" min="0" step=".01" data-line="'+i+'" data-field="lineTotal" value="'+esc(l.lineTotal)+'"></label></div>'+
 '<div class="actions"><button class="btn small" type="button" data-lookup="'+i+'">Find SKU description</button>'+
 (l.sku?'<a class="btn small" target="_blank" rel="noopener noreferrer" href="'+esc(ReceiptImport.searchUrl($('rmerchant').value,l.sku))+'">Search store</a>':'')+
 '<button type="button" class="btn small danger" data-remove="'+i+'">Remove</button></div>'+
 (l.partId?'<p class="muted">Already linked to inventory · '+esc(app().data.parts.find(p=>p.id===l.partId)?.title||l.partId)+'</p>':'')+
 (l.lookupNote?'<p class="muted">'+esc(l.lookupNote)+'</p>':'')+'</div>').join('')||'<p class="muted">No line items detected. Add them manually.</p>';
 for(const input of el.querySelectorAll('[data-field]')){
  const update=()=>{const l=draft.lines[Number(input.dataset.line)];if(!l)return;const k=input.dataset.field;l[k]=k==='selected'?input.checked:k==='qty'||k==='lineTotal'?Number(input.value):input.value;if(k==='sku')l.lookupNote='';summary()};
  input.addEventListener(input.type==='checkbox'||input.tagName==='SELECT'?'change':'input',update);
 }
 el.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.remove);if(draft.lines[i]?.partId)return alert('This line already has an inventory link. Delete the inventory purchase before removing the line.');draft.lines.splice(i,1);editRows()});
 el.querySelectorAll('[data-lookup]').forEach(b=>b.onclick=()=>lookupLine(Number(b.dataset.lookup)));
 summary();
}
function open(id){
 if(busy)return;stop();const prior=app().data.receipts.find(x=>x.id===id);draft=prior?JSON.parse(JSON.stringify(prior)):{id:app().uid(),merchant:'',date:app().dateNow(),currency:'CAD',fxRate:1,subtotal:'',tax:'',total:'',totalCAD:'',lines:[],raw:'',sourceData:'',filename:''};file=null;
 $('receiptheading').textContent=prior?'Edit receipt':'Scan receipt or invoice';
 $('receiptfields').innerHTML='<div class="receipt-form"><p class="muted">Photograph a receipt or import an email invoice PDF. Text recognition is local. Confirm the merchant, product names, quantities, prices, tax and final total before saving.</p>'+
 '<div class="pair"><label>Take photo<input id="receiptcamera" type="file" accept="image/*" capture="environment"></label><label>Choose image or PDF<input id="receiptfile" type="file" accept="image/*,.heic,.heif,application/pdf,.pdf"></label></div>'+
 '<p id="receiptfilename" class="muted">'+esc(draft.filename||'No document selected')+'</p><label class="check"><input type="checkbox" id="receiptenhance" checked> Enhance dark / low-contrast receipt photos for text reading</label><div class="actions"><button type="button" class="btn primary" id="receiptocr">Read receipt</button><button class="btn small danger" type="button" id="receiptstop" hidden>Stop OCR</button></div>'+
 '<p class="muted" id="receiptstatus" role="status">Select a document, or paste invoice text below.</p>'+
 '<details><summary>Paste / correct receipt text</summary><textarea rows="6" id="receiptraw" placeholder="Canadian Tire&#10;2026-11-23&#10;1234567 SANDING DISCS 29.99&#10;TOTAL 33.59">'+esc(draft.raw||'')+'</textarea><button type="button" class="btn small" id="receiptparse">Extract lines from text</button></details>'+
 '<div class="pair"><label>Merchant<input id="rmerchant" maxlength="120" value="'+esc(draft.merchant)+'"></label><label>Purchase date<input type="date" id="rdate" value="'+esc(draft.date)+'"></label></div>'+
 '<div class="pair"><label>Currency<select id="rcurrency">'+['CAD','USD','EUR','GBP','AUD','NZD','JPY','CHF'].map(c=>'<option'+(c===draft.currency?' selected':'')+'>'+c+'</option>').join('')+'</select></label>'+
 '<label>CAD per 1 unit<input id="rrate" type="number" step="any" min="0.000001" value="'+esc(draft.currency==='CAD'?1:draft.fxRate||'')+'"></label></div><button class="btn small" id="receiptfx" type="button">Get Bank of Canada rate</button>'+
 '<div class="pair"><label>Subtotal (optional)<input type="number" min="0" step=".01" id="rsubtotal" value="'+esc(draft.subtotal??'')+'"></label><label>Tax (optional)<input type="number" min="0" step=".01" id="rtax" value="'+esc(draft.tax??'')+'"></label></div>'+
 '<label>Final amount paid including tax / shipping<input type="number" min=".01" step=".01" id="rtotal" value="'+esc(draft.total??'')+'"></label>'+
 '<p class="muted" id="receiptcount"></p><div class="actions"><button class="btn small" type="button" id="receiptadd">+ Add purchased item</button><button class="btn small" type="button" id="receiptlookupall">Look up product numbers</button></div><div id="receiptrows"></div>'+
 '<p class="muted">The final receipt total counts once toward project spending. Individual line prices are not added again. You can send physical parts to Inventory after saving.</p></div>';
 $('receiptcamera').onchange=pick;$('receiptfile').onchange=pick;$('receiptocr').onclick=recognize;$('receiptstop').onclick=()=>{stop();status('Stopped. Reviewed lines are unchanged.')};$('receiptparse').onclick=()=>{if(draft.lines.some(x=>x.partId)){status('Linked inventory lines cannot be replaced by OCR. Edit the existing lines below.');return;}if(draft.lines.length&&!confirm('Replace current line items from this text?'))return;parseText($('receiptraw').value)};
 $('receiptadd').onclick=()=>{draft.lines.push(row({description:'',qty:1}));editRows()};$('receiptlookupall').onclick=lookupAll;$('rcurrency').onchange=()=>{$('rrate').value=$('rcurrency').value==='CAD'?'1':'';summary()};$('rrate').oninput=summary;$('rtotal').oninput=summary;
 $('receiptfx').onclick=fx;$('receiptcancel').onclick=()=>{stop();$('receiptdialog').close()};$('receiptsave').onclick=save;
 $('receiptdialog').oncancel=e=>{if(busy){e.preventDefault();stop();status('OCR stopped. Close again to exit.')}};
 $('receiptdialog').showModal();$('receiptheading').focus({preventScroll:true});editRows();
}
function pick(e){const f=e.target.files?.[0];if(!f)return;if(f.size>15000000){status('Receipt must be under 15 MB. Try a smaller photo or PDF.');e.target.value='';return;}if(draft.lines.some(x=>x.partId)){status('This receipt has items linked to Inventory. Keep the original invoice or delete the receipt before importing a different one.');e.target.value='';return;}if(draft.lines.length&&!confirm('Replace reviewed lines with a new receipt?')){e.target.value='';return;}file=f;draft.sourceData='';draft.filename=f.name;$('receiptfilename').textContent=f.name;status(isHEIC(f)?'HEIC image selected. Tap Read receipt to convert it locally and scan.':'File ready. Tap Read receipt.');}
function parseText(text){const result=ReceiptImport.parse(text);draft.lines=result.lines.map(row);draft.raw=result.raw;draft.merchant=result.merchant;draft.date=result.date||draft.date;if(result.subtotal!==null)draft.subtotal=result.subtotal;if(result.tax!==null)draft.tax=result.tax;if(result.total!==null)draft.total=result.total;
 $('receiptraw').value=draft.raw;$('rmerchant').value=draft.merchant;$('rdate').value=draft.date;$('rsubtotal').value=draft.subtotal??'';$('rtax').value=draft.tax??'';$('rtotal').value=draft.total??'';editRows();status(result.lines.length+' item candidates found. '+result.warnings.join(' ')+' Verify all prices before saving.');}
async function recognize(){
 const f=file;if(!f)return status('Choose a photo or PDF first.');const token=++run;setBusy(true);status('Reading document locally…');
 try{let raw='',source='';
  if(f.type==='application/pdf'||/\.pdf$/i.test(f.name)){
   let task;try{const doc=await PdfCatalog.open(f,x=>task=x),chunks=[];for(let pageNum=1;pageNum<=Math.min(5,doc.numPages);pageNum++){
      if(token!==run)return;const page=await doc.getPage(pageNum);
      try{let text=PdfCatalog.linesFromItems((await page.getTextContent()).items);if(text.trim().length<40){
        const v=page.getViewport({scale:2}),canvas=document.createElement('canvas');canvas.width=Math.ceil(v.width);canvas.height=Math.ceil(v.height);
        await page.render({canvas,canvasContext:canvas.getContext('2d'),viewport:v,background:'white'}).promise;
        text=await DiagramImporter.recognize($('receiptenhance')?.checked?enhanceCanvas(canvas):canvas,m=>{if(token===run)status('Page '+pageNum+': '+m)},w=>{worker=w});canvas.width=canvas.height=1;
      }chunks.push(text);}finally{page.cleanup();}
    }raw=chunks.join('\n');}finally{if(task)await task.destroy().catch(()=>{})}
   source=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||'').replace(/^data:[^;]*;base64,/,'data:application/pdf;base64,'));r.onerror=()=>reject(Error('PDF attachment unavailable'));r.readAsDataURL(f)});
  }else{const readable=await readableImage(f);if(token!==run)return;const enhanced=$('receiptenhance')?.checked;const input=enhanced?await enhancedImage(readable):readable;if(token!==run){if(enhanced){input.width=input.height=1;}return;}raw=await DiagramImporter.recognize(enhanced?input.toDataURL('image/png'):input,m=>{if(token===run)status(m)},w=>{worker=w});if(enhanced){input.width=input.height=1;}source=await app().compressPhoto(readable);if(isHEIC(f)){draft.filename=readable.name;if($('receiptfilename'))$('receiptfilename').textContent=f.name+' → '+readable.name+' (converted locally)';}}
  if(token!==run)return;draft.sourceData=source;parseText(raw);status('Receipt read. Verify every item and the final total before saving.');
 }catch(e){if(token===run)status((isHEIC(f)?'HEIC conversion / scanning failed: ':'Could not read receipt: ')+(e.message||e)+'. Try a JPG/PNG copy, a screenshot, or paste the invoice text.');}
 finally{if(token===run){worker=null;setBusy(false)}}
}
async function lookupLine(i){const l=draft.lines[i];if(!l?.sku)return status('Enter a product number first.');const sku=l.sku,merchant=$('rmerchant').value;status('Looking up '+sku+'…');try{const r=await ReceiptImport.lookup(sku,merchant);if(draft.lines[i]!==l||l.sku!==sku)return;if(confirm('Suggested product description:\n'+r.description+'\n\nUse this description? You should confirm it matches your purchase.')){l.description=r.description;l.category=ReceiptImport.category(r.description);l.lookupUrl=r.url;l.lookupNote=r.note;editRows()}status('Product lookup completed. Paid price unchanged.');}catch(e){status('Store lookup unavailable. Use Search store to find the description and edit it manually.');}}
async function lookupAll(){const items=draft.lines.map((l,i)=>({l,i})).filter(x=>x.l.sku&&!x.l.partId).slice(0,8);if(!items.length)return status('No product numbers to search.');if(!confirm('Search up to '+items.length+' public product numbers using the free page reader? The merchant and SKU will be sent to a public search service; no receipts or payment details are uploaded. Suggested descriptions require your review.'))return;const original=draft;let found=0,failed=0;for(const {l,i} of items){if(draft!==original)return;status('Searching product '+(found+failed+1)+'/'+items.length+' · '+l.sku);try{const result=await ReceiptImport.lookup(l.sku,$('rmerchant').value);if(draft!==original||draft.lines[i]!==l)return;l.lookupNote='Suggested: '+result.description+' (unverified).';if(confirm('Product #'+l.sku+'\nSuggested description: '+result.description+'\n\nUse this description?')){l.description=result.description;l.category=ReceiptImport.category(result.description);l.lookupUrl=result.url;l.lookupNote='Retailer search suggestion; confirm exact product.';}found++;}catch(e){failed++;}editRows();}status(found+' SKU search result(s) · '+failed+' unavailable. Receipt prices unchanged.');}
async function fx(){const c=$('rcurrency').value;if(c==='CAD'){$('rrate').value=1;summary();return;}status('Requesting Bank of Canada rate…');try{const r=await LmcPricing.fx(c);$('rrate').value=r.rate;summary();status('Reference exchange rate from '+r.date+'. Use your bank statement if the actual charge differs.');}catch(e){status('Daily rate unavailable. Enter the actual CAD conversion manually.');}}
async function save(){
 if(busy)return;const r=draft,merchant=$('rmerchant').value.trim(),date=$('rdate').value,currency=$('rcurrency').value,total=Number($('rtotal').value),rate=currency==='CAD'?1:Number($('rrate').value);
 if(!merchant||!date||!Number.isFinite(total)||total<=0||!Number.isFinite(rate)||rate<=0)return status('Merchant, date, final amount and CAD rate are required.');
 const lines=r.lines.filter(l=>l.selected).map(row);if(!lines.length||lines.some(l=>!l.description.trim()||!Number.isInteger(l.qty)||l.qty<1||l.qty>999||!Number.isFinite(l.lineTotal)||l.lineTotal<0))return status('Check the selected item descriptions, quantities and prices.');
 const previous=app().data.receipts.find(x=>x.id===r.id);if(previous&&previous.lines.some(x=>x.partId&&!lines.some(y=>y.partId===x.partId)))return status('Do not deselect a line linked to Inventory. It must remain on this receipt.');
 if(lines.reduce((sum,l)=>sum+l.lineTotal,0)>total+.05&&!confirm('Item prices exceed the invoice total. Is there a discount or refund? Save anyway?'))return;
 const record={...r,merchant,date,currency,total,fxRate:rate,totalCAD:Math.round(total*rate*100)/100,subtotal:$('rsubtotal').value===''?'':Number($('rsubtotal').value),tax:$('rtax').value===''?'':Number($('rtax').value),lines,raw:$('receiptraw').value.slice(0,100000)};
 if(!app().validReceipt(record))return status('Invalid receipt or too-large attachment. Try reducing the PDF/photo size.');
 const duplicate=app().data.receipts.find(x=>x.id!==record.id&&x.merchant.trim().toLowerCase()===record.merchant.trim().toLowerCase()&&x.date===record.date&&Math.abs(Number(x.totalCAD)-record.totalCAD)<0.01);if(duplicate&&!confirm('Another receipt from the same retailer, date and total is already saved. Recording this again may double-count the purchase. Continue anyway?'))return;
 if(!confirm('Record '+merchant+' · '+fmt(record.totalCAD)+' CAD, including taxes, as one paid invoice?'))return;
 const a=app().data.receipts,i=a.findIndex(x=>x.id===record.id);if(i<0)a.unshift(record);else a[i]=record;await app().save();$('receiptdialog').close();file=null;app().render();if(app().saveError)alert('Storage failed. Export a JSON backup now.');
}
function remove(id){const r=app().data.receipts.find(x=>x.id===id);if(!r)return;if(!confirm('Delete '+r.merchant+' receipt and remove '+fmt(r.totalCAD)+' from spending? Linked parts remain in Inventory, and their independent recorded costs will count instead.'))return;app().data.receipts=app().data.receipts.filter(x=>x.id!==id);app().save();app().render();}
function documentFile(id){const r=app().data.receipts.find(x=>x.id===id);if(!r?.sourceData)return;if(r.sourceData.startsWith('data:application/pdf')){const b=atob(r.sourceData.split(',')[1]),bytes=new Uint8Array(b.length);for(let i=0;i<b.length;i++)bytes[i]=b.charCodeAt(i);const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'})),a=document.createElement('a');a.href=url;a.download=String(r.filename||'invoice.pdf').replace(/[^a-z0-9._ -]/gi,'_');a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}else{$('fullphoto').src=r.sourceData;$('photodialog').showModal();}}
async function addPart(id,i){const r=app().data.receipts.find(x=>x.id===id),l=r?.lines[i];if(!l||l.partId)return;if(/\b(?:eco fee|environmental fee|enviro fee|deposit|recycling levy)\b/i.test(l.description))return alert('Fees stay on the receipt and are not added as inventory parts.');if(!l.lineTotal)return alert('A purchased item must have a price.');if(app().existingParts(l).length&&!confirm('This item looks like a part already on your list. Add a separate received purchase anyway?'))return;
 const per=Math.round(l.lineTotal/l.qty*r.fxRate*100)/100,part={id:app().uid(),title:l.description,category:l.category,status:'Received',qty:l.qty,actual:String(per),estimate:'',supplier:r.merchant,partno:l.sku,link:l.lookupUrl||'',receivedDate:r.date,diagramSourceIds:[],notes:'Purchased via '+r.merchant+' receipt dated '+r.date+'. '+Number(l.lineTotal).toFixed(2)+' '+r.currency+' line price. Invoice total (including tax) is counted once in Receipts.'};
 app().addPart(part);l.partId=part.id;await app().save();app().render();if(app().saveError)alert('Could not save; export a JSON backup immediately.');
}
return {view,open,remove,document:documentFile,addPart};
})();