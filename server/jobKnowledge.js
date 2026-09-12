import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const JOB_FEEDS = [
  {id:'job-radar',url:'https://raw.githubusercontent.com/Jasmine-Liu-min/job-radar/main/data/jobs.json',fallback:'https://api.github.com/repos/Jasmine-Liu-min/job-radar/contents/data/jobs.json?ref=main',format:'json'},
  {id:'campus-radar',url:'https://raw.githubusercontent.com/ruyi1/campus-radar/main/data/jobs.db',fallback:'https://api.github.com/repos/ruyi1/campus-radar/contents/data/jobs.db?ref=main',format:'sqlite'}
];
const HOUR=3600000, DAY=24*HOUR;
export const JOB_RETENTION = {refreshMs:6*HOUR,retryMs:HOUR,freshMs:7*DAY,archiveMs:30*DAY,logMs:30*DAY};

function canonicalUrl(value) {
  try {
    const u=new URL(value);
    if (!['https:','http:'].includes(u.protocol) || u.username || u.password) return '';
    u.hash='';
    for(const key of [...u.searchParams.keys()]) if (/^utm_|^(ref|source)$/i.test(key)) u.searchParams.delete(key);
    u.searchParams.sort(); return u.href;
  } catch { return ''; }
}
const text=(value,max=20000)=>String(value ?? '').trim().slice(0,max);
const millis=value=> {const n=Date.parse(value);return Number.isFinite(n)?n:null};

export function normalizeFeedJob(row,feed,now=Date.now()) {
  const url=canonicalUrl(row.official_url || row.url);
  const title=text(row.title,300),company=text(row.company_name || row.company,200);
  if(!url || !title || !company) return null;
  const observed=millis(row.last_seen);
  // Fetching an old repository snapshot must not renew its records' freshness.
  if(!observed || observed>now+DAY) return null;
  const description=text(row.jd_text || '');
  const typeText=text(row.job_type || row.category,100);
  const type=/实习|intern/i.test(typeText+' '+title)?'internship':/校招|campus|应届/i.test(typeText)?'campus':/社招|social|experienced/i.test(typeText+' '+url)?'social':null;
  return {id:createHash('sha256').update(url).digest('hex'),company,title,url,sourceUrl:url,
    location:text(row.location,300),type,description,requirements:[],source:'domestic-feed',feedId:feed.id,
    // Aggregator jd_text can contain duties only; it does not prove a full JD.
    fullDescriptionVerified:false,officiallyVerifiedAt:null,
    publishedAt:text(row.publish_time,50),deadline:text(row.deadline,50),observedAt:observed,
    sourceFetchedAt:now,closed:Boolean(row.gone)||/^(closed|expired|下线|已关闭)$/i.test(row.status || '')};
}

export async function loadJobFeed(feed,{signal}={}) {
  let bytes,lastError;
  for(const url of [feed.url,feed.fallback].filter(Boolean)) {
    try {
      signal?.throwIfAborted();
      const response=await fetch(url,{headers:{accept:'application/vnd.github.raw+json','user-agent':'ResumeProtocol-JobKnowledge'},signal:signal?AbortSignal.any([signal,AbortSignal.timeout(45000)]):AbortSignal.timeout(45000),redirect:'error'});
      if(!response.ok) throw new Error(`source_http_${response.status}`);
      const chunks=[];let size=0;
      for await(const chunk of response.body) {size+=chunk.length;if(size>20*1024*1024) throw new Error('source_too_large');chunks.push(chunk);}
      bytes=Buffer.concat(chunks);break;
    } catch(error) {lastError=error;if(signal?.aborted || error.message==='source_too_large') throw error;}
  }
  if(!bytes) throw lastError;
  if(feed.format==='json') {
    const rows=JSON.parse(bytes.toString('utf8'));
    if(!Array.isArray(rows) || rows.length>50000) throw new Error('invalid_source_shape');
    return rows;
  }
  const folder=await mkdtemp(path.join(tmpdir(),'resume-job-feed-'));
  const filename=path.join(folder,'feed.sqlite');let db;
  try {
    await writeFile(filename,bytes);
    db=new DatabaseSync(filename,{readOnly:true});
    db.exec('PRAGMA trusted_schema=OFF');
    const table=db.prepare("SELECT type FROM sqlite_master WHERE name='jobs'").get();
    if(table?.type!=='table') throw new Error('invalid_jobs_table');
    // Never read/import applications, profiles, feedback or tracking tables.
    return db.prepare('SELECT company,job_id,title,category,location,url,publish_time,last_seen FROM jobs LIMIT 50000').all();
  } finally {db?.close();await unlink(filename).catch(()=>{});await rmdir(folder).catch(()=>{});}
}

