(function(g){
'use strict';
const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
const cents=v=>{const n=Number(String(v||'').replace(/[$, ]/g,''));return Number.isFinite(n)&&n>=0&&n<10000000?Math.round(n*100)/100:null};
const totals=/^(?:subtotal|sub total|total\b|grand total|amount due|amount paid|balance due|gst\b|hst\b|pst\b|tax\b|qst\b|shipping|delivery|discount|coupon|savings|cash|change|visa|mastercard|debit|credit card|payment|tender|gift\s*card|gift\s*certificate|invoice|receipt|auth|order no|order number|transaction|store #)/i;
const noise=/^(?:thank you|return|refund|survey|visit us|www\.|https?:|phone|tel\b|qty\s+item|item\s+qty|sku\s+description|description\s+qty|scan|cashier|points|loyalty|terms)/i;
function category(t){return /\b(?:paint|primer|clear coat|spray|sealer|sanding|sandpaper|sand ?discs?|abrasive|body filler|masking|polish|rags?|shop towels?|microfibre|microfiber|gloves?|degreaser|solvent|thinner|compound)\b/i.test(t)?'Paint & finishing':g.PartImporter.category(t);}
function store(t){for(const [re,n] of [[/canadian\s*tire/i,'Canadian Tire'],[/amazon/i,'Amazon'],[/home\s*depot/i,'Home Depot'],[/princess\s*auto/i,'Princess Auto'],[/rock\s*auto/i,'RockAuto'],[/napa\s*auto/i,'NAPA'],[/lmc\s*truck/i,'LMC Truck'],[/walmart/i,'Walmart'],[/costco/i,'Costco']])if(re.test(t.slice(0,2000)))return n;return clean(t.split('\n').find(x=>x.trim().length>3)||'Unknown retailer').slice(0,120);}
function date(t){const m=String(t).match(/\b(20\d\d)[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])\b/);if(m)return m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0');const n=String(t).match(/\b(0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])[-/](20\d\d)\b/);if(n)return n[3]+'-'+n[1].padStart(2,'0')+'-'+n[2].padStart(2,'0');return '';}
function role(line){
 const t=clean(line).replace(/^\W+/,'').toUpperCase();
 if(/^(?:(?:GIFT|GIRL|G1FT|GIF|G\W*I\W*F\W*T)\s*(?:CARD|C[A4]RD)|CARD\s+(?:REDEEMED|BALANCE|PAYMENT)|VISA|MASTERCARD|MASTER\s*CARD|DEBIT|CHANGE|CASH|PAYMENT|TENDER|PAID)\b/.test(t))return 'payment';
 if(/^(?:SUB\s*TOTAL|SUB\s*TOTA|SUBTOTAI?|SUBTOTA[L1I]?|S[U0]BTOTAL)\b/.test(t))return 'subtotal';
 if(/^(?:G[S5]T|6ST|HST|P[S5]T|QST|TAX)(?:\b|\s*[0-9%])/.test(t))return 'tax';
 if(/^(?:(?:GRAND|ORDER)\s+TOTAL|T\s*O\s*T\s*A\s*[L1I]?|T[O0]T[A4][L1I]?|AMOUNT\s+DUE|AMOUNT\s+PAID|BALANCE\s+DUE)(?:\b|\s*\d)/.test(t))return 'total';
 if(totals.test(t)||noise.test(t))return 'other';
 return '';
}
function parse(text){
 const raw=String(text||'').slice(0,100000),lines=raw.split(/\r?\n/).map(clean).filter(Boolean),found=[];let subtotal=null,tax=null,total=null,pastTotal=false,uncertainTotal=false,currency=/\b(?:USD|US\$)\b/i.test(raw)?'USD':'CAD';
 for(let i=0;i<lines.length;i++){
  const line=lines[i],kind=role(line),ending=line.match(/(?:^|\s)\$?\s*(\d{1,7}(?:,\d{3})*\.\d{2})(?:\s*[A-Z])?$/),price=ending?cents(ending[1]):null;
  if(kind==='total'){pastTotal=true;if(price!==null){total=price;if(!/^\s*(?:(?:GRAND |ORDER )?TOTAL(?: DUE)?|AMOUNT DUE|AMOUNT PAID)\b/i.test(line))uncertainTotal=true;}else uncertainTotal=true;continue;}
  if(kind==='subtotal'){pastTotal=true;if(price!==null)subtotal=price;continue;}
  if(kind==='tax'){pastTotal=true;if(price!==null)tax=Math.round(((tax||0)+price)*100)/100;continue;}
  if(kind==='payment'){pastTotal=true;continue;}if(pastTotal||kind||!ending||price===null||price<=0)continue;
  let title=clean(line.slice(0,ending.index));if(!title&&i>=2){const before=lines[i-1],before2=lines[i-2];if(before&&before2&&!totals.test(before)&&!totals.test(before2)&&!noise.test(before)&&!noise.test(before2)&&!/\d+\.\d{2}\s*$/.test(before)&&/\b[A-Za-z]{3,}\b/.test(before)){title=clean(before2+' '+before);}}if(title.length<3||role(title))continue;
  let sku='',qty=1,unitPrice=price;
  const named=title.match(/\b(?:SKU|ITEM(?: NO| #)?|PART(?: NO| #)?|ASIN|UPC)\s*[:#-]?\s*([A-Z0-9][A-Z0-9./-]{3,24})\b/i);
  if(named){sku=named[1].toUpperCase();title=clean(title.replace(named[0],''));}
  else{const lead=title.match(/^(\d{3}-\d{4}-\d|\d{2}-\d{4}(?:-[A-Z0-9]{1,5})?|\d{5,12}|[A-Z]{1,3}-?\d{4,12}(?:-[A-Z0-9]{1,5})?)\s+/i);if(lead){sku=lead[1].toUpperCase();title=clean(title.slice(lead[0].length));}}
  const q=title.match(/^(\d{1,3})\s*[xX*]\s+(.+)$/);if(q&&Number(q[1])<=99){qty=Number(q[1]);title=clean(q[2]);unitPrice=Math.round(price/qty*100)/100;}
  if(!title&&lines[i+1]&&!/\d+\.\d{2}\s*$/.test(lines[i+1])&&!totals.test(lines[i+1]))title=lines[++i];
  if(title.length<2)title=sku?'Product '+sku:'Unidentified purchased item';
  found.push({description:title.slice(0,200),sku,qty,unitPrice,lineTotal:price,category:category(title),raw:line.slice(0,350),selected:true,lookupUrl:'',lookupNote:''});
 }
 const expected=subtotal!==null&&tax!==null?Math.round((subtotal+tax)*100)/100:null;
 const mismatch=expected!==null&&total!==null&&Math.abs(expected-total)>0.02;
 if(mismatch||(uncertainTotal&&expected===null)){total=null;}
 const warnings=[];
 if(mismatch)warnings.push('OCR total disagrees with subtotal + taxes. Check the printed total; a digit may be wrong.');
 if(total===null){warnings.push('Verify and enter the final paid amount from the original receipt.');if(expected!==null)warnings.push('Subtotal + recognized taxes suggest '+expected.toFixed(2)+' '+currency+' (not saved automatically).');}
 if(found.length===0)warnings.push('No reliable purchased items detected. Review the photo and add the item manually if needed.');
 if(subtotal!==null&&found.reduce((n,x)=>n+x.lineTotal,0)>subtotal+0.02)warnings.push('Line amounts exceed the printed subtotal. Review for misread payment lines.');
 return {merchant:store(raw),date:date(raw),currency,subtotal,tax,total,suggestedTotal:total===null?expected:null,lines:found.slice(0,120),raw,warnings};
}
function searchUrl(merchant,sku){const s=encodeURIComponent(String(sku||''));if(/canadian tire/i.test(merchant))return 'https://www.canadiantire.ca/en/search-results.html?q='+s;if(/amazon/i.test(merchant))return 'https://www.amazon.ca/s?k='+s;if(/home depot/i.test(merchant))return 'https://www.homedepot.ca/search?q='+s;if(/princess auto/i.test(merchant))return 'https://www.princessauto.com/en/searchresults?Ntt='+s;if(/rockauto/i.test(merchant))return 'https://www.rockauto.com/en/partsearch/?partnum='+s;return 'https://www.google.com/search?q='+encodeURIComponent(String(merchant)+' '+sku);}
async function lookup(sku,merchant){
 const part=String(sku||'').trim();if(!/^[A-Za-z0-9][A-Za-z0-9./-]{3,32}$/.test(part))throw Error('Enter a valid product number.');
 const url=searchUrl(merchant,part),c=new AbortController(),timer=setTimeout(()=>c.abort(),15000);
 try{
  const response=await fetch('https://r.jina.ai/'+url,{headers:{Accept:'application/json','X-Respond-With':'markdown'},signal:c.signal,credentials:'omit'});
  if(!response.ok)throw Error('Store search blocked. Open the search link instead.');
  const body=await response.text();if(body.length>1000000)throw Error('Search result too large');
  let text=body;try{const v=JSON.parse(body);text=v.data?.content||v.content||body}catch(e){}
  const escape=part.replace(/[^A-Za-z0-9]/g,'\\$&'),exact=new RegExp('(^|[^A-Za-z0-9])'+escape+'(?=$|[^A-Za-z0-9])','i');
  const matches=String(text).split(/\r?\n/).filter(x=>exact.test(x)).map(x=>clean(x.replace(/^\s*#+\s*/,'').replace(/\[([^\]]+)\]\([^)]+\)/g,'$1'))).filter(x=>x.length>=8&&x.length<=180&&/[a-z]{3}/i.test(x));
  if(matches.length!==1)throw Error('No unique exact-SKU product description available. Review manually.');
  return {description:matches[0].slice(0,200),url,note:'Suggested from public search; confirm description.'};
 }finally{clearTimeout(timer)}
}
g.ReceiptImport={parse,category,store,date,cents,searchUrl,lookup};
})(globalThis);