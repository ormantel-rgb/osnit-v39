const JSON_HEADERS = {'content-type':'application/json; charset=utf-8','cache-control':'no-store'};
const PUBLIC_CACHE = {'content-type':'application/json; charset=utf-8','cache-control':'public, max-age=60, s-maxage=60'};
const TYPES = new Set(['cases','targets','findings']);

function json(data,status=200,headers=JSON_HEADERS){ return new Response(JSON.stringify(data),{status,headers}); }
function now(){ return new Date().toISOString(); }
function id(){ return crypto.randomUUID(); }
function b64(bytes){ let s=''; for(const b of bytes)s+=String.fromCharCode(b); return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
function fromB64(s){ s=s.replace(/-/g,'+').replace(/_/g,'/'); while(s.length%4)s+='='; const bin=atob(s); return Uint8Array.from(bin,c=>c.charCodeAt(0)); }
function cookie(name,value,opts={}){ let x=`${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax`; if(opts.maxAge!==undefined)x+=`; Max-Age=${opts.maxAge}`; return x; }
async function randomBytes(n=32){ const a=new Uint8Array(n); crypto.getRandomValues(a); return a; }
async function hashPassword(password){
  const salt=await randomBytes(16);
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:210000,hash:'SHA-256'},key,256);
  return `pbkdf2$210000$${b64(salt)}$${b64(new Uint8Array(bits))}`;
}
async function verifyPassword(password,stored){
  const [kind,it,saltB64,hashB64]=String(stored).split('$');
  if(kind!=='pbkdf2')return false;
  const salt=fromB64(saltB64), expected=fromB64(hashB64);
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
  const bits=new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:Number(it),hash:'SHA-256'},key,256));
  let diff=bits.length^expected.length; for(let i=0;i<bits.length&&i<expected.length;i++)diff|=bits[i]^expected[i]; return diff===0;
}
async function body(req){ try{return await req.json()}catch{return {}} }
async function auth(req,env){
  if(!env.DB)return null;
  const m=(req.headers.get('Cookie')||'').match(/(?:^|;\s*)osnit_session=([^;]+)/); if(!m)return null;
  const sid=m[1]; const row=await env.DB.prepare(`SELECT s.id,s.user_id,s.expires_at,u.email,u.name FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.expires_at>?`).bind(sid,now()).first();
  return row||null;
}
function normalizeEmail(v){return String(v||'').trim().toLowerCase();}
function validEmail(v){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)&&v.length<=190;}
async function createSession(env,userId){
  const sid=b64(await randomBytes(32)); const expires=new Date(Date.now()+1000*60*60*24*30).toISOString();
  await env.DB.prepare('INSERT INTO sessions(id,user_id,expires_at,created_at) VALUES(?,?,?,?)').bind(sid,userId,expires,now()).run();
  return new Response(null,{status:204,headers:{'set-cookie':cookie('osnit_session',sid,{maxAge:60*60*24*30})}});
}
function userPayload(row){return {id:row.user_id||row.id,email:row.email,name:row.name};}
async function authRoute(req,env,sub){
  if(!env.DB)return json({error:'D1 veritabanı yapılandırılmamış. wrangler.toml içindeki DB binding ayarlanmalı.'},503);
  if(req.method==='GET'&&sub==='me'){const u=await auth(req,env);return u?json({user:userPayload(u)}):json({user:null});}
  if(req.method==='POST'&&sub==='signup'){
    const b=await body(req), email=normalizeEmail(b.email), name=String(b.name||email.split('@')[0]||'Kullanıcı').trim().slice(0,80), password=String(b.password||'');
    if(!validEmail(email)||password.length<10||password.length>200)return json({error:'Geçerli e-posta ve en az 10 karakterlik şifre gerekli.'},400);
    const exists=await env.DB.prepare('SELECT id FROM users WHERE email=?').bind(email).first(); if(exists)return json({error:'Bu e-posta zaten kayıtlı.'},409);
    const uid=id(); await env.DB.prepare('INSERT INTO users(id,email,name,password_hash,created_at) VALUES(?,?,?,?,?)').bind(uid,email,name,await hashPassword(password),now()).run();
    const sid=b64(await randomBytes(32)); const expires=new Date(Date.now()+2592000000).toISOString(); await env.DB.prepare('INSERT INTO sessions(id,user_id,expires_at,created_at) VALUES(?,?,?,?)').bind(sid,uid,expires,now()).run();
    return json({ok:true,user:{id:uid,email,name}},200,{...JSON_HEADERS,'set-cookie':cookie('osnit_session',sid,{maxAge:2592000})});
  }
  if(req.method==='POST'&&sub==='login'){
    const b=await body(req), email=normalizeEmail(b.email), password=String(b.password||''); const u=await env.DB.prepare('SELECT * FROM users WHERE email=?').bind(email).first();
    if(!u||!(await verifyPassword(password,u.password_hash)))return json({error:'E-posta veya şifre hatalı.'},401);
    const sid=b64(await randomBytes(32)), expires=new Date(Date.now()+2592000000).toISOString(); await env.DB.prepare('INSERT INTO sessions(id,user_id,expires_at,created_at) VALUES(?,?,?,?)').bind(sid,u.id,expires,now()).run();
    return json({ok:true,user:{id:u.id,email:u.email,name:u.name}},200,{...JSON_HEADERS,'set-cookie':cookie('osnit_session',sid,{maxAge:2592000})});
  }
  if(req.method==='POST'&&sub==='logout'){
    const m=(req.headers.get('Cookie')||'').match(/(?:^|;\s*)osnit_session=([^;]+)/); if(m)await env.DB.prepare('DELETE FROM sessions WHERE id=?').bind(m[1]).run();
    return new Response(null,{status:204,headers:{'set-cookie':cookie('osnit_session','',{maxAge:0})}});
  }
  return json({error:'Bulunamadı'},404);
}