export function createJobKnowledge(db,{clock=Date.now,loader=loadJobFeed,feeds=JOB_FEEDS}={}) {
  db.exec(`CREATE TABLE IF NOT EXISTS job_knowledge_records (
    source_id TEXT NOT NULL, job_id TEXT NOT NULL, payload TEXT NOT NULL,
    observed_at INTEGER NOT NULL, archived_at INTEGER, PRIMARY KEY(source_id,job_id));
    CREATE TABLE IF NOT EXISTS job_knowledge_sources (
    source_id TEXT PRIMARY KEY,last_attempt INTEGER,last_success INTEGER,lease_until INTEGER,lease_owner TEXT,error TEXT,count INTEGER);
    CREATE TABLE IF NOT EXISTS job_knowledge_runs (id TEXT PRIMARY KEY,source_id TEXT,created_at INTEGER,ok INTEGER,count INTEGER,error TEXT);
    CREATE TABLE IF NOT EXISTS job_knowledge_meta (key TEXT PRIMARY KEY,value INTEGER);`);
  let timer,controller,working=null;

  function cleanup(force=false) {
    const now=clock(); const last=db.prepare("SELECT value FROM job_knowledge_meta WHERE key='cleanup'").get()?.value || 0;
    if(!force && now-last<DAY) return;
    db.prepare('UPDATE job_knowledge_records SET archived_at=? WHERE archived_at IS NULL AND observed_at<?').run(now,now-JOB_RETENTION.freshMs);
    db.prepare('DELETE FROM job_knowledge_records WHERE archived_at IS NOT NULL AND archived_at<?').run(now-JOB_RETENTION.archiveMs);
    db.prepare('DELETE FROM job_knowledge_runs WHERE created_at<?').run(now-JOB_RETENTION.logMs);
    db.prepare("INSERT OR REPLACE INTO job_knowledge_meta VALUES ('cleanup',?)").run(now);
  }

  async function sync({force=false,signal}={}) {
    cleanup();
    for(const feed of feeds) {
      if(signal?.aborted) return;
      const now=clock(), owner=randomUUID();
      db.prepare('INSERT OR IGNORE INTO job_knowledge_sources(source_id) VALUES (?)').run(feed.id);
      const state=db.prepare('SELECT * FROM job_knowledge_sources WHERE source_id=?').get(feed.id);
      if(!force && now-(state.last_attempt||0)<(state.error?JOB_RETENTION.retryMs:JOB_RETENTION.refreshMs)) continue;
      const lock=db.prepare('UPDATE job_knowledge_sources SET lease_until=?,lease_owner=?,last_attempt=? WHERE source_id=? AND COALESCE(lease_until,0)<?').run(now+5*60*1000,owner,now,feed.id,now);
      if(!lock.changes) continue;
      try {
        const rows=await loader(feed,{signal});
        const normalized=rows.map(r=>normalizeFeedJob(r,feed,clock())).filter(Boolean);
        if(!normalized.length) throw new Error('empty_or_incompatible_source');
        const at=clock();
        if(db.prepare('SELECT lease_owner FROM job_knowledge_sources WHERE source_id=?').get(feed.id)?.lease_owner!==owner) continue;
        db.exec('BEGIN IMMEDIATE');
        try {
          const upsert=db.prepare('INSERT INTO job_knowledge_records VALUES (?,?,?,?,?) ON CONFLICT(source_id,job_id) DO UPDATE SET payload=excluded.payload,observed_at=excluded.observed_at,archived_at=CASE WHEN excluded.archived_at IS NULL THEN NULL ELSE COALESCE(job_knowledge_records.archived_at,excluded.archived_at) END');
          for(const job of normalized) {
            if(job.observedAt<at-JOB_RETENTION.freshMs-JOB_RETENTION.archiveMs) continue;
            upsert.run(feed.id,job.id,JSON.stringify(job),job.observedAt,job.closed||job.observedAt<at-JOB_RETENTION.freshMs?at:null);
          }
          db.prepare('UPDATE job_knowledge_sources SET last_success=?,error=NULL,count=?,lease_until=0,lease_owner=NULL WHERE source_id=?').run(at,normalized.length,feed.id);
          db.prepare('INSERT INTO job_knowledge_runs VALUES (?,?,?,?,?,?)').run(randomUUID(),feed.id,at,1,normalized.length,null);
          db.exec('COMMIT');
        } catch(error) {db.exec('ROLLBACK');throw error;}
      } catch(error) {
        const message=String(error.message).slice(0,300);
        db.prepare('UPDATE job_knowledge_sources SET error=?,lease_until=0,lease_owner=NULL WHERE source_id=? AND lease_owner=?').run(message,feed.id,owner);
        db.prepare('INSERT INTO job_knowledge_runs VALUES (?,?,?,?,?,?)').run(randomUUID(),feed.id,clock(),0,0,message);
        console.warn(`[job-knowledge] ${feed.id}: ${message}`);
      }
    }
  }

  async function search({query='',type,limit=20}={}) {
    const now=clock();
    const terms=text(query,100).toLowerCase().split(/[\s,，、]+/).filter(Boolean);
    const records=db.prepare('SELECT payload FROM job_knowledge_records WHERE archived_at IS NULL AND observed_at>=?').all(now-JOB_RETENTION.freshMs);
    const unique=new Map();
    for(const row of records) {
      const job=JSON.parse(row.payload);
      if(type && job.type && job.type!==type) continue;
      const haystack=(job.title+' '+job.description).toLowerCase();
      const hits=terms.filter(t=>haystack.includes(t)).length;
      if(terms.length && !hits) continue;
      const existing=unique.get(job.id);
      if(!existing || job.description.length>existing.description.length) unique.set(job.id,{...job,retrievalHits:hits});
    }
    const jobs=[...unique.values()].sort((a,b)=>b.retrievalHits-a.retrievalHits||b.observedAt-a.observedAt).slice(0,Math.min(limit,100));
    return {jobs,sources:db.prepare('SELECT source_id AS id,last_success AS fetchedAt,error FROM job_knowledge_sources').all(),note:jobs.length?'后台资料已检索；公开聚合记录仍需核对完整官方要求。':'当前后台资料没有匹配结果，不能据此断言市场没有岗位。'};
  }

  function start() {
    if(timer) return;
    controller=new AbortController();
    const tick=()=>{if(!working) working=sync({signal:controller.signal}).catch(e=>console.warn('[job-knowledge]',e.message)).finally(()=>{working=null;});};
    tick();timer=setInterval(tick,60*1000);timer.unref();
  }
  async function stop(){clearInterval(timer);timer=null;controller?.abort();await working;}
  return {start,stop,sync,search,cleanup};
}
