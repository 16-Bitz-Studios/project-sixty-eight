/* Project Sixty-Eight · opt-in Google Drive backups + guarded two-way sync.
 * The public OAuth client is the same as TruckLedger (same GitHub Pages origin).
 * Cloud records and photos remain private in each person's Drive appDataFolder.
 * No client secret, refresh token, access token or Google files stored in source. */
globalThis.CloudSync=(function(g){
'use strict';
const CLIENT='187913587103-pdc621877o3cdkfvfm1k704dm6kdis0p.apps.googleusercontent.com';
const SCOPE='https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/userinfo.email';
const PREFIX='ProjectSixtyEight_Sync_v1_';
const SAFETY='ProjectSixtyEight_Safety_';
const ACCOUNT_KEY='ps68-drive-account-v1';
const LINK_KEY='ps68-drive-link-v1';
const DEVICE_KEY='ps68-cloud-device-v1';
const API='https://www.googleapis.com/drive/v3/files';
const UPLOAD='https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,createdTime,appProperties,size';
const MAX_RAW=55000000,MAX_BLOB=40000000;
let token='',expires=0,email='',device='',head='',baseHash='',linked=false;
let state='disconnected',message='Connect Google Drive to start automatic backups and cross-device sync.',busy=false,polling=false,queued=false,timer=null,pollTimer=null,lastPush=0,lastFiles=[],conflict=null,suspend=false,initialized=false,nonce=0,connectedAt=0;
const text=s=>String(s??''),html=s=>g.document?String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])):'';
const uid=()=>g.crypto?.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2);
function store(){try{return JSON.parse(localStorage.getItem(LINK_KEY)||'{}')}catch{return {}}}
function saveLink(){try{if(email)localStorage.setItem(ACCOUNT_KEY,email);localStorage.setItem(LINK_KEY,JSON.stringify({email,head,baseHash,device}));}catch(e){}}
function clearLink(){try{localStorage.removeItem(ACCOUNT_KEY);localStorage.removeItem(LINK_KEY);}catch(e){}}
function ready(){return !!token&&Date.now()<expires&&linked}
function setMessage(s,status=state){message=s;state=status;paint()}
function now(){return new Date().toISOString()}
function panel(){
 const label=ready()?'Connected':email?'Reconnect required':'Not connected';
 return '<div class="panel cloud-panel" id="cloudcard"><div class="cloud-heading"><div><h3>Cloud backup & sync</h3><p class="muted">Google Drive · '+html(label)+'</p></div><span class="tag '+(ready()?'done':'')+'">'+html(ready()?'CONNECTED':conflict?'REVIEW NEEDED':state==='error'?'ATTENTION':'LOCAL FIRST')+'</span></div>'+
 (email?'<p class="muted">Account: '+html(email)+'</p>':'')+
 '<p class="muted" id="cloudstatus" role="status">'+html(message)+'</p>'+
 '<div class="actions">'+
 '<button class="btn primary" data-cloud="link" '+(busy?'disabled':'')+'>'+html(email?'Reconnect Google':'Connect Google Drive')+'</button>'+
 '<button class="btn" data-cloud="check" '+(!ready()||busy?'disabled':'')+'>Sync now</button>'+
 '<button class="btn" data-cloud="backup" '+(!ready()||busy?'disabled':'')+'>Back up now</button>'+
 (email?'<button class="btn small" data-cloud="unlink" '+(busy?'disabled':'')+'>Unlink</button>':'')+'</div>'+
 (conflict&&ready()?'<div class="cloud-conflict"><strong>Two versions need your decision</strong><p class="muted">'+html(conflict.reason)+'</p><p class="muted">Neither version has been deleted. Download a local safety backup before choosing.</p><div class="actions"><button class="btn small" data-cloud="download">Download local backup</button><button class="btn small" data-cloud="usecloud" '+(busy?'disabled':'')+'>Use cloud copy</button><button class="btn small" data-cloud="uselocal" '+(busy?'disabled':'')+'>Keep this device copy</button></div></div>':'')+
 '<p class="muted">Changes back up automatically after saving while this app is open and Google is authorized. Another device receives updates when it connects or checks again. Google sign-in must be renewed after the authorization expires; offline edits stay local until then. Keep occasional downloaded JSON backups too.</p></div>';
}
function paint(){const el=document.getElementById('cloudmount');if(el)el.innerHTML=panel();}
function open(){const el=document.getElementById('cloudmount');el?.scrollIntoView({behavior:'smooth',block:'nearest'});}
function init(){if(initialized)return;initialized=true;const prior=store();email=prior.email||localStorage.getItem(ACCOUNT_KEY)||'';head=prior.head||'';baseHash=prior.baseHash||'';device=prior.device||localStorage.getItem(DEVICE_KEY)||uid();try{localStorage.setItem(DEVICE_KEY,device)}catch(e){}paint();document.addEventListener('click',e=>{const b=e.target.closest('[data-cloud]');if(!b)return;e.preventDefault();const act=b.dataset.cloud;if(act==='link')link();if(act==='check')check(true);if(act==='backup')check(true,true);if(act==='unlink')unlink();if(act==='usecloud')useCloud();if(act==='uselocal')useLocal();if(act==='download')downloadLocal();});window.addEventListener('online',()=>{if(ready())schedule(900)});document.addEventListener('visibilitychange',()=>{if(!document.hidden&&ready())check(false)});pollTimer=setInterval(()=>{if(ready()&&!document.hidden)check(false)},60000);}
async function authError(r){try{const j=await r.json();return new Error(j.error?.message||j.error_description||'Google Drive error '+r.status)}catch(e){return new Error('Google Drive error '+r.status)}}
async function drive(url,opts={}){if(!ready())throw Error('Reconnect Google Drive to continue.');const r=await fetch(url,{...opts,headers:{...(opts.headers||{}),Authorization:'Bearer '+token},cache:'no-store'});if(!r.ok){if(r.status===401){token='';expires=0;linked=false;setMessage('Google authorization expired. Reconnect to resume automatic backup.','disconnected')}throw await authError(r)}return r;}
async function grant(){if(!navigator.onLine)throw Error('You are offline. Your local records are still available.');if(!g.google?.accounts?.oauth2)throw Error('Google authorization is unavailable. Open the website in Chrome and retry while online.');return new Promise((resolve,reject)=>{const c=g.google.accounts.oauth2.initTokenClient({client_id:CLIENT,scope:SCOPE,callback:r=>r.error||!r.access_token?reject(Error(r.error_description||r.error||'Google sign-in was cancelled')):resolve(r),error_callback:()=>reject(Error('Google popup closed or blocked. Try Chrome browser.'))});c.requestAccessToken({prompt:'select_account'});});}
async function link(){if(busy)return;busy=true;setMessage('Connecting to Google…','connecting');const old={token,expires,linked,email,head,baseHash};try{
 const grantResult=await grant(),newToken=grantResult.access_token;
 const info=await fetch('https://www.googleapis.com/oauth2/v3/userinfo',{headers:{Authorization:'Bearer '+newToken},cache:'no-store'});if(!info.ok)throw Error('Could not verify the Google account.');
 const person=await info.json(),chosen=text(person.email).toLowerCase();if(!chosen||person.email_verified===false)throw Error('A verified Google account is required.');
 if(email&&chosen!==email)throw Error('This device is linked to '+email+'. Unlink it before using '+chosen+'. Your local data stays intact.');
 token=newToken;expires=Date.now()+Math.max(0,Number(grantResult.expires_in||3600)-60)*1000;linked=true;
 await listFiles();email=chosen;saveLink();connectedAt=Date.now();busy=false;setMessage('Google Drive connected. Checking for safe sync…','connected');await check(true);
 }catch(e){token=old.token;expires=old.expires;linked=old.linked;email=old.email;head=old.head;baseHash=old.baseHash;busy=false;setMessage('Connection failed: '+e.message,'error');}}
