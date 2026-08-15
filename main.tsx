import React,{useEffect,useMemo,useState} from 'react';
import {createRoot} from 'react-dom/client';
import './style.css';

const API=import.meta.env.VITE_API_URL||'';

type Integration={id:number;provider:string;status:string;last_synced_at?:string;created_at?:string};
type Job={id:number;title:string;city?:string;external_provider?:string;status?:string;created_at?:string};
type JobDetails={job:Job;applications:any[]};

function App(){
  const [ints,setInts]=useState<Integration[]>([]);
  const [jobs,setJobs]=useState<Job[]>([]);
  const [job,setJob]=useState<JobDetails|null>(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState('');
  const [toast,setToast]=useState('');
  const [query,setQuery]=useState('');
  const tgUser=(window as any).Telegram?.WebApp?.initDataUnsafe?.user;
  const isCreator=['blodoyyy'].includes(String(tgUser?.username||'').toLowerCase());

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
    try{
      tg.ready?.();
      tg.expand?.();
      tg.setHeaderColor?.('#071827');
      tg.setBackgroundColor?.('#071827');
      tg.setBottomBarColor?.('#071827');
      tg.requestFullscreen?.();
    }catch(e){}
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
  const totalApps=job?.applications?.length||0;
  const analyzed=job?.applications?.filter(a=>a.score!=null).length||0;
  const avg=job?.applications?.length?Math.round(job.applications.reduce((s,a)=>s+(Number(a.score)||0),0)/Math.max(1,analyzed)):0;

  if(job){
    return <main className="app">
      <div className="orb orb1"/><div className="orb orb2"/>
      {toast&&<div className="toast">{toast}</div>}
      <section className="hero compact">
        <button className="back" onClick={()=>setJob(null)}>← Все вакансии</button>
        <div className="heroText"><span className="eyebrow">Карточка вакансии</span><h1>{job.job.title}</h1><p>{job.job.city||'Город не указан'} · {totalApps} откликов</p></div>
        <button className="primary pulse" onClick={analyzeAll} disabled={busy==='analyze'}>{busy==='analyze'?'Анализирую…':'AI-анализ всех'}</button>
      </section>
      <section className="stats">
        <div><b>{totalApps}</b><span>откликов</span></div><div><b>{analyzed}</b><span>разобрано AI</span></div><div><b>{avg||'—'}</b><span>средний score</span></div>
      </section>
      <section className="sectionHead"><h2>Кандидаты</h2><p>Сортировка по AI-оценке: лучшие сверху.</p></section>
      <div className="candidateList">{job.applications.map((a:any)=><article className="candidate" key={a.id}>
        <div className="avatar">{(a.full_name||'К')[0]}</div>
        <div className="candidateBody"><div className="row"><h3>{a.full_name}</h3><Score score={a.score}/></div><p>{a.summary||'Пока не анализировался — нажми AI-анализ всех, чтобы получить вывод, риски и вопросы.'}</p><div className="tags"><span>{a.external_status||a.internal_status||'Новый'}</span><span>Источник: HH</span></div></div>
      </article>)}</div>
    </main>
  }

  return <main className="app">
    <div className="orb orb1"/><div className="orb orb2"/>
    {toast&&<div className="toast">{toast}</div>}
    <section className="hero">
      <div className="brandMark"><div className="docIcon"><i/><i/></div><span>✓</span></div>
      <div className="heroText"><span className="eyebrow">AI hiring assistant</span><h1>HireCheck</h1><p>Яркий AI-скрининг кандидатов: собирай отклики, ранжируй лучших и получай вопросы для интервью за минуты.</p>
        <div className="heroActions"><button className="primary" onClick={connectHH} disabled={busy==='hh'}>{busy==='hh'?'Открываю HH…':'Подключить HH.ru'}</button><button className="secondary" onClick={load}>Обновить</button></div>
      </div>
    </section>

    <section className="stats">
      <div><b>{ints.length}</b><span>интеграций</span></div><div><b>{jobs.length}</b><span>вакансий</span></div><div><b>AI</b><span>оценка резюме</span></div>
    </section>

    <section className="workflow">
      <div className="flowCard active"><span>1</span><b>Подключи источник</b><p>HH.ru сейчас, Работа.ру — скоро</p></div>
      <div className="flowLine"/>
      <div className="flowCard"><span>2</span><b>Собери отклики</b><p>Вакансии и кандидаты подтянутся автоматически</p></div>
      <div className="flowLine"/>
      <div className="flowCard"><span>3</span><b>Запусти AI</b><p>Score, риски и вопросы для интервью</p></div>
    </section>

    <section className="featureGrid">
      <article><div className="featureIcon">⚡</div><h3>Быстрый шортлист</h3><p>AI выделит лучших кандидатов из потока откликов.</p></article>
      <article><div className="featureIcon">🎯</div><h3>Точные вопросы</h3><p>Для каждого кандидата — персональные вопросы по слабым местам.</p></article>
      <article><div className="featureIcon">📊</div><h3>Сравнение кандидатов</h3><p>Все отклики в одном месте: score, риски и сильные стороны.</p></article>
    </section>

    {isCreator&&<section className="creatorPanel">
      <div><span className="eyebrow">creator mode</span><h2>Панель создателя</h2><p>В Telegram доступны команды /admin, /scan и /leads — бот найдёт компании с активными вакансиями на HH.ru и подготовит текст обращения.</p></div>
      <div className="terminalCard"><code>/scan</code><code>/leads</code><code>/add_admin username</code></div>
    </section>}

    <section className="sectionHead"><div><h2>Интеграции</h2><p>Подключи источники кандидатов и синхронизируй отклики.</p></div></section>
    <div className="grid">{ints.map(i=><article className="glassCard" key={i.id}><div className="cardTop"><div className="provider">hh</div><span className="status">{i.status}</span></div><h3>{i.provider.toUpperCase()}</h3><p>Синхронизация вакансий, откликов и резюме.</p><button className="smallBtn" onClick={()=>sync(i.id)} disabled={busy==='sync-'+i.id}>{busy==='sync-'+i.id?'Синхронизация…':'Синхронизировать'}</button></article>)}{!ints.length&&<article className="empty"><h3>Пока нет интеграций</h3><p>HH заявка на API может быть на рассмотрении. Когда ключи будут готовы — подключишь в один клик.</p><button className="smallBtn" onClick={connectHH}>Попробовать HH</button></article>}<article className="glassCard rabotaSoon"><div className="cardTop"><div className="provider rabotaProvider">р</div><span className="status soon">скоро</span></div><h3>Работа.ру</h3><p>Интеграция с Работа.ру скоро появится: вакансии, отклики и резюме кандидатов.</p><button className="smallBtn disabledBtn" disabled>Работа.ру скоро</button></article></div>

    <section className="sectionHead"><div><h2>Вакансии</h2><p>Открой вакансию, чтобы посмотреть кандидатов и запустить AI-анализ.</p></div><input className="search" placeholder="Поиск вакансии…" value={query} onChange={e=>setQuery(e.target.value)}/></section>
    {loading?<div className="loader">Загружаю…</div>:<div className="grid jobs">{filteredJobs.map(j=><article className="jobCard" key={j.id} onClick={()=>openJob(j.id)}><span className="badge">{j.external_provider||'manual'}</span><h3>{j.title}</h3><p>{j.city||'Город не указан'}</p><div className="openHint">Открыть →</div></article>)}{!filteredJobs.length&&<article className="empty"><h3>Вакансий пока нет</h3><p>После подключения HH или ручного режима здесь появится список.</p></article>}</div>}
  </main>
}
function Score({score}:{score:any}){const n=Number(score); return <strong className={(n>=80?'good':n>=55?'mid':'low')+' score'}>{score??'—'}</strong>}

createRoot(document.getElementById('root')!).render(<App/>);
