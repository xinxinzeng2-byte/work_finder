const sourceReferenceKeys=new Set(['sourceId','sourceRefs','sourceReference']);

export function safePublicUrl(value:unknown):string{
  if(typeof value!=='string'||!(/^(https?:\/\/|mailto:|tel:)/i.test(value)))return '';
  try{
    const url=new URL(value);
    return ['http:','https:','mailto:','tel:'].includes(url.protocol)?value:'';
  }catch{return '';}
}

function parseStoredDocument(value:unknown):Record<string,any>{
  let parsed=value;
  // 历史版本可能把 document 作为字符串再次写进 JSONB；兼容至多两层序列化。
  for(let depth=0;depth<2&&typeof parsed==='string';depth+=1){
    try{parsed=JSON.parse(parsed);}catch{throw new Error('求职主页内容格式无效');}
  }
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error('求职主页内容格式无效');
  return parsed as Record<string,any>;
}

function stripSourceReferences(value:any):any{
  if(Array.isArray(value))return value.map(stripSourceReferences);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!sourceReferenceKeys.has(key)).map(([key,item])=>[key,stripSourceReferences(item)]));
  return value;
}

export function makePublicDocument(value:unknown):Record<string,any>{
  const document=stripSourceReferences(structuredClone(parseStoredDocument(value)));
  document.contacts=Array.isArray(document.contacts)?document.contacts.filter((item:any)=>{
    if(item?.public!==true||typeof item.value!=='string'||!item.value.trim())return false;
    if(['website','github','linkedin'].includes(item.kind))return /^https?:\/\//i.test(item.value);
    if(item.kind==='email')return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(item.value);
    return true;
  }).map((item:any)=>({...item,value:String(item.value||'')})):[];
  if(document.primaryAction?.href)document.primaryAction.href=safePublicUrl(document.primaryAction.href);
  if(document.primaryAction?.contactId&&!document.contacts.some((item:any)=>item.id===document.primaryAction.contactId))document.primaryAction={label:'联系我'};
  return document;
}
