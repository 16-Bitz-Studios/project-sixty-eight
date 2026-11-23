/* Project Sixty-Eight: on-device receipt cropping and orientation controls. */
(function(g){
'use strict';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function bounds(a,b){
 const x1=clamp(Math.min(a.x,b.x),0,1),x2=clamp(Math.max(a.x,b.x),0,1);
 const y1=clamp(Math.min(a.y,b.y),0,1),y2=clamp(Math.max(a.y,b.y),0,1);
 if(x2-x1<.04||y2-y1<.04)return null;
 return {x:x1,y:y1,w:x2-x1,h:y2-y1};
}
function px(rect,w,h){return {x:Math.floor(rect.x*w),y:Math.floor(rect.y*h),w:Math.max(1,Math.round(rect.w*w)),h:Math.max(1,Math.round(rect.h*h))};}
async function mount(file,host){
 if(!host||!file)throw Error('Choose a receipt photo first.');
 const bitmap=await createImageBitmap(file);
 let angle=0,rect=null,anchor=null,disposed=false;
 const outer=document.createElement('div');outer.className='receipt-crop-tool';
 outer.innerHTML='<p class="muted">Drag a rectangle around the receipt (include the store name and final total). Cropping out the seat or table helps the text reader.</p><div class="receipt-crop-area"><div class="receipt-crop-stage"><canvas aria-label="Receipt photo; drag from one corner to the opposite corner to crop"></canvas><div class="receipt-crop-highlight" hidden></div></div></div><div class="actions"><button class="btn small" type="button" data-crop="reset">Use entire photo</button><button class="btn small" type="button" data-crop="rotate">Rotate 90°</button></div><p class="muted receipt-crop-note">Entire photo selected. Drag on the image to crop.</p>';
 host.replaceChildren(outer);
 const stage=outer.querySelector('.receipt-crop-stage'),canvas=outer.querySelector('canvas'),box=outer.querySelector('.receipt-crop-highlight'),note=outer.querySelector('.receipt-crop-note');
 const dimensions=()=>angle%180===0?{w:bitmap.width,h:bitmap.height}:{w:bitmap.height,h:bitmap.width};
 function draw(){
  if(disposed)return;
  const {w,h}=dimensions(),scale=Math.min(1,1100/Math.max(w,h));stage.style.width='min(100%, '+Math.round(w/h*56*100)/100+'vh)';
  canvas.width=Math.max(1,Math.round(w*scale));canvas.height=Math.max(1,Math.round(h*scale));
  const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.save();ctx.translate(canvas.width/2,canvas.height/2);ctx.rotate(angle*Math.PI/180);
  ctx.drawImage(bitmap,-bitmap.width*scale/2,-bitmap.height*scale/2,bitmap.width*scale,bitmap.height*scale);ctx.restore();
  paint();
 }
 function paint(){if(rect){box.hidden=false;box.style.left=(rect.x*100)+'%';box.style.top=(rect.y*100)+'%';box.style.width=(rect.w*100)+'%';box.style.height=(rect.h*100)+'%';note.textContent='Cropped area: '+Math.round(rect.w*100)+'% width × '+Math.round(rect.h*100)+'% height.';}else{box.hidden=true;note.textContent='Entire photo selected. Drag on the image to crop.';}}
 function point(ev){const r=canvas.getBoundingClientRect();return {x:clamp((ev.clientX-r.left)/r.width,0,1),y:clamp((ev.clientY-r.top)/r.height,0,1)};}
 canvas.addEventListener('pointerdown',e=>{if(disposed)return;anchor=point(e);rect=null;canvas.setPointerCapture(e.pointerId);paint();e.preventDefault();});
 canvas.addEventListener('pointermove',e=>{if(!anchor)return;rect=bounds(anchor,point(e));paint();e.preventDefault();});
 const end=e=>{if(!anchor)return;rect=bounds(anchor,point(e));anchor=null;paint();};
 canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',()=>{anchor=null;paint()});
 outer.querySelector('[data-crop="reset"]').onclick=()=>{rect=null;paint()};
 outer.querySelector('[data-crop="rotate"]').onclick=()=>{angle=(angle+90)%360;rect=null;draw()};
 draw();
 return {
  extract(maxDimension=3200){
   if(disposed)throw Error('Receipt crop is closed.');
   const {w,h}=dimensions(),selection=rect||{x:0,y:0,w:1,h:1},crop=px(selection,w,h);
   const factor=Math.min(1.8,maxDimension/Math.max(crop.w,crop.h)),cw=Math.ceil(crop.w*factor),ch=Math.ceil(crop.h*factor);
   if(cw*ch>18000000)throw Error('Selected image is too large. Try a smaller crop.');
   const out=document.createElement('canvas');out.width=cw;out.height=ch;
   const ctx=out.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,cw,ch);
   ctx.save();ctx.translate(-crop.x*factor,-crop.y*factor);
   ctx.translate(w*factor/2,h*factor/2);ctx.rotate(angle*Math.PI/180);
   ctx.drawImage(bitmap,-bitmap.width*factor/2,-bitmap.height*factor/2,bitmap.width*factor,bitmap.height*factor);ctx.restore();
   return out;
  },
  selection(){return {angle,rect:rect?{...rect}:null}},
  dispose(){disposed=true;bitmap.close?.();outer.remove();}
 };
}
g.ReceiptCrop={mount,bounds,px};
})(globalThis);