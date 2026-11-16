
let library, quickPromise, deepPromise;
const groups=[
 {name:'Cab and body',prompt:'a detached pickup truck cab, doors, body sheet metal, roof, fenders, hood or body panels',parts:['complete truck cab','front fender','inner fender or wheelhouse','hood','door shell','cab corner','rocker panel','cab floor pan','cab mount','radiator support','windshield','door glass','rear window']},
 {name:'Exterior and bed',prompt:'pickup truck bed, tailgate, grille, chrome trim, lights, bumper or exterior mirror',parts:['truck bed side panel','truck bed floor','complete truck bed','tailgate','front grille','grille surround','front bumper','rear bumper','headlight assembly','headlight bezel','taillight assembly','side mirror']},
 {name:'Engine and cooling',prompt:'automotive engine, cast iron engine block, cylinder heads, manifolds, carburetor, oil pan or cooling and engine accessories',parts:['engine block','cylinder head','complete V8 engine','intake manifold','exhaust manifold','carburetor','valve cover','oil pan','water pump','alternator','starter motor','radiator','fan shroud']},
 {name:'Drivetrain and chassis',prompt:'truck ladder frame, transmission, driveshaft, axle, suspension springs, steering components, wheels or brakes',parts:['transmission','bellhousing','clutch assembly','driveshaft','rear axle differential','leaf spring','coil spring','shock absorber','control arm','steering box','tie rod','brake drum','brake rotor','brake caliper','brake master cylinder','wheel or rim','tire','truck frame or chassis']},
 {name:'Interior and electrical',prompt:'vehicle dashboard, interior trim, seats, instrument gauges, radio, steering wheel or wiring',parts:['steering column','steering wheel','pedal assembly','instrument gauge cluster','dashboard panel','factory radio','bench seat','interior door panel','wiring harness','fuel tank']},
 {name:'Whole vehicle or unknown',prompt:'a whole pickup truck, a collection of mixed parts, a confusing photo or an unrelated object',parts:['complete pickup truck','assorted automotive parts','unrelated object or unclear photo']}
];
const candidates=groups.flatMap(g=>g.parts);
const labels={
 'complete truck cab':'a detached pickup truck cab body shell with a roof, windshield opening, door openings, firewall and sheet metal sides, viewed from any angle',
 'engine block':'a heavy cast metal V8 engine block with cylindrical piston bores and machined surfaces, not a vehicle body',
 'complete truck bed':'a pickup cargo bed box with side walls and a flat cargo floor',
 'complete pickup truck':'a complete classic pickup truck with cab, hood, cargo bed and wheels',
 'cab floor pan':'a stamped sheet metal pickup cab floor with transmission tunnel',
 'truck frame or chassis':'a long bare automotive ladder chassis with frame rails and crossmembers',
 'front grille':'a vintage truck radiator grille with horizontal bars and headlight openings',
 'assorted automotive parts':'multiple different automotive components lying together',
 'unrelated object or unclear photo':'an unrelated object, blurry image, screenshot or scene without a clearly identifiable automotive part'
};
const norm=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const patterns=[
 ['complete truck cab',/\b(?:truck|pickup|vehicle|cab)\b.{0,45}\b(?:cab|cabin|body shell|cab shell)\b|\b(?:cab shell|truck cab|pickup cab|bare cab|detached cab)\b|\b(?:roof|windshield)\b.{0,75}\b(?:door opening|door frame|doorway|windshield opening|firewall)\b|\bdoor openings?\b.{0,75}\b(?:roof|windshield)\b/],
 ['engine block',/\b(?:engine block|motor block|cylinder bores?|piston bores?)\b/],
 ['complete V8 engine',/\b(?:complete engine|v8 engine|engine assembly|complete motor)\b/],
 ['cylinder head',/\b(?:cylinder head|engine head)\b/],
 ['complete truck bed',/\b(?:truck bed|pickup bed|cargo bed|bed box)\b/],
 ['truck frame or chassis',/\b(?:truck frame|ladder frame|frame rails|bare chassis|truck chassis)\b/],
 ['front grille',/\b(?:front grille|radiator grille|front grill|grille)\b/],
 ['cab floor pan',/\b(?:cab floor|floor pan|floorboard)\b/],
 ['rocker panel',/\b(?:rocker panel|sill panel)\b/],
 ['cab corner',/\bcab corner\b/],
 ['front fender',/\b(?:front fender|front wing|fender)\b/],
 ['instrument gauge cluster',/\b(?:gauge cluster|instrument cluster|speedometer)\b/],
 ['door shell',/\b(?:door shell|truck door|car door|door panel)\b/],
 ['tailgate',/\b(?:tailgate|tail gate)\b/],
 ['transmission',/\b(?:transmission|gearbox)\b/],
 ['rear axle differential',/\b(?:differential|rear axle|rear end)\b/]
];
function captionLabels(caption,objects=[]){
 const description=norm(caption);
 const hits=patterns.filter(([,rx])=>rx.test(description)).map(([label])=>label);
 const exactObjects=objects.map(norm);
 for(const label of candidates)if(exactObjects.includes(norm(label))&&!hits.includes(label))hits.push(label);
 // Major assemblies take precedence over their incidental components.
 return [...new Set(hits)].slice(0,6);
}
function rankQuick(groupScores,partScores){
 const first=groupScores[0],top=partScores[0],second=partScores[1];
 if(!first||!top)return {suggestions:[],uncertain:true};
 const unknown=top.label==='unrelated object or unclear photo'||top.label==='assorted automotive parts';
 const uncertain=unknown||first.score<.35||top.score<.28||(second&&top.score-second.score<.055);
 return {suggestions:partScores.filter(x=>!['unrelated object or unclear photo','assorted automotive parts'].includes(x.label)).slice(0,3),uncertain};
}
const progress=p=>{if(p.status==='progress')self.postMessage({type:'progress',file:p.file,progress:p.progress});};
async function lib(){if(!library)library=(async()=>{const l=await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1');l.env.allowLocalModels=false;l.env.useBrowserCache=true;if(l.env.backends?.onnx?.wasm)l.env.backends.onnx.wasm.numThreads=1;return l})();return library;}
async function quick(){if(!quickPromise)quickPromise=(async()=>{const {pipeline}=await lib();return pipeline('zero-shot-image-classification','Xenova/clip-vit-base-patch32',{device:'wasm',dtype:'q8',progress_callback:progress})})().catch(e=>{quickPromise=null;throw e});return quickPromise;}
async function deep(){if(!deepPromise)deepPromise=(async()=>{const {Florence2ForConditionalGeneration,AutoProcessor,AutoTokenizer,RawImage}=await lib();const id='onnx-community/Florence-2-base-ft';const opts={device:'wasm',dtype:'q8',progress_callback:progress};const model=await Florence2ForConditionalGeneration.from_pretrained(id,opts);const processor=await AutoProcessor.from_pretrained(id,{progress_callback:progress});const tokenizer=await AutoTokenizer.from_pretrained(id,{progress_callback:progress});return {model,processor,tokenizer,RawImage}})().catch(e=>{deepPromise=null;throw e});return deepPromise;}
async function quickInspect(photo,category,id){
 const classifier=await quick();self.postMessage({type:'analyzing',id,stage:'Identify general assembly'});
 const groupResults=await classifier(photo,groups.map(g=>g.prompt));
 const groupScores=groupResults.map(r=>({group:groups.find(g=>g.prompt===r.label),score:r.score})).filter(r=>r.group);
 const top=groupScores[0];if(!top)return {suggestions:[],uncertain:true,method:'Quick'};
 let chosen=groupScores.slice(0,2).map(r=>r.group);
 // User-selected categories may broaden the candidates, never force a match.
 const hint=category==='Body & cab'?groups[0]:category==='Engine & drivetrain'?groups[2]:category==='Bed & exterior'?groups[1]:category==='Interior & gauges'||category==='Electrical & wiring'?groups[4]:null;
 if(hint&&!chosen.includes(hint))chosen.push(hint);
 const parts=[...new Set([...chosen.flatMap(g=>g.parts),'unrelated object or unclear photo','assorted automotive parts'])];
 const prompts=parts.map(x=>labels[x]||'a photograph of an automotive '+x);
 self.postMessage({type:'analyzing',id,stage:'Compare specific parts'});
 const scored=(await classifier(photo,prompts)).map(r=>({label:parts[prompts.indexOf(r.label)],score:r.score})).filter(r=>r.label);
 return {...rankQuick(groupScores,scored),assembly:top.group.name,method:'Quick',description:'Assembly and part similarity suggestions; not a visual condition assessment.'};
}
async function runTask(ctx,image,task,max=128){
 const {model,processor,tokenizer}=ctx;
 const prompt=processor.construct_prompts(task);
 const vision=await processor(image);
 const inputs=tokenizer(prompt);
 const ids=await model.generate({...inputs,...vision,max_new_tokens:max,num_beams:1,do_sample:false});
 const decoded=tokenizer.batch_decode(ids,{skip_special_tokens:false})[0];
 return processor.post_process_generation(decoded,task,image.size)[task];
}
async function deepInspect(photo,id,mode){
 const ctx=await deep();const image=await ctx.RawImage.fromURL(photo);
 if(mode==='ocr'){
  self.postMessage({type:'analyzing',id,stage:'Read markings'});
  const text=await runTask(ctx,image,'<OCR>',192);
  return {method:'Marking reader',ocr:typeof text==='string'?text:'',suggestions:[],uncertain:false};
 }
 self.postMessage({type:'analyzing',id,stage:'Describe visible features'});
 const cap=await runTask(ctx,image,'<MORE_DETAILED_CAPTION>',128);
 const description=typeof cap==='string'?cap:'';
 let objects=[],warning='';
 try{self.postMessage({type:'analyzing',id,stage:'Find visible objects'});const od=await runTask(ctx,image,'<OD>',160);objects=Array.isArray(od?.labels)?[...new Set(od.labels.map(String))].slice(0,12):[];}catch(e){warning='Object detection unavailable; description still shown.';}
 const named=captionLabels(description,objects);
 return {method:'Deep inspection',description,objects,suggestions:named.slice(0,3).map(label=>({label,source:'Visual description'})),related:named.slice(3),uncertain:!named.length,warning};
}
self.onmessage=async e=>{const {id,photo,mode='quick',category}=e.data||{};if(!id||typeof photo!=='string'||!photo.startsWith('data:image/'))return;try{const result=mode==='quick'?await quickInspect(photo,category,id):await deepInspect(photo,id,mode);self.postMessage({type:'result',id,...result});}catch(err){self.postMessage({type:'error',id,message:String(err?.message||err)});}};
