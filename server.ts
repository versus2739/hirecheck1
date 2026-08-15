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
const webAppUrl = process.env.WEB_APP_URL || process.env.PUBLIC_APP_URL || 'https://hirecheck.up.railway.app';
const telegramBase = tgToken ? ('https://' + 'api.telegram.org/bot' + tgToken) : '';

async function telegram(method: string, body: any) {
  if (!tgToken) return;
  const response = await fetch(telegramBase + '/' + method, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  if (!response.ok) console.error('Telegram API error:', response.status, await response.text().catch(() => ''));
}

const hireCheckKeyboard = { inline_keyboard: [[{ text: 'Открыть HireCheck', web_app: { url: webAppUrl } }]] };
const leadKeywords = ['бариста','официант','продавец','кассир','курьер','администратор','повар','мастер маникюра','автомеханик','уборщик','оператор'];
const smallBizWords = ['кафе','ресторан','кофейня','салон','магазин','студия','авто','сервис','клиника','пекарня','бар','доставка'];
function isAdmin(username?: string){ if(!username) return false; return !!db.prepare('SELECT id FROM creator_users WHERE lower(telegram_username)=lower(?)').get(username.replace('@','')); }
function leadMessage(v:any){ const company=v.employer?.name||'Компания'; const title=v.name||'Вакансия'; const city=v.area?.name||'Город не указан'; return `Здравствуйте! Увидел, что у вас открыта вакансия «${title}» (${city}).\n\nМы делаем HireCheck — сервис, который помогает быстро разобрать отклики, выбрать сильных кандидатов и подготовить вопросы для интервью.\n\nМогу показать на вашей вакансии, как это работает?`; }
async function scanHHLeads(limitPerKeyword=8){
  let added=0, seen=0;
  for(const text of leadKeywords){
    const url='https://api.hh.ru/vacancies?per_page='+limitPerKeyword+'&text='+encodeURIComponent(text)+'&only_with_salary=false';
    const r=await fetch(url,{headers:{'User-Agent':'HireCheck lead scanner'}}).catch(()=>null);
    if(!r?.ok) continue;
    const data:any=await r.json();
    for(const v of (data.items||[])){
      seen++;
      const company=(v.employer?.name||'').toLowerCase(); const title=(v.name||'').toLowerCase();
      const fit = smallBizWords.some(w=>company.includes(w)||title.includes(w)) || leadKeywords.some(w=>title.includes(w));
      if(!fit || !v.alternate_url) continue;
      const reason='Активная массовая вакансия на HH.ru; вероятно нужен быстрый разбор откликов.';
      const info=db.prepare('INSERT OR IGNORE INTO sales_leads(source,company_name,vacancy_title,city,vacancy_url,reason,outreach_message,raw_payload) VALUES(?,?,?,?,?,?,?,?)').run('hh',v.employer?.name||'Компания',v.name,v.area?.name,v.alternate_url,reason,leadMessage(v),JSON.stringify(v));
      if(info.changes) added++;
    }
  }
  return {added,seen};
}
async function sendLeadToAdmin(chatId:any, lead:any){
  await telegram('sendMessage',{chat_id:chatId,text:`🔥 Новый лид\n\nКомпания: ${lead.company_name}\nВакансия: ${lead.vacancy_title}\nГород: ${lead.city||'—'}\nИсточник: ${lead.source}\n\nПочему подходит:\n${lead.reason}\n\nСообщение:\n${lead.outreach_message}`,reply_markup:{inline_keyboard:[[{text:'Открыть вакансию',url:lead.vacancy_url}],[{text:'Скрыть',callback_data:'lead_hide_'+lead.id},{text:'Позже',callback_data:'lead_later_'+lead.id},{text:'Связался',callback_data:'lead_contacted_'+lead.id}]]}})
}
app.get('/api/admin/leads',(req,res)=>res.json(db.prepare('SELECT * FROM sales_leads ORDER BY created_at DESC LIMIT 80').all()));
app.post('/api/admin/scan-leads',async(req,res,next)=>{try{res.json(await scanHHLeads())}catch(e){next(e)}});
app.post('/api/admin/leads/:id/status',(req,res)=>{db.prepare('UPDATE sales_leads SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(req.body.status||'new',req.params.id); res.json({ok:true})});

app.post('/api/telegram/webhook', async (req, res) => {
  try {
    const cb=req.body?.callback_query;
    if(cb?.data){ const parts=String(cb.data).split('_'); if(parts[0]==='lead'){ db.prepare('UPDATE sales_leads SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(parts[1],parts[2]); await telegram('answerCallbackQuery',{callback_query_id:cb.id,text:'Сохранено'}); return res.json({ok:true}); }}
    const message = req.body?.message; const chatId = message?.chat?.id; const text = message?.text; const username=message?.from?.username;
    if (!chatId) return res.json({ ok: true });
    if (text === '/admin' && isAdmin(username)) {
      await telegram('sendMessage',{chat_id:chatId,text:'Панель создателя HireCheck\n\n/scan — найти клиентов на HH.ru\n/leads — показать лиды\n/add_admin username — добавить доступ'});
    } else if (text === '/scan' && isAdmin(username)) {
      const result=await scanHHLeads(); await telegram('sendMessage',{chat_id:chatId,text:`Готово: новых лидов ${result.added}, просмотрено вакансий ${result.seen}. Напиши /leads`});
    } else if (text === '/leads' && isAdmin(username)) {
      const leads:any[]=db.prepare("SELECT * FROM sales_leads WHERE status IN ('new','later') ORDER BY created_at DESC LIMIT 5").all() as any[];
      if(!leads.length) await telegram('sendMessage',{chat_id:chatId,text:'Лидов пока нет. Запусти /scan'});
      for(const lead of leads) await sendLeadToAdmin(chatId,lead);
    } else if (text?.startsWith('/add_admin') && isAdmin(username)) {
      const u=text.split(/\s+/)[1]?.replace('@',''); if(u){db.prepare('INSERT OR IGNORE INTO creator_users(telegram_username,role) VALUES(?,?)').run(u,'admin'); await telegram('sendMessage',{chat_id:chatId,text:`Добавлен админ: ${u}`});}
    } else if (text === '/start') {
      await telegram('sendMessage',{chat_id:chatId,text:'Привет! Я HireCheck 👋\n\nПомогаю быстро разбирать отклики, находить сильных кандидатов и готовить вопросы для интервью.\n\nОткрой мини-приложение ниже:',reply_markup:hireCheckKeyboard});
    } else {
      await telegram('sendMessage',{chat_id:chatId,text:'Нажми кнопку ниже, чтобы открыть HireCheck:',reply_markup:hireCheckKeyboard});
    }
    res.json({ ok: true });
  } catch (e: any) { console.error(e); res.status(500).json({ error: e.message || 'Telegram webhook error' }); }
});
app.get('/api/telegram/set-webhook', async (req, res) => {
  try { if (!tgToken) return res.status(400).json({ error: 'TELEGRAM_BOT_TOKEN is not set' }); const response = await fetch(telegramBase + '/setWebhook',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:`${webAppUrl}/api/telegram/webhook`})}); res.json(await response.json()); }
  catch (e:any) { res.status(500).json({ error: e.message || 'Set webhook error' }); }
});

const __dirname=path.dirname(fileURLToPath(import.meta.url)); const web=path.join(__dirname,'../public_dist'); app.use(express.static(web)); app.get('*',(req,res)=>res.sendFile(path.join(web,'index.html')));
app.use((err:any,req:any,res:any,next:any)=>res.status(500).json({error:err.message||'Server error'})); app.listen(process.env.PORT||3000,()=>console.log('HireCheck API started'));
