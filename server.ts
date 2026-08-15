import 'dotenv/config';
import express from 'express'; import cors from 'cors'; import path from 'path'; import { fileURLToPath } from 'url';
import db,{migrate} from './db.js'; import {hhAuthUrl,exchangeCode,employerVacancies,negotiations,resume,resumeToText} from './hh.js'; import {analyzeCandidate} from './ai.js';
migrate(); const app=express(); app.use(cors()); app.use(express.json({limit:'10mb'}));
const companyId=1; db.prepare('INSERT OR IGNORE INTO companies(id,name) VALUES(1,?)').run('Моя компания');
app.get('/api/health',(_,res)=>res.json({ok:true}));
app.get('/api/integrations',(req,res)=>res.json(db.prepare('SELECT id,provider,status,last_synced_at,created_at FROM integrations').all()));
app.get('/api/integrations/hh/connect',(req,res)=>res.json({authUrl:hhAuthUrl('default')}));
app.get('/api/integrations/hh/callback',async(req,res,next)=>{try{const t=await exchangeCode(String(req.query.code)); db.prepare("INSERT INTO integrations(company_id,provider,access_token,refresh_token,token_expires_at,metadata) VALUES(?,?,?,?,datetime(?,'unixepoch'),?)").run(companyId,'hh',t.access_token,t.refresh_token,Math.floor(Date.now()/1000)+(t.expires_in||3600),JSON.stringify(t)); res.redirect(`${process.env.WEB_APP_URL||'/'}?hh=connected`)}catch(e){next(e)}});
app.post('/api/integrations/:id/sync',async(req,res,next)=>{try{const integ:any=db.prepare('SELECT * FROM integrations WHERE id=?').get(req.params.id); if(!integ) return res.status(404).json({error:'integration not found'}); const vac=await employerVacancies(integ.access_token); let jobs=0,apps=0; for(const v of (vac.items||[])){ db.prepare('INSERT OR IGNORE INTO jobs(company_id,integration_id,external_provider,external_job_id,title,description,city,salary_from,salary_to,currency,status,source_url) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(companyId,integ.id,'hh',v.id,v.name,v.description||v.name,v.area?.name,v.salary?.from,v.salary?.to,v.salary?.currency,v.archived?'archived':'active',v.alternate_url); jobs++; const job:any=db.prepare('SELECT * FROM jobs WHERE external_provider=? AND external_job_id=?').get('hh',v.id); let neg; try{neg=await negotiations(integ.access_token,v.id)}catch{continue} for(const n of (neg.items||[])){ const rr=n.resume?.id? await resume(integ.access_token,n.resume.id).catch(()=>null):null; const name=[rr?.first_name,rr?.last_name].filter(Boolean).join(' ')||n.resume?.title||'Кандидат'; db.prepare('INSERT INTO candidates(company_id,full_name,external_provider,external_candidate_id) VALUES(?,?,?,?)').run(companyId,name,'hh',rr?.id||n.id); const candId=(db.prepare('SELECT last_insert_rowid() id').get() as any).id; db.prepare('INSERT OR IGNORE INTO applications(job_id,candidate_id,integration_id,source_provider,external_application_id,external_status,cover_letter,raw_payload,applied_at) VALUES(?,?,?,?,?,?,?,?,?)').run(job.id,candId,integ.id,'hh',n.id,n.state?.name,n.message,JSON.stringify(n),n.created_at); const appRow:any=db.prepare('SELECT * FROM applications WHERE source_provider=? AND external_application_id=?').get('hh',n.id); db.prepare('INSERT INTO resumes(candidate_id,application_id,source_provider,external_resume_id,title,raw_text,raw_payload) VALUES(?,?,?,?,?,?,?)').run(candId,appRow.id,'hh',rr?.id,rr?.title,resumeToText(rr||{}),JSON.stringify(rr||{})); apps++; }} db.prepare('UPDATE integrations SET last_synced_at=CURRENT_TIMESTAMP WHERE id=?').run(integ.id); res.json({jobs,applications:apps});}catch(e){next(e)}});
app.get('/api/jobs',(req,res)=>res.json(db.prepare('SELECT * FROM jobs ORDER BY created_at DESC').all()));
app.get('/api/jobs/:id',(req,res)=>{const job=db.prepare('SELECT * FROM jobs WHERE id=?').get(req.params.id); const apps=db.prepare('SELECT a.*, c.full_name, an.score, an.summary FROM applications a JOIN candidates c ON c.id=a.candidate_id LEFT JOIN ai_analyses an ON an.application_id=a.id WHERE a.job_id=? ORDER BY an.score DESC NULLS LAST, a.created_at DESC').all(req.params.id); res.json({job,applications:apps})});
app.post('/api/applications/:id/analyze',async(req,res,next)=>{try{const a:any=db.prepare('SELECT * FROM applications WHERE id=?').get(req.params.id); const j:any=db.prepare('SELECT * FROM jobs WHERE id=?').get(a.job_id); const r:any=db.prepare('SELECT * FROM resumes WHERE application_id=? ORDER BY id DESC').get(a.id); const out=await analyzeCandidate(j,a,r); db.prepare('INSERT INTO ai_analyses(application_id,model,score,summary,strengths,risks,missing_info,interview_questions,recommended_status,raw_response) VALUES(?,?,?,?,?,?,?,?,?,?)').run(a.id,'gpt-4o-mini',out.score,out.summary,JSON.stringify(out.strengths||[]),JSON.stringify(out.risks||[]),JSON.stringify(out.missing_info||[]),JSON.stringify(out.interview_questions||[]),out.recommended_status,JSON.stringify(out)); res.json(out)}catch(e){next(e)}});
app.post('/api/jobs/:id/analyze-all',async(req,res,next)=>{try{const rows:any[]=db.prepare('SELECT id FROM applications WHERE job_id=?').all(req.params.id) as any[]; let count=0; for(const row of rows){ if(!db.prepare('SELECT id FROM ai_analyses WHERE application_id=?').get(row.id)){ const a:any=db.prepare('SELECT * FROM applications WHERE id=?').get(row.id); const j:any=db.prepare('SELECT * FROM jobs WHERE id=?').get(a.job_id); const r:any=db.prepare('SELECT * FROM resumes WHERE application_id=? ORDER BY id DESC').get(a.id); const out=await analyzeCandidate(j,a,r); db.prepare('INSERT INTO ai_analyses(application_id,model,score,summary,strengths,risks,missing_info,interview_questions,recommended_status,raw_response) VALUES(?,?,?,?,?,?,?,?,?,?)').run(a.id,'gpt-4o-mini',out.score,out.summary,JSON.stringify(out.strengths||[]),JSON.stringify(out.risks||[]),JSON.stringify(out.missing_info||[]),JSON.stringify(out.interview_questions||[]),out.recommended_status,JSON.stringify(out)); count++; }} res.json({analyzed:count})}catch(e){next(e)}});
const tgToken = process.env.TELEGRAM_BOT_TOKEN;
const webAppUrl = process.env.WEB_APP_URL || process.env.PUBLIC_APP_URL || 'https://hirecheck1-production.up.railway.app';

const telegramBase = tgToken ? ('https://' + 'api.telegram.org/bot' + tgToken) : '';

async function telegram(method: string, body: any) {
  if (!tgToken) return;
  const response = await fetch(telegramBase + '/' + method, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    console.error('Telegram API error:', response.status, text);
  }
}

const hireCheckKeyboard = {
  inline_keyboard: [
    [
      {
        text: 'Открыть HireCheck',
        web_app: { url: webAppUrl }
      }
    ]
  ]
};

app.post('/api/telegram/webhook', async (req, res) => {
  try {
    const message = req.body?.message;
    const chatId = message?.chat?.id;
    const text = message?.text;

    if (!chatId) return res.json({ ok: true });

    if (text === '/start') {
      await telegram('sendMessage', {
        chat_id: chatId,
        text:
          'Привет! Я HireCheck 👋\n\n' +
          'Помогаю быстро разбирать отклики, находить сильных кандидатов и готовить вопросы для интервью.\n\n' +
          'Открой мини-приложение ниже:',
        reply_markup: hireCheckKeyboard
      });
    } else {
      await telegram('sendMessage', {
        chat_id: chatId,
        text: 'Нажми кнопку ниже, чтобы открыть HireCheck:',
        reply_markup: hireCheckKeyboard
      });
    }

    res.json({ ok: true });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e.message || 'Telegram webhook error' });
  }
});

app.get('/api/telegram/set-webhook', async (req, res) => {
  try {
    if (!tgToken) return res.status(400).json({ error: 'TELEGRAM_BOT_TOKEN is not set' });
    const webhookUrl = `${webAppUrl}/api/telegram/webhook`;
    const response = await fetch(telegramBase + '/setWebhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: webhookUrl })
    });
    const data = await response.json();
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Set webhook error' });
  }
});


function adminName(req:any){ return String(req.query.username || req.body?.username || '').replace('@',''); }
function requireCreator(req:any,res:any){ const u=adminName(req); if(!u) {res.status(401).json({error:'username required'}); return null;} const row=db.prepare('SELECT * FROM creator_users WHERE lower(telegram_username)=lower(?)').get(u); if(!row){res.status(403).json({error:'creator only'}); return null;} return row; }
app.get('/api/creator/me',(req,res)=>{ const u=adminName(req); const row=u?db.prepare('SELECT * FROM creator_users WHERE lower(telegram_username)=lower(?)').get(u):null; res.json({isCreator:!!row,user:row||null}); });
app.get('/api/creator/summary',(req,res)=>{ if(!requireCreator(req,res)) return; const leads=db.prepare('SELECT COUNT(*) c FROM sales_leads').get() as any; const fresh=db.prepare("SELECT COUNT(*) c FROM sales_leads WHERE status IN ('new','later')").get() as any; const contacted=db.prepare("SELECT COUNT(*) c FROM sales_leads WHERE status='contacted'").get() as any; const admins=db.prepare('SELECT COUNT(*) c FROM creator_users').get() as any; res.json({leads:leads.c,fresh:fresh.c,contacted:contacted.c,admins:admins.c}); });
app.get('/api/creator/admins',(req,res)=>{ if(!requireCreator(req,res)) return; res.json(db.prepare('SELECT id,telegram_username,role,created_at FROM creator_users ORDER BY id').all()); });
app.post('/api/creator/admins',(req,res)=>{ if(!requireCreator(req,res)) return; const username=String(req.body.telegram_username||req.body.newUsername||'').replace('@','').trim(); if(!username) return res.status(400).json({error:'telegram_username required'}); db.prepare('INSERT OR IGNORE INTO creator_users(telegram_username,role) VALUES(?,?)').run(username,req.body.role||'admin'); res.json({ok:true}); });
app.delete('/api/creator/admins/:username',(req,res)=>{ const me=requireCreator(req,res); if(!me) return; const username=String(req.params.username||'').replace('@',''); if(username.toLowerCase()==='blodoyyy') return res.status(400).json({error:'cannot remove owner'}); db.prepare('DELETE FROM creator_users WHERE lower(telegram_username)=lower(?)').run(username); res.json({ok:true}); });
app.get('/api/creator/leads',(req,res)=>{ if(!requireCreator(req,res)) return; res.json(db.prepare('SELECT * FROM sales_leads ORDER BY created_at DESC LIMIT 100').all()); });
app.post('/api/creator/scan',(req,res,next)=>{ if(!requireCreator(req,res)) return; scanHHLeads().then(r=>res.json(r)).catch(next); });
app.post('/api/creator/leads/:id/status',(req,res)=>{ if(!requireCreator(req,res)) return; db.prepare('UPDATE sales_leads SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(req.body.status||'new',req.params.id); res.json({ok:true}); });
app.post('/api/creator/broadcast-test',(req,res)=>{ if(!requireCreator(req,res)) return; res.json({ok:true,message:'Тестовая функция готова. Массовые сообщения не отправляем без подтверждения.'}); });

const __dirname=path.dirname(fileURLToPath(import.meta.url)); const web=path.join(__dirname,'../public_dist'); app.use(express.static(web)); app.get('*',(req,res)=>res.sendFile(path.join(web,'index.html')));
app.use((err:any,req:any,res:any,next:any)=>res.status(500).json({error:err.message||'Server error'})); app.listen(process.env.PORT||3000,()=>console.log('HireCheck API started'));