function unlink(){if(busy)return;if(!confirm('Unlink Google Drive on this device? Your local restoration data and existing cloud backups will remain.'))return;nonce++;if(timer)clearTimeout(timer);if(token&&g.google?.accounts?.oauth2)g.google.accounts.oauth2.revoke(token,()=>{});token='';expires=0;linked=false;email='';head='';baseHash='';conflict=null;clearLink();setMessage('Account unlinked; local records unchanged.','disconnected');}
async function listFiles(){
 const out=[];let pageToken='',loops=0;
 do{const qs=new URLSearchParams({spaces:'appDataFolder',q:"name contains '"+PREFIX+"' and trashed = false",fields:'nextPageToken,files(id,name,size,createdTime,modifiedTime,appProperties)',pageSize:'1000',orderBy:'createdTime desc'});if(pageToken)qs.set('pageToken',pageToken);const response=await drive(API+'?'+qs),j=await response.json();out.push(...(j.files||[]).filter(f=>f.name?.startsWith(PREFIX)&&f.name.endsWith('.json.gz')&&f.appProperties?.project==='sixty-eight'));pageToken=j.nextPageToken||'';if(++loops>10)throw Error('Too many cloud revisions to verify safely. Download backups and archive old versions.');}while(pageToken);
 lastFiles=out.sort((a,b)=>new Date(a.createdTime)-new Date(b.createdTime));return out;
}
function tips(files){const parents=new Set();for(const f of files)for(const p of String(f.appProperties?.parents||f.appProperties?.parent||'').split(',').filter(Boolean))parents.add(p);return files.filter(f=>!parents.has(f.id));}
function isAncestor(files,ancestor,descendant){if(!ancestor)return false;if(ancestor===descendant)return true;const byId=new Map(files.map(f=>[f.id,f]));const seen=new Set(),queue=[descendant];while(queue.length){const id=queue.shift();if(seen.has(id))continue;seen.add(id);const f=byId.get(id);if(!f)continue;for(const p of String(f.appProperties?.parents||f.appProperties?.parent||'').split(',').filter(Boolean)){if(p===ancestor)return true;queue.push(p);}}return false;}
async function digest(snapshot){const json=JSON.stringify(snapshot);if(!g.crypto?.subtle)throw Error('Secure browser crypto is required for syncing.');const bytes=new TextEncoder().encode(json),d=await g.crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('');}
function localSnapshot(){if(g.fallbackPhotosMissing)throw Error('The photo database is unavailable. Cloud syncing is blocked to protect photos. Restore your full local backup first.');return JSON.parse(JSON.stringify(g.PS68_LOCAL.snapshot()));}
async function localStatus(){const snapshot=localSnapshot();return {snapshot,hash:await digest(snapshot)};}
async function content(file){const r=await drive(API+'/'+encodeURIComponent(file.id)+'?alt=media');if(Number(file.size)>MAX_BLOB)throw Error('Cloud backup is too large for this device.');const bytes=await r.arrayBuffer();if(bytes.byteLength>MAX_BLOB)throw Error('Cloud backup too large.');if(!('DecompressionStream'in g))throw Error('This browser cannot read compressed cloud backups. Use a recent Chrome browser.');const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));const raw=await new Response(stream).text();if(raw.length>MAX_RAW)throw Error('Cloud records too large.');const parsed=JSON.parse(raw);if(parsed.project!=='Project Sixty-Eight'||parsed.version!==1||!g.PS68_LOCAL.valid(parsed.data))throw Error('Invalid Project Sixty-Eight cloud backup.');const hash=await digest(parsed.data);if(hash!==file.appProperties?.hash)throw Error('Cloud backup integrity check failed.');return parsed.data;}
async function create(snapshot,hash,parents=[],safety=false){
 const json=JSON.stringify({project:'Project Sixty-Eight',version:1,savedAt:now(),device,data:snapshot});if(json.length>MAX_RAW)throw Error('Too much local data for a safe cloud backup. Export JSON and reduce large PDF attachments.');if(!('CompressionStream'in g))throw Error('Browser does not support compressed backups. Use recent Chrome.');
 const compressed=await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))).blob();if(compressed.size>MAX_BLOB)throw Error('Cloud backup exceeds 40 MB. Export JSON and remove large attachments first.');
 const name=(safety?SAFETY:PREFIX)+new Date().toISOString().replace(/[:.]/g,'-')+'_'+device+'.json.gz';
 const meta={name,mimeType:'application/gzip',parents:['appDataFolder'],appProperties:{project:'sixty-eight',hash,device,kind:safety?'safety':'sync',...(parents.length?{parents:parents.join(',')}:{})}};
 const boundary='sixtyeight_'+uid().replace(/[^a-z0-9]/gi,'');const body=new Blob(['--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify(meta)+'\r\n--'+boundary+'\r\nContent-Type: application/gzip\r\n\r\n',compressed,'\r\n--'+boundary+'--'],{type:'multipart/related; boundary='+boundary});
 const response=await drive('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size,createdTime,appProperties',{method:'POST',headers:{'Content-Type':'multipart/related; boundary='+boundary},body});
 const file=await response.json();if(!file.id)throw Error('Drive did not confirm upload.');return file;
}

async function pruneOldRevisions(files){
 // Retain 30 newest sync snapshots; never prune safety backups. Keep 7 days.
 if(files.length<=30||!ready())return;
 const current=tips(files);if(current.length!==1||current[0].id!==head)return;
 for(const f of files.slice(0,-30).filter(f=>Date.now()-Date.parse(f.createdTime)>7*86400000).slice(0,20)){
  try{await drive(API+'/'+encodeURIComponent(f.id),{method:'DELETE'})}catch(e){break}
 }
}

function conflictState(reason,remote){conflict={reason,remote};setMessage('Sync requires your decision. Local and cloud records are preserved.','conflict');}
async function check(manual=false,forceBackup=false){
 if(!ready()||busy||polling||document.hidden&&!manual)return;
 polling=true;const cycle=++nonce;try{
  await g.PS68_LOCAL.flush();const local=await localStatus();const files=await listFiles();if(cycle!==nonce)return;
  const newest=tips(files),recent=files.at(-1);
  if(newest.length>1){conflictState('Two devices uploaded different branches. Choose which one should be active. Older snapshots remain in your cloud history.',recent);return;}
  const remote=newest[0]||null;
  if(!remote){if(head){conflictState('Your previously linked cloud history is missing. We will not overwrite local data automatically.',null);return;}await push(local,[],cycle,'Initial automatic backup');return;}
  if(!head){const cloud=await content(remote);if(cycle!==nonce)return;const remoteHash=await digest(cloud);if(remoteHash===local.hash){head=remote.id;baseHash=local.hash;saveLink();conflict=null;setMessage('This device already matches the cloud. Automatic sync is on.','connected');return;}conflictState('This device has not joined the existing cloud history yet. Choose the cloud records or retain this device’s local records.',remote);return;}
  const changed=local.hash!==baseHash;
  if(remote.id===head){if(changed||forceBackup){if(!changed&&forceBackup){const backup=await create(local.snapshot,local.hash,[head],true);setMessage('Additional cloud safety backup saved · '+new Date().toLocaleTimeString(),'connected');return;}await push(local,[head],cycle,'Automatic backup');}else{conflict=null;setMessage('Up to date · '+new Date().toLocaleTimeString(),'connected');}return;}
  if(isAncestor(files,head,remote.id)&&!changed){if(document.querySelector('dialog[open]')){setMessage('New cloud changes are ready. Close open forms to apply them.','connected');return;}const cloud=await content(remote);if(cycle!==nonce)return;await applyCloud(cloud,remote.id);return;}
  if(isAncestor(files,head,remote.id)&&changed){conflictState('This device and another device both changed since the last common backup.',remote);return;}
  conflictState('Cloud revision history diverged or cannot be verified. No records will be replaced automatically.',remote);
 }catch(e){if(cycle===nonce)setMessage('Sync paused: '+e.message,'error');}finally{polling=false;if(queued){queued=false;schedule(1000)}}}
async function push(local,parents,cycle,label){
 if(cycle!==nonce)return;const files=await listFiles();if(cycle!==nonce)return;
 const before=tips(files);if((parents.length&&(!before.length||before.length!==1||before[0].id!==parents[0]))||(!parents.length&&before.length)) {conflictState('Cloud changed while creating a backup. Nothing was overwritten.',before.at(-1)||null);return;}
 const uploaded=await create(local.snapshot,local.hash,parents);if(cycle!==nonce)return;
 const confirmFiles=await listFiles();if(!confirmFiles.some(f=>f.id===uploaded.id))throw Error('Backup upload could not be verified.');
 const headFiles=tips(confirmFiles);if(headFiles.length!==1||headFiles[0].id!==uploaded.id){conflictState('Another device saved at the same time. Both cloud revisions are preserved.',headFiles.at(-1)||null);return;}
 head=uploaded.id;baseHash=local.hash;lastPush=Date.now();saveLink();conflict=null;setMessage(label+' saved to Google Drive · '+new Date().toLocaleTimeString(),'connected');pruneOldRevisions(confirmFiles).catch(()=>{});
}
async function applyCloud(snapshot,id){if(document.querySelector('dialog[open]'))throw Error('Close open forms before applying cloud changes.');
 const prior=await localStatus();if(prior.hash!==baseHash&&head)throw Error('Local data changed while syncing. Review the conflict first.');
 suspend=true;try{await g.PS68_LOCAL.restore(snapshot);head=id;baseHash=await digest(snapshot);saveLink();conflict=null;setMessage('Synced cloud changes to this device · '+new Date().toLocaleTimeString(),'connected');}finally{suspend=false}}
function onSave(){if(suspend||!ready()||conflict)return;schedule(16000)}
function schedule(ms){if(!ready()||conflict||suspend)return;if(timer)clearTimeout(timer);timer=setTimeout(()=>{timer=null;if(polling){queued=true;return;}check(false)},Math.max(ms,lastPush?60000-(Date.now()-lastPush):ms));}
async function downloadLocal(){try{const value=localSnapshot(),url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='project-sixty-eight-local-safety-'+new Date().toISOString().slice(0,10)+'.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);setMessage('Local JSON backup download started.','conflict');}catch(e){setMessage(e.message,'error')}}
async function useCloud(){if(!conflict||!ready()||busy)return;const target=conflict.remote;if(!target){setMessage('Cloud copy is unavailable; download local JSON first.','error');return;}if(!confirm('Use the CLOUD copy on this device? This replaces local records, but first saves the local copy as a separate Google Drive safety backup. Other cloud revisions will remain available as backups.'))return;busy=true;paint();try{const local=await localStatus();await create(local.snapshot,local.hash,[],true);const files=await listFiles(),active=tips(files);if(!active.some(f=>f.id===target.id))throw Error('Cloud changed. Review the latest cloud version before restoring.');const snapshot=await content(target);if(document.querySelector('dialog[open]'))throw Error('Close open forms before restoring.');const hash=await digest(snapshot);let next=target.id;if(active.length>1){const joined=await create(snapshot,hash,active.map(f=>f.id));const verified=tips(await listFiles());if(verified.length!==1||verified[0].id!==joined.id)throw Error('Another device changed the cloud during conflict resolution.');next=joined.id;}suspend=true;try{await g.PS68_LOCAL.restore(snapshot);head=next;baseHash=hash;saveLink();conflict=null;setMessage('Cloud records restored. Previous local and alternate cloud versions remain backed up.','connected');}finally{suspend=false;}}catch(e){setMessage('Restore stopped: '+e.message,'error');}finally{busy=false;paint()}}
async function useLocal(){if(!conflict||!ready()||busy)return;if(!confirm('Keep THIS device’s records as the active cloud version? Another device’s previous cloud snapshot will remain in Google Drive history. This is a deliberate replacement, not an automatic merge.'))return;busy=true;paint();try{const local=await localStatus(),files=await listFiles(),top=tips(files);const parents=top.map(f=>f.id);const uploaded=await create(local.snapshot,local.hash,parents);const verify=await listFiles();if(tips(verify).length!==1||tips(verify)[0].id!==uploaded.id)throw Error('Cloud changed during upload; both backups are retained.');head=uploaded.id;baseHash=local.hash;saveLink();conflict=null;setMessage('This device is now the active cloud copy. Older cloud versions remain backed up.','connected');}catch(e){setMessage('Could not activate local version: '+e.message,'error')}finally{busy=false;paint()}}
return {init,panel,onSave,check,downloadLocal,_testing:{tips,isAncestor,digest}};
})(globalThis);
