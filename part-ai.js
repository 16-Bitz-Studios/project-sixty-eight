
let classifierPromise;
const candidates=[
'front fender','inner fender or wheelhouse','hood','front grille','grille surround','front bumper','rear bumper','headlight assembly','headlight bezel','taillight assembly','door shell','door glass','side mirror','windshield','rear window','cab corner','rocker panel','cab floor pan','cab mount','radiator support','complete truck cab','truck bed side panel','tailgate','truck bed floor','wheel or rim','tire','engine block','cylinder head','complete V8 engine','intake manifold','exhaust manifold','carburetor','valve cover','oil pan','water pump','alternator','starter motor','radiator','fan shroud','transmission','bellhousing','clutch assembly','driveshaft','rear axle differential','leaf spring','coil spring','shock absorber','control arm','steering box','steering column','steering wheel','tie rod','brake drum','brake rotor','brake caliper','brake master cylinder','pedal assembly','fuel tank','instrument gauge cluster','dashboard panel','factory radio','bench seat','interior door panel','wiring harness','truck frame or chassis','complete pickup truck','assorted automotive parts','unrelated object or unclear photo'];
const prompts=candidates.map(x=>'a photograph of a '+x+' from a classic Chevrolet pickup truck');
async function load(){
 if(!classifierPromise)classifierPromise=(async()=>{
  const {pipeline,env}=await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1');
  env.allowLocalModels=false; env.useBrowserCache=true;
  if(env.backends?.onnx?.wasm)env.backends.onnx.wasm.numThreads=1;
  return pipeline('zero-shot-image-classification','Xenova/clip-vit-base-patch32',{device:'wasm',dtype:'q8',progress_callback:p=>{if(p.status==='progress')self.postMessage({type:'progress',file:p.file,progress:p.progress});else if(p.status==='ready')self.postMessage({type:'ready'});}});
 })().catch(e=>{classifierPromise=null;throw e;});
 return classifierPromise;
}
self.onmessage=async e=>{const {id,photo}=e.data||{};if(!id||typeof photo!=='string'||!photo.startsWith('data:image/'))return;try{const classifier=await load();self.postMessage({type:'analyzing',id});const results=await classifier(photo,prompts);const suggestions=results.slice(0,3).map(r=>({label:candidates[prompts.indexOf(r.label)]||r.label,score:r.score}));self.postMessage({type:'result',id,suggestions});}catch(err){self.postMessage({type:'error',id,message:String(err?.message||err)});}};
