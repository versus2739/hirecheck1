import React,{useEffect,useMemo,useState} from 'react';
import {createRoot} from 'react-dom/client';
import './style.css';

const API=import.meta.env.VITE_API_URL||'';

type Integration={id:number;provider:string;status:string;last_synced_at?:string;created_at?:string};
type Job={id:number;title:string;city?:string;external_provider?:string;status?:string;created_at?:string};
type JobDetails={job:Job;applications:any[]};
type Tab='home'|'jobs'|'candidates'|'integrations'|'creator';

function App(){
  const [ints,setInts]=useState<Integration[]>([]);
  const [jobs,setJobs]=useState<Job[]>([]);
  const [job,setJob]=useState<JobDetails|null>(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState('');
  const [toast,setToast]=useState('');
  const [query,setQuery]=useState('');
  const [tab,setTab]=useState<Tab>('home');
  const tgUser=(window as any).Telegram?.WebApp?.initDataUnsafe?.user;
  const isCreator=['blodoyyy'].includes(String(tgUser?.username||'').toLowerCase());
  const username=String(tgUser?.username||'Blodoyyy');
  const [creatorSummary,setCreatorSummary]=useState<any>(null);
  const [creatorLeads,setCreatorLeads]=useState<any[]>([]);
  const [creatorAdmins,setCreatorAdmins]=useState<any[]>([]);
  const [adminModal,setAdminModal]=useState(false);
  const [adminInput,setAdminInput]=useState('');

  function notify(text:string){setToast(text); setTimeout(()=>setToast(''),3200)}
  async function load(){
    setLoading(true);
    try{
      const [i,j]=await Promise.all([
        fetch(API+'/api/integrations').then(r=>r.json()),
        fetch(API+'/api/jobs').then(r=>r.json())
      ]);
      setInts(Array.isArray(i)?i:[]); setJobs(Array.isArray(j)?j:[]);
    }catch(e:any){notify('Не удалось загрузить данные')}
    finally{setLoading(false)}
  }
  useEffect(()=>{load()},[]);
  useEffect(()=>{
    const tg=(window as any).Telegram?.WebApp;
    if(!tg) return;
    try{tg.ready?.();tg.expand?.();tg.setHeaderColor?.('#071827');tg.setBackgroundColor?.('#071827');tg.setBottomBarColor?.('#071827');tg.requestFullscreen?.();}catch(e){}
  },[]);

  async function connectHH(){
    setBusy('hh');
    try{const r=await fetch(API+'/api/integrations/hh/connect').then(r=>r.json()); location.href=r.authUrl}
    catch{notify('HH пока не подключён')}
    finally{setBusy('')}
  }
  async function sync(id:number){
    setBusy('sync-'+id);
    try{const r=await fetch(API+`/api/integrations/${id}/sync`,{method:'POST'}).then(r=>r.json()); notify(`Синхронизация: ${r.jobs||0} вакансий, ${r.applications||0} откликов`); load()}
    catch{notify('Ошибка синхронизации')}
    finally{setBusy('')}
  }
  async function openJob(id:number){
    setBusy('job-'+id);
    try{setJob(await fetch(API+`/api/jobs/${id}`).then(r=>r.json()))}
    catch{notify('Не удалось открыть вакансию')}
    finally{setBusy('')}
  }
  async function analyzeAll(){
    if(!job) return;
    setBusy('analyze');
    try{const r=await fetch(API+`/api/jobs/${job.job.id}/analyze-all`,{method:'POST'}).then(r=>r.json()); notify(`AI проанализировал: ${r.analyzed||0}`); openJob(job.job.id)}
    catch{notify('Ошибка AI-анализа')}
    finally{setBusy('')}
  }

  const filteredJobs=useMemo(()=>jobs.filter(j=>(j.title||'').toLowerCase().includes(query.toLowerCase())||(j.city||'').toLowerCase().includes(query.toLowerCase())),[jobs,query]);
  const allApps=job?.applications||[];
  const totalApps=allApps.length;
  const analyzed=allApps.filter(a=>a.score!=null).length;
  const avg=allApps.length?Math.round(allApps.reduce((s,a)=>s+(Number(a.score)||0),0)/Math.max(1,analyzed)):0;


  async function loadCreator(){
    if(!isCreator) return;
    try{
      const qs='?username='+encodeURIComponent(username);
      const [summary,leads,admins]=await Promise.all([
        fetch(API+'/api/creator/summary'+qs).then(r=>r.json()),
        fetch(API+'/api/creator/leads'+qs).then(r=>r.json()),
        fetch(API+'/api/creator/admins'+qs).then(r=>r.json())
      ]);
      setCreatorSummary(summary); setCreatorLeads(Array.isArray(leads)?leads:[]); setCreatorAdmins(Array.isArray(admins)?admins:[]);
    }catch{notify('Не удалось загрузить панель создателя')}
  }
  async function creatorScan(){
    setBusy('creator-scan');
    try{const r=await fetch(API+'/api/creator/scan?username='+encodeURIComponent(username),{method:'POST'}).then(r=>r.json()); notify(`Скан готов: новых ${r.added||0}, просмотрено ${r.seen||0}`); await loadCreator();}
    catch{notify('Ошибка скана')}
    finally{setBusy('')}
  }
  async function leadStatus(id:number,status:string){
    await fetch(API+`/api/creator/leads/${id}/status?username=${encodeURIComponent(username)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status})});
    await loadCreator();
  }
  async function addCreatorAdmin(){
    const u=adminInput.replace('@','').trim(); if(!u) return notify('Введи Telegram username');
    await fetch(API+'/api/creator/admins?username='+encodeURIComponent(username),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({telegram_username:u})});
    setAdminInput(''); setAdminModal(false); notify('Админ добавлен'); await loadCreator();
  }
  useEffect(()=>{ if(tab==='creator') loadCreator(); },[tab]);

  if(job){
    return <main className="app">
      <div className="orb orb1"/><div className="orb orb2"/>{toast&&<div className="toast">{toast}</div>}
      <section className="hero compact"><button className="back" onClick={()=>setJob(null)}>← Все вакансии</button><div className="heroText"><span className="eyebrow">Карточка вакансии</span><h1>{job.job.title}</h1><p>{job.job.city||'Город не указан'} · {totalApps} откликов</p></div><button className="primary pulse" onClick={analyzeAll} disabled={busy==='analyze'}>{busy==='analyze'?'Анализирую…':'AI-анализ всех'}</button></section>
      <section className="stats"><div><b>{totalApps}</b><span>откликов</span></div><div><b>{analyzed}</b><span>разобрано AI</span></div><div><b>{avg||'—'}</b><span>средний score</span></div></section>
      <section className="sectionHead"><h2>Кандидаты</h2><p>Сортировка по AI-оценке: лучшие сверху.</p></section>
      <div className="candidateList">{allApps.map((a:any)=><article className="candidate" key={a.id}><div className="avatar">{(a.full_name||'К')[0]}</div><div className="candidateBody"><div className="row"><h3>{a.full_name}</h3><Score score={a.score}/></div><p>{a.summary||'Пока не анализировался — нажми AI-анализ всех, чтобы получить вывод, риски и вопросы.'}</p><div className="tags"><span>{a.external_status||a.internal_status||'Новый'}</span><span>Источник: HH</span></div></div></article>)}</div>
    </main>
  }

  return <main className="app">
    <div className="orb orb1"/><div className="orb orb2"/>{toast&&<div className="toast">{toast}</div>}
    <section className="hero">
      <div className="brandMark"><div className="docIcon"><i/><i/></div><span>✓</span></div>
      <div className="heroText"><span className="eyebrow">AI hiring assistant</span><h1>HireCheck</h1><p>AI-скрининг кандидатов: собирай отклики, ранжируй лучших и получай вопросы для интервью за минуты.</p><div className="heroActions"><button className="primary" onClick={connectHH} disabled={busy==='hh'}>{busy==='hh'?'Открываю HH…':'Подключить HH.ru'}</button><button className="secondary" onClick={load}>Обновить</button></div></div>
    </section>
    <section className="stats"><div><b>{ints.length}</b><span>интеграций</span></div><div><b>{jobs.length}</b><span>вакансий</span></div><div><b>AI</b><span>оценка резюме</span></div></section>

    {tab==='home'&&<div className="tabPane" key="home"><HomeTab isCreator={isCreator}/></div>}    
    {tab==='integrations'&&<div className="tabPane" key="integrations"><IntegrationsTab ints={ints} busy={busy} connectHH={connectHH} sync={sync}/></div>}    
    {tab==='jobs'&&<div className="tabPane" key="jobs"><JobsTab loading={loading} filteredJobs={filteredJobs} query={query} setQuery={setQuery} openJob={openJob}/></div>}    
    {tab==='candidates'&&<div className="tabPane" key="candidates"><CandidatesTab setTab={setTab}/></div>}    
    {tab==='creator'&&isCreator&&<div className="tabPane" key="creator"><CreatorTab summary={creatorSummary} leads={creatorLeads} admins={creatorAdmins} busy={busy} scan={creatorScan} reload={loadCreator} addAdmin={()=>setAdminModal(true)} setLeadStatus={leadStatus}/></div>}    

    {adminModal&&<div className="modalBackdrop" onClick={()=>setAdminModal(false)}><div className="creatorModal" onClick={e=>e.stopPropagation()}><button className="modalClose" onClick={()=>setAdminModal(false)}>×</button><div className="modalIcon">👑</div><h3>Добавить создателя</h3><p>Этот пользователь увидит вкладку «Создатель» и сможет управлять лидами.</p><label>Telegram username</label><div className="adminInputWrap"><span>@</span><input autoFocus value={adminInput} onChange={e=>setAdminInput(e.target.value)} placeholder="username"/></div><div className="modalActions"><button className="secondary" onClick={()=>setAdminModal(false)}>Отмена</button><button className="primary" onClick={addCreatorAdmin}>Добавить</button></div></div></div>}

    <nav className="bottomNav">
      <button className={tab==='home'?'active':''} onClick={()=>setTab('home')}><span>🏠</span>Главная</button>
      <button className={tab==='jobs'?'active':''} onClick={()=>setTab('jobs')}><span>💼</span>Вакансии</button>
      <button className={tab==='candidates'?'active':''} onClick={()=>setTab('candidates')}><span>👥</span>Кандидаты</button>
      <button className={tab==='integrations'?'active':''} onClick={()=>setTab('integrations')}><span>🔌</span>Интеграции</button>
      {isCreator&&<button className={tab==='creator'?'active':''} onClick={()=>setTab('creator')}><span>👑</span>Создатель</button>}
    </nav>
  </main>
}

function HomeTab({isCreator}:{isCreator:boolean}){return <>
  <section className="homeTop"><div className="homeTopText"><span className="eyebrow">dashboard</span><h2>Центр найма</h2><p>Подключи источник, собери отклики и получи понятный рейтинг кандидатов без ручного просмотра сотен резюме.</p></div><div className="miniPreview"><div className="candidateMini good"><span>87</span><b>Мария</b><small>сильный опыт</small></div><div className="candidateMini mid"><span>72</span><b>Иван</b><small>есть риски</small></div><div className="candidateMini low"><span>54</span><b>Анна</b><small>нужны вопросы</small></div></div></section>
  <section className="insightStrip"><div><span>⏱️</span><b>Экономия времени</b><p>Не нужно вручную читать каждый отклик.</p></div><div><span>🧠</span><b>Умная оценка</b><p>AI объясняет, почему кандидат подходит.</p></div><div><span>🛡️</span><b>Меньше ошибок</b><p>Сравнение по одинаковым критериям, а не «на глаз».</p></div></section>
  <section className="workflow"><div className="flowCard active"><span>1</span><b>Подключи источник</b><p>HH.ru сейчас, Работа.ру — скоро</p></div><div className="flowLine"/><div className="flowCard"><span>2</span><b>Собери отклики</b><p>Вакансии и кандидаты подтянутся автоматически</p></div><div className="flowLine"/><div className="flowCard"><span>3</span><b>Запусти AI</b><p>Score, риски и вопросы для интервью</p></div></section>
  <section className="featureGrid"><article><div className="featureIcon">⚡</div><h3>Быстрый шортлист</h3><p>AI выделит лучших кандидатов из потока откликов.</p></article><article><div className="featureIcon">🎯</div><h3>Точные вопросы</h3><p>Для каждого кандидата — персональные вопросы по слабым местам.</p></article><article><div className="featureIcon">📊</div><h3>Сравнение кандидатов</h3><p>Все отклики в одном месте: score, риски и сильные стороны.</p></article></section>
  {isCreator&&<section className="creatorPanel"><div><span className="eyebrow">creator mode</span><h2>Панель создателя</h2><p>В Telegram доступны команды /admin, /scan и /leads — бот найдёт компании с активными вакансиями на HH.ru и подготовит текст обращения.</p></div><div className="terminalCard"><code>/scan</code><code>/leads</code><code>/add_admin username</code></div></section>}
</>}

function IntegrationsTab({ints,busy,connectHH,sync}:{ints:Integration[];busy:string;connectHH:()=>void;sync:(id:number)=>void}){return <><section className="sectionHead"><div><h2>Интеграции</h2><p>Подключи источники кандидатов и синхронизируй отклики.</p></div></section><div className="grid">{ints.map(i=><article className="glassCard" key={i.id}><div className="cardTop"><div className="provider">hh</div><span className="status">{i.status}</span></div><h3>{i.provider.toUpperCase()}</h3><p>Синхронизация вакансий, откликов и резюме.</p><button className="smallBtn" onClick={()=>sync(i.id)} disabled={busy==='sync-'+i.id}>{busy==='sync-'+i.id?'Синхронизация…':'Синхронизировать'}</button></article>)}{!ints.length&&<article className="empty"><h3>Пока нет интеграций</h3><p>HH заявка на API может быть на рассмотрении. Когда ключи будут готовы — подключишь в один клик.</p><button className="smallBtn" onClick={connectHH}>Попробовать HH</button></article>}<article className="glassCard rabotaSoon rabotaPreview"><div className="cardTop"><div className="provider rabotaProvider">р</div><span className="status soon">скоро</span></div><h3>Работа.ру</h3><p>Готовим подключение к Работа.ру, чтобы автоматически подтягивать кандидатов из второго источника.</p><ul className="soonList"><li>вакансии</li><li>отклики</li><li>резюме</li><li>приглашения/отказы</li></ul><button className="smallBtn disabledBtn" disabled>Скоро подключим</button></article></div></>}

function JobsTab({loading,filteredJobs,query,setQuery,openJob}:{loading:boolean;filteredJobs:Job[];query:string;setQuery:(v:string)=>void;openJob:(id:number)=>void}){return <><section className="sectionHead"><div><h2>Вакансии</h2><p>Открой вакансию, чтобы посмотреть кандидатов и запустить AI-анализ.</p></div><input className="search" placeholder="Поиск вакансии…" value={query} onChange={e=>setQuery(e.target.value)}/></section>{loading?<div className="loader">Загружаю…</div>:<div className="grid jobs">{filteredJobs.map(j=><article className="jobCard" key={j.id} onClick={()=>openJob(j.id)}><span className="badge">{j.external_provider||'manual'}</span><h3>{j.title}</h3><p>{j.city||'Город не указан'}</p><div className="openHint">Открыть →</div></article>)}{!filteredJobs.length&&<article className="empty"><h3>Вакансий пока нет</h3><p>После подключения источника здесь появится список вакансий.</p></article>}</div>}</>}

function CandidatesTab({setTab}:{setTab:(t:Tab)=>void}){return <><section className="sectionHead"><div><h2>Кандидаты</h2><p>Здесь появятся кандидаты после синхронизации откликов.</p></div></section><div className="grid"><article className="empty"><h3>Кандидатов пока нет</h3><p>Подключи HH.ru, синхронизируй вакансии и отклики — потом здесь будет список кандидатов, AI-score и вопросы для интервью.</p><button className="smallBtn" onClick={()=>setTab('integrations')}>Перейти к интеграциям</button></article></div></>}


function CreatorTab({summary,leads,admins,busy,scan,reload,addAdmin,setLeadStatus}:{summary:any;leads:any[];admins:any[];busy:string;scan:()=>void;reload:()=>void;addAdmin:()=>void;setLeadStatus:(id:number,status:string)=>void}){const newLeads=leads.filter(l=>l.status==='new'||l.status==='later'); return <>
  <section className="creatorHero"><div><span className="eyebrow">creator control</span><h2>Панель создателя</h2><p>Ищи клиентов, управляй лидами и доступами прямо из mini app.</p></div><div className="creatorGlow">👑</div></section>
  <section className="creatorStats"><div><b>{summary?.leads??'—'}</b><span>всего лидов</span></div><div><b>{summary?.fresh??'—'}</b><span>новые/позже</span></div><div><b>{summary?.contacted??'—'}</b><span>связались</span></div><div><b>{summary?.admins??'—'}</b><span>админов</span></div></section>
  <section className="creatorActions pretty"><button className="primary" onClick={scan} disabled={busy==='creator-scan'}>🔎 {busy==='creator-scan'?'Ищу клиентов…':'Сканировать HH.ru'}</button><button className="secondary" onClick={reload}>🔄 Обновить</button><button className="secondary" onClick={addAdmin}>👑 Добавить создателя</button><button className="secondary" onClick={()=>navigator.clipboard?.writeText(newLeads.map(l=>`${l.company_name} — ${l.vacancy_title}\n${l.vacancy_url}\n${l.outreach_message}`).join('\n\n'))}>📋 Скопировать лиды</button></section>
  <section className="creatorToolGrid"><article><span>🧲</span><b>Автопоиск клиентов</b><p>Ищет компании с активными вакансиями на HH.ru.</p></article><article><span>✉️</span><b>Текст обращения</b><p>Для каждого лида готовится аккуратный текст без автоспама.</p></article><article><span>👥</span><b>Команда</b><p>Добавляй людей, которым доступна creator-панель.</p></article></section>
  <section className="creatorBox"><h3>Создатели и админы</h3><div className="adminList">{admins.map(a=><span key={a.id}>@{a.telegram_username} · {a.role}</span>)}</div></section>
  <section className="creatorBox"><div className="boxTitle"><h3>Лиды</h3><span>{newLeads.length} активных</span></div><div className="leadList">{leads.slice(0,12).map(l=><article className="leadCard" key={l.id}><div><b>{l.company_name}</b><p>{l.vacancy_title} · {l.city||'город не указан'}</p><small>{l.reason}</small></div><div className="leadBtns"><a href={l.vacancy_url} target="_blank">Открыть</a><button onClick={()=>navigator.clipboard?.writeText(l.outreach_message||'')}>Копировать</button><button onClick={()=>setLeadStatus(l.id,'later')}>Позже</button><button onClick={()=>setLeadStatus(l.id,'contacted')}>Связался</button><button onClick={()=>setLeadStatus(l.id,'hidden')}>Скрыть</button></div></article>)}{!leads.length&&<p className="muted">Лидов пока нет. Запусти сканирование.</p>}</div></section>
</>}

function Score({score}:{score:any}){const n=Number(score); return <strong className={(n>=80?'good':n>=55?'mid':'low')+' score'}>{score??'—'}</strong>}

createRoot(document.getElementById('root')!).render(<App/>);