async function recordsRoute(req,env,type){
  if(!TYPES.has(type))return json({error:'Geçersiz kayıt türü'},400);
  const u=await auth(req,env); if(!u)return json({error:'Oturum gerekli'},401);
  if(req.method==='GET'){
    const rows=await env.DB.prepare('SELECT id,type,title,body,status,created_at,updated_at FROM records WHERE user_id=? AND type=? ORDER BY created_at DESC').bind(u.user_id,type).all();
    return json({items:rows.results||[]});
  }
  const b=await body(req); const title=String(b.title||'').trim().slice(0,200), text=String(b.body||'').slice(0,10000), status=String(b.status||'Açık').slice(0,40);
  if(req.method==='POST'){
    if(!title)return json({error:'Başlık gerekli'},400); const rid=id(), t=now(); await env.DB.prepare('INSERT INTO records(id,user_id,type,title,body,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').bind(rid,u.user_id,type,title,text,status,t,t).run(); return json({item:{id:rid,type,title,body:text,status,created_at:t,updated_at:t}},201);
  }
  const rid=String(b.id||''); if(!rid)return json({error:'Kayıt id gerekli'},400);
  if(req.method==='PUT'){
    const t=now(); await env.DB.prepare('UPDATE records SET title=?,body=?,status=?,updated_at=? WHERE id=? AND user_id=? AND type=?').bind(title,text,status,t,rid,u.user_id,type).run(); return json({ok:true});
  }
  if(req.method==='DELETE'){await env.DB.prepare('DELETE FROM records WHERE id=? AND user_id=? AND type=?').bind(rid,u.user_id,type).run(); return json({ok:true});}
  return json({error:'Method yok'},405);
}

async function proxy(url,requestInit={}){ const r=await fetch(url,{...requestInit,headers:{'user-agent':'OSNIT-APEX/1.0'}}); const text=await r.text(); return new Response(text,{status:r.status,headers:PUBLIC_CACHE}); }

export async function onRequest(context){
  const {request,env}=context; const url=new URL(request.url); const path=url.pathname.replace(/^\/api\/?/,'').replace(/\/$/,'');
  try{
    if(path==='health')return json({ok:true,time:now(),db:!!env.DB,service:'OSNIT APEX serverless'});
    if(path.startsWith('auth/'))return authRoute(request,env,path.slice(5));
    if(path==='cases'||path==='targets'||path==='findings')return recordsRoute(request,env,path);
    if(path==='export'){
      const u=await auth(request,env); if(!u)return json({error:'Oturum gerekli'},401); const rows=await env.DB.prepare('SELECT type,title,body,status,created_at,updated_at FROM records WHERE user_id=? ORDER BY created_at ASC').bind(u.user_id).all(); return json({exported_at:now(),user:userPayload(u),items:rows.results||[]});
    }
    if(path==='news'){
      const region=url.searchParams.get('region')==='world'?'world':'tr'; const q=region==='tr'?'Turkey OR Türkiye sourcelang:turkish':'world OR Asia OR Europe OR Africa OR Americas';
      return proxy(`https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(q)}&mode=artlist&format=json&maxrecords=30&sort=datedesc`);
    }
    if(path==='market')return proxy('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd,try&include_24hr_change=true');
    if(path==='earthquakes')return proxy('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson');
    if(path==='fires')return proxy('https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=100');
    if(path==='dns'){
      const host=(url.searchParams.get('host')||'').trim().toLowerCase(); if(!/^[a-z0-9.-]{1,253}$/.test(host))return json({error:'Geçersiz alan adı'},400);
      return proxy(`https://dns.google/resolve?name=${encodeURIComponent(host)}&type=A`);
    }
    if(path==='ip'){
      const ip=(url.searchParams.get('ip')||'').trim(); if(!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(ip))return json({error:'Yalnızca IPv4 adresi destekleniyor.'},400);
      return proxy(`https://ipwho.is/${encodeURIComponent(ip)}`);
    }
    return json({error:'API endpoint bulunamadı'},404);
  }catch(e){return json({error:'Sunucu hatası',detail:String(e?.message||e)},500)}
}
