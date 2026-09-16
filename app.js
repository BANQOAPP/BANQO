(() => {
  'use strict';

  const CFG = window.BANQO_CONFIG || {};
  const API_URL = String(CFG.API_URL || '').trim();
  const $ = id => document.getElementById(id);
  const qsa = sel => [...document.querySelectorAll(sel)];
  const esc = (v='') => String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  let toastTimer = null;
  let timerInt = null;
  let sessionInt = null;

  const demoQuestions = [
    {id:'demo-1',examen:'ENAM',especialidad:'Cirugía',tema:'Abdomen agudo',subtema:'Vólvulo',pregunta:'Paciente con dolor y distensión abdominal. En la radiografía se observa el signo del grano de café. ¿Cuál es el diagnóstico más probable?',opciones:{A:'Obstrucción por adherencias',B:'Vólvulo de sigmoides',C:'Íleo paralítico',D:'Invaginación intestinal'},correcta:'B',explicacion:'El signo del grano de café en una radiografía simple de abdomen es clásico del vólvulo de sigmoides.',datito_galactico:'OJO PIOJO: “signo del grano de café” = piensa primero en vólvulo de sigmoides.'},
    {id:'demo-2',examen:'ESSALUD',especialidad:'Medicina Interna',tema:'Cardiología',subtema:'Insuficiencia cardiaca',pregunta:'Varón de 68 años con disnea progresiva, ortopnea y edema. Ecocardiograma: fracción de eyección 35%. ¿Qué fármaco mejora el pronóstico?',opciones:{A:'Furosemida',B:'Enalapril',C:'Digoxina',D:'Hidroclorotiazida'},correcta:'B',explicacion:'En insuficiencia cardiaca con fracción de eyección reducida, un IECA como enalapril reduce morbimortalidad.',datito_galactico:'Si preguntan “mejora pronóstico” en IC-FEr, separa los fármacos que reducen mortalidad de los que solo alivian congestión.'},
    {id:'demo-3',examen:'ENCAPS',especialidad:'Medicina Interna',tema:'Infectología',subtema:'Tuberculosis',pregunta:'Paciente con tos persistente, pérdida de peso y sudoración nocturna. ¿Qué diagnóstico debe descartarse prioritariamente?',opciones:{A:'Asma bronquial',B:'Tuberculosis pulmonar',C:'Rinitis alérgica',D:'Insuficiencia cardiaca'},correcta:'B',explicacion:'La tos persistente asociada a síntomas constitucionales obliga a descartar tuberculosis pulmonar.',datito_galactico:'OJO PIOJO: tos persistente + pérdida de peso + sudoración nocturna = piensa en tuberculosis.'}
  ];

  const state = {
    user: readJSON('banqo_user'),
    token: localStorage.getItem('banqo_session_token') || '',
    demo: false,
    practice: null,
    filters: null,
    profile: null,
    dashboard: null,
    pendingStart: null,
    progress: null,
    progressFilter: 'TODOS',
    dreamPlazas: [],
    dreamSelected: null
  };

  function readJSON(k){ try{return JSON.parse(localStorage.getItem(k)||'null');}catch(e){return null;} }
  function writeJSON(k,v){ localStorage.setItem(k, JSON.stringify(v)); }
  function deviceLabel(){
    const ua=navigator.userAgent;
    const browser=/Edg/.test(ua)?'Edge':/Chrome/.test(ua)?'Chrome':/Safari/.test(ua)&&!/Chrome/.test(ua)?'Safari':/Firefox/.test(ua)?'Firefox':'Navegador';
    const os=/iPhone|iPad/.test(ua)?'iOS':/Android/.test(ua)?'Android':/Windows/.test(ua)?'Windows':/Mac OS/.test(ua)?'macOS':'Dispositivo';
    return `${browser} · ${os}`;
  }
  function toast(msg, ms=3200){ const t=$('toast'); if(!t)return; t.textContent=msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.remove('show'),ms); }
  function showOnly(id){ ['landing','auth','app'].forEach(x=>$(x)?.classList.add('hidden')); $(id)?.classList.remove('hidden'); }
  function showAuth(which){
    showOnly('auth');
    $('loginView')?.classList.toggle('hidden',which!=='login');
    $('registerView')?.classList.toggle('hidden',which!=='register');
    $('confirmView')?.classList.add('hidden');
  }
  function go(page){
    qsa('.page').forEach(p=>p.classList.remove('active'));
    $(page)?.classList.add('active');
    qsa('.navbtn').forEach(b=>b.classList.toggle('active',b.dataset.page===page));
    if(page==='errores') loadErrors();
    if(page==='progreso') loadProgress();
    if(page==='perfil') loadProfile();
    window.scrollTo({top:0,behavior:'smooth'});
  }
  function normalizeOptions(q){
    if(Array.isArray(q.options)) return q.options;
    const o=q.opciones||{};
    return ['A','B','C','D','E'].filter(k=>o[k]!=null && String(o[k]).trim()!=='').map(k=>String(o[k]));
  }
  function sourceSelected(id){ return document.querySelector(`#${id} .source-card.active`)?.dataset.source || 'Todos'; }
  function isSimKind(p=state.practice){ return Boolean(p && String(p.kind||'').startsWith('sim')); }
  function isEndMode(p=state.practice){ return Boolean(p && p.feedbackMode==='end'); }
  function setApiBanner(text, ok=true){
    const b=$('modeBanner'); if(!b)return;
    b.textContent=text;
    b.classList.remove('hidden');
    b.style.background = ok ? '#eaf8f0' : '#fff2f2';
    b.style.color = ok ? '#176b3a' : '#9f2424';
  }

  async function api(action, payload={}){
    if(!API_URL) throw new Error('API_NOT_CONFIGURED');
    const controller = new AbortController();
    const timeout = setTimeout(()=>controller.abort(), 20000);
    try{
      const res=await fetch(API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action,...payload}),signal:controller.signal});
      const text=await res.text();
      let data;
      try{data=JSON.parse(text);}catch(e){throw new Error('API_INVALID_RESPONSE');}
      if(!data.ok){ const err=new Error(data.error||'API_ERROR'); err.code=data.error||'API_ERROR'; throw err; }
      return data;
    }catch(e){
      if(e.name==='AbortError') throw new Error('API_TIMEOUT');
      throw e;
    }finally{ clearTimeout(timeout); }
  }
  function authPayload(extra={}){ return {uid:state.user?.uid||'',session_token:state.token,device:deviceLabel(),...extra}; }
  function friendlyError(e){
    const c=String(e?.code||e?.message||e);
    const m={
      INVALID_CREDENTIALS:'Correo o contraseña incorrectos.',EMAIL_EXISTS:'Ese correo ya está registrado.',WEAK_PASSWORD:'La contraseña debe tener al menos 6 caracteres, una mayúscula y un número.',
      INVALID_EMAIL:'Ingresa un correo válido.',NAME_REQUIRED:'Completa nombre y apellido.',SESSION_NOT_ACTIVE:'La cuenta se inició en otro dispositivo.',FREE_LIMIT:'Ya usaste tus 15 preguntas gratuitas de las últimas 24 horas.',
      NO_QUESTIONS:'No hay preguntas publicadas con esos filtros.',ACTIVE_SIMULATION_EXISTS:'Ya tienes un simulacro activo. Finalízalo antes de iniciar otro.',RATE_LIMIT:'Demasiadas acciones seguidas. Espera un momento.',
      API_TIMEOUT:'La API tardó demasiado. Intenta nuevamente.',API_INVALID_RESPONSE:'La API respondió con un formato inesperado.',API_NOT_CONFIGURED:'Falta configurar la URL de Apps Script.'
    };
    return m[c]||`Ocurrió un error: ${c}`;
  }

  async function health(){
    if(!API_URL){setApiBanner('API no configurada · solo demo',false);return false;}
    try{
      const res=await fetch(`${API_URL}?action=health`,{cache:'no-store'});
      const d=await res.json();
      if(d.ok){setApiBanner('BANQO conectado a Google Sheets · API activa',true);setTimeout(()=>$('modeBanner')?.classList.add('hidden'),3500);return true;}
    }catch(e){}
    setApiBanner('No se pudo conectar a Google Apps Script. La demo sigue disponible.',false);
    return false;
  }

  async function boot(){
    bindActions(); bindSourceCards(); bindProfileInputs();
    $('adminNav')?.classList.add('hidden');
    await health();
    if(state.user && state.token){
      try{ const d=await api('checkSession',authPayload()); state.user=d.user; writeJSON('banqo_user',state.user); await enterApp(); return; }
      catch(e){ clearAuth(); }
    }
    showOnly('landing');
  }

  function bindActions(){
    document.addEventListener('click',async e=>{
      const jump=e.target.closest('[data-sim-index]'); if(jump){ jumpSim(Number(jump.dataset.simIndex)); return; }
      const errCard=e.target.closest('[data-error-id]'); if(errCard){ await openErrorDetail(errCard.dataset.errorId); return; }
      const pf=e.target.closest('[data-progress-filter]'); if(pf){ setProgressFilter(pf.dataset.progressFilter); return; }
      const btn=e.target.closest('[data-action]'); if(!btn)return;
      const a=btn.dataset.action;
      try{
        if(a==='landing')showOnly('landing');
        else if(a==='show-login')showAuth('login');
        else if(a==='show-register')showAuth('register');
        else if(a==='demo-enter')demoEnter();
        else if(a==='login')await login();
        else if(a==='register')await register();
        else if(a==='forgot')toast('La recuperación automática se activará en la siguiente fase. Para la beta, el administrador puede crear una nueva contraseña manualmente.');
        else if(a==='back-login')showAuth('login');
        else if(a==='resend-confirmation')toast('Esta versión con Google Sheets no usa confirmación por correo todavía.');
        else if(a==='logout')await logout();
        else if(a==='dashboard')go('dashboard');
        else if(a==='go-banqueo')go('banqueo');
        else if(a==='start-bank')openFeedbackMode('bank');
        else if(a==='start-sim')openFeedbackMode('sim');
        else if(a==='choose-feedback-immediate')await confirmFeedbackMode('immediate');
        else if(a==='choose-feedback-end')await confirmFeedbackMode('end');
        else if(a==='cancel-feedback-mode')closeFeedbackMode();
        else if(a==='blank-answer')await blankAnswer();
        else if(a==='clear-eliminations')clearEliminations();
        else if(a==='next-question')await nextQuestion();
        else if(a==='mark-review')toggleMarkReview();
        else if(a==='finish-sim')await finishSimulation();
        else if(a==='save-note')await saveNote();
        else if(a==='bookmark')await toggleBookmark();
        else if(a==='cancel-practice'){ if(confirm('¿Salir de esta sesión?')){clearInterval(timerInt);go(state.practice?.kind==='sim'?'simulacros':'banqueo');state.practice=null;} }
        else if(a==='save-profile')await saveProfile();
        else if(a==='close-error-detail')$('errorDetailModal')?.classList.add('hidden');
        else if(a==='session-kicked'){ $('sessionModal')?.classList.add('hidden'); clearAuth(); showAuth('login'); }
        else if(['preview-import','run-import','refresh-admin'].includes(a))toast('El banco maestro se administra directamente en Google Sheets.');
      }catch(err){
        if(String(err?.code||err?.message).includes('SESSION_NOT_ACTIVE')){ handleKicked(); return; }
        toast(friendlyError(err),4500);
      }
    });
    qsa('.navbtn').forEach(b=>b.addEventListener('click',()=>go(b.dataset.page)));
  }
  function bindSourceCards(){
    qsa('.source-grid').forEach(grid=>grid.addEventListener('click',e=>{
      const card=e.target.closest('.source-card'); if(!card)return;
      [...grid.querySelectorAll('.source-card')].forEach(x=>x.classList.remove('active')); card.classList.add('active');
    }));
  }
  function bindProfileInputs(){
    ['profileGradYear','profileEnamScore','profilePregradAvg','profileSerumsDifficulty','profileFirstLevelYears','profileFifthSuperior'].forEach(id=>$(id)?.addEventListener('input',()=>{renderCv();renderDreamProjection();}));
    $('dreamSpecialty')?.addEventListener('change',()=>{populateDreamPlazas($('dreamSpecialty').value);renderDreamProjection();});
    $('dreamPlaza')?.addEventListener('change',()=>{state.dreamSelected=$('dreamPlaza').value||'';renderDreamProjection();});
    $('profileGoal')?.addEventListener('change',()=>{$('dreamPlazaCard')?.classList.toggle('hidden',$('profileGoal').value!=='ENARM');});
  }

  async function register(){
    const nombre=$('regName').value.trim(), apellido=$('regLast').value.trim(), email=$('regEmail').value.trim(), password=$('regPass').value, objetivo=$('regGoal').value;
    if(!objetivo){toast('Selecciona para qué te estás preparando.');return;}
    const d=await api('register',{nombre,apellido,email,password,objetivo,device:deviceLabel()});
    setAuth(d.user,d.session_token); await enterApp(); toast('Cuenta creada. Bienvenido a BANQO 🚀');
  }
  async function login(){
    const d=await api('login',{email:$('loginEmail').value.trim(),password:$('loginPass').value,device:deviceLabel()});
    setAuth(d.user,d.session_token); await enterApp();
  }
  function setAuth(user,token){ state.demo=false; state.user=user; state.token=token; writeJSON('banqo_user',user); localStorage.setItem('banqo_session_token',token); }
  function clearAuth(){ state.user=null;state.token='';state.demo=false;localStorage.removeItem('banqo_user');localStorage.removeItem('banqo_session_token');clearInterval(sessionInt); }
  async function logout(){
    if(!state.demo && state.user && state.token){try{await api('logout',authPayload());}catch(e){}}
    clearAuth(); showOnly('landing');
  }
  function demoEnter(){
    state.demo=true; state.user={uid:'demo',nombre:'Demo',apellido:'BANQO',email:'demo@banqo.local',plan:'FREE',objetivo:'ENARM'}; state.token='demo'; enterApp(); setApiBanner('MODO DEMO · los datos no se guardan en Google Sheets',false);
  }

  async function enterApp(){
    showOnly('app');
    $('userName').textContent=state.user?.nombre||'Usuario'; $('avatar').textContent=(state.user?.nombre||'U').slice(0,1).toUpperCase();
    $('hello').textContent=`¡Hola, ${state.user?.nombre||'Usuario'}! 👋`;
    renderGoalGreeting(state.user?.objetivo);
    $('sessionInfo').textContent=state.demo?'Demo local':`${deviceLabel()} · una sola sesión activa`;
    if(state.demo){ populateDemoFilters(); renderDashboard({total:0,correct:0,accuracy:null,last_24h:0,remaining:15,premium:false,plan:'Free',xp:0}); loadProfileDemo(); }
    else { await Promise.all([loadFilters(),loadDashboard(),loadProfile()]); startSessionMonitor(); }
    go('dashboard');
  }
  function renderGoalGreeting(goal){
    const map={ENARM:'Un paso más cerca de tu especialidad.',ENCAPS_SERUMS:'Un paso más cerca de tu plaza soñada.',INTERNADO:'Un paso más cerca de tu plaza soñada.',ENAM:'Un paso más cerca de tu mejor resultado en el ENAM.'};
    $('goalGreeting').textContent=map[goal]||'Un paso más cerca de tu objetivo.';
  }
  function startSessionMonitor(){
    clearInterval(sessionInt); const sec=Number(CFG.SESSION_CHECK_SECONDS||30);
    sessionInt=setInterval(async()=>{ if(state.demo||!state.user||!state.token)return; try{await api('checkSession',authPayload());}catch(e){if(String(e?.code||e?.message).includes('SESSION_NOT_ACTIVE'))handleKicked();}},Math.max(15,sec)*1000);
  }
  function handleKicked(){ clearInterval(sessionInt); $('sessionModal')?.classList.remove('hidden'); }

  function populateDemoFilters(){
    const specs=[...new Set(demoQuestions.map(q=>q.especialidad))], topics=[...new Set(demoQuestions.map(q=>q.tema))], subs=[...new Set(demoQuestions.map(q=>q.subtema))];
    fillSelect('bankSpecialty',specs,'Todas');fillSelect('bankTopic',topics,'Todos');fillSelect('bankSubtopic',subs,'Todos');
  }
  async function loadFilters(){
    const cached=readJSON('banqo_filters_cache');
    if(cached && cached.at && Date.now()-cached.at<5*60*1000 && cached.data){
      state.filters=cached.data;
      fillSelect('bankSpecialty',cached.data.especialidades||[],'Todas'); fillSelect('bankTopic',cached.data.temas||[],'Todos'); fillSelect('bankSubtopic',cached.data.subtemas||[],'Todos');
    }
    const d=await api('getFilters',authPayload()); state.filters=d; writeJSON('banqo_filters_cache',{at:Date.now(),data:d});
    fillSelect('bankSpecialty',d.especialidades||[],'Todas'); fillSelect('bankTopic',d.temas||[],'Todos'); fillSelect('bankSubtopic',d.subtemas||[],'Todos');
  }
  function fillSelect(id,items,first){ const el=$(id); if(!el)return; el.innerHTML=`<option value="">${first}</option>`+(items||[]).map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join(''); }

  async function loadDashboard(){
    if(!state.user)return;
    if(state.demo){renderDashboard({total:0,correct:0,accuracy:null,last_24h:0,remaining:15,premium:false,plan:'Free',xp:0});return;}
    const d=await api('getDashboard',authPayload()); state.dashboard=d; renderDashboard(d);
  }
  function renderDashboard(d){
    const max=d.premium?'∞':15;
    $('dashToday').textContent=d.premium?`${d.last_24h} / ∞`:`${d.last_24h}/${max}`;
    $('dashAccuracy').textContent=d.accuracy==null?'—':`${d.accuracy}%`; $('dashTotal').textContent=d.total||0; $('dashPlan').textContent=d.plan||'Free';
    $('planBadge').textContent=d.plan||'Free'; $('planBadge').className='pill '+(d.premium?'p-green':'p-blue');
    $('profilePlan').textContent=d.premium?'Premium · ilimitado':'Free · 15 preguntas cada 24 h'; $('usagePill').textContent=d.premium?'Premium · ilimitado':`Free · ${d.remaining} restantes`;
    const xp=Number(d.xp||0),level=Math.floor(xp/100)+1,within=xp%100; $('petLevel').textContent=level;$('petXpText').textContent=`${within}/100 XP`;$('petXpBar').style.width=`${within}%`;$('petXpBar2').style.width=`${within}%`;
  }

  function openFeedbackMode(kind){
    state.pendingStart={kind};
    $('feedbackModeModal')?.classList.remove('hidden');
  }
  function closeFeedbackMode(){
    $('feedbackModeModal')?.classList.add('hidden');
    state.pendingStart=null;
  }
  async function confirmFeedbackMode(mode){
    const kind=state.pendingStart?.kind;
    if(!kind)return;
    const modal=$('feedbackModeModal');
    modal?.classList.add('is-loading');
    qsa('#feedbackModeModal .mode-choice,#feedbackModeModal [data-action="cancel-feedback-mode"]').forEach(x=>x.disabled=true);
    toast('Preparando preguntas…');
    try{
      if(kind==='bank') await startBank(mode);
      else await startSim(mode);
      modal?.classList.add('hidden');
      state.pendingStart=null;
    } finally {
      modal?.classList.remove('is-loading');
      qsa('#feedbackModeModal .mode-choice,#feedbackModeModal [data-action="cancel-feedback-mode"]').forEach(x=>x.disabled=false);
    }
  }

  async function startBank(feedbackMode='immediate'){
    let questions;
    if(state.demo){
      let pool=demoQuestions.slice(),src=sourceSelected('bankSources'); if(src!=='Todos')pool=pool.filter(q=>q.examen===src);
      const spec=$('bankSpecialty').value,topic=$('bankTopic').value,sub=$('bankSubtopic').value; if(spec)pool=pool.filter(q=>q.especialidad===spec);if(topic)pool=pool.filter(q=>q.tema===topic);if(sub)pool=pool.filter(q=>q.subtema===sub);
      questions=shuffleLocal(pool).slice(0,Number($('bankCount').value||10));
    } else {
      const d=await api('getQuestions',authPayload({examen:sourceSelected('bankSources'),especialidad:$('bankSpecialty').value,tema:$('bankTopic').value,subtema:$('bankSubtopic').value,cantidad:Number($('bankCount').value||10),only_new:$('onlyNew').checked,only_failed:$('onlyFailed').checked,only_bookmarked:$('onlyBookmarked').checked}));
      questions=d.questions||[]; if(d.twin_count)toast(`Incluimos ${d.twin_count} pregunta gemela pendiente 🧬`);
    }
    if(!questions.length){toast('No hay preguntas publicadas con esos filtros. En Google Sheets cambia “publicada” a SI en algunas filas.',5000);return;}
    beginPractice('bank',questions,null,feedbackMode);
  }

  async function startSim(feedbackMode='end'){
    let d;
    if(feedbackMode==='immediate'){
      if(state.demo){let pool=demoQuestions.slice(),src=sourceSelected('simSources');if(src!=='Todos')pool=pool.filter(q=>q.examen===src);const count=Math.min(Number($('simCount').value||10),pool.length);d={simulation_id:null,questions:shuffleLocal(pool).slice(0,count)};}
      else d=await api('getQuestions',authPayload({examen:sourceSelected('simSources'),cantidad:Number($('simCount').value||10)}));
    } else {
      if(state.demo){let pool=demoQuestions.slice(),src=sourceSelected('simSources');if(src!=='Todos')pool=pool.filter(q=>q.examen===src);const count=Math.min(Number($('simCount').value||10),pool.length);d={simulation_id:'demo-'+Date.now(),questions:shuffleLocal(pool).slice(0,count)};}
      else d=await api('startSimulation',authPayload({examen:sourceSelected('simSources'),cantidad:Number($('simCount').value||10)}));
    }
    if(!(d.questions||[]).length){toast('No hay preguntas suficientes para iniciar el simulacro.');return;}
    beginPractice('sim',d.questions,d.simulation_id||null,feedbackMode);
  }

  function beginPractice(kind,questions,simulationId,feedbackMode='immediate'){
    state.practice={kind,feedbackMode,questions,index:0,correct:0,incorrect:0,blank:0,answered:false,selected:null,eliminated:new Set(),answers:{},simulationId,start:Date.now(),startedAt:new Date().toISOString(),sessionId:`${kind==='sim'?'SIMGUIA':'BANK'}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,source:sourceSelected(kind==='sim'?'simSources':'bankSources'),questionStart:Date.now(),review:null};
    go('practice'); renderQuestion(); startTimer();
  }
  function startTimer(){clearInterval(timerInt);timerInt=setInterval(()=>{if(!state.practice)return;const sec=Math.floor((Date.now()-state.practice.start)/1000);$('timer').textContent=`${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`;},1000);}
  function currentQuestion(){return state.practice?.questions?.[state.practice.index];}
  function currentSaved(){return state.practice?.answers?.[state.practice.index]||null;}
  function renderQuestion(){
    const p=state.practice,q=currentQuestion(); if(!p||!q)return; const sim=isSimKind(p),saved=currentSaved();
    p.answered=false;p.selected=saved?.selected??null;p.eliminated=new Set(saved?.eliminated||[]);p.questionStart=Date.now();
    const opts=normalizeOptions(q);
    $('qPos').textContent=`Pregunta ${p.index+1} de ${p.questions.length}`;$('qProgress').style.width=`${(p.index+1)/p.questions.length*100}%`;$('qOrigin').textContent=q.examen||'BANQO';$('qTopic').textContent=[q.especialidad,q.tema].filter(Boolean).join(' · ')||'General';$('qText').textContent=q.pregunta||q.question_text||'';
    $('qDifficulty').classList.add('hidden');$('feedback').innerHTML='';$('notePanel').classList.add('hidden');$('personalNote').value='';$('communityStats').classList.add('hidden');$('bookmarkBtn').classList.add('hidden');
    $('markReviewBtn').classList.toggle('hidden',!sim);$('bankSideCard').classList.toggle('hidden',sim);$('simSideCard').classList.toggle('hidden',!sim);
    if(sim){$('markReviewBtn').classList.toggle('active',Boolean(saved?.marked));$('markReviewBtn').textContent=saved?.marked?'★ Marcada para revisar':'☆ Marcar para revisar';} else {$('galaxyTip').textContent=isEndMode(p)?'Modo examen: respuestas y explicaciones al finalizar.':'Primero responde. Luego Qbito te mostrará una clave de alto rendimiento.';}
    const helper=document.querySelector('.question-helper small'); if(helper) helper.innerHTML=isEndMode(p)?'Marca tu alternativa o usa <strong>✕</strong> para descartar. La corrección aparecerá al finalizar la sesión.':'Toca una alternativa para responder directamente o usa <strong>✕</strong> para ir descartando sin responder.';
    $('nextBtn').disabled=!(sim&&isEndMode(p));$('nextBtn').textContent=sim&&p.index===p.questions.length-1?'Finalizar':'Siguiente';
    $('options').innerHTML=opts.map((o,i)=>`<div class="option-row" data-row="${i}"><button class="option-answer" data-opt="${i}"><span class="letter">${String.fromCharCode(65+i)}</span><span>${esc(o)}</span></button><button class="discard-option" data-discard="${i}" type="button" title="Descartar sin responder">${p.eliminated.has(i)?'↩':'✕'}</button></div>`).join('');
    qsa('#options .option-answer').forEach(o=>o.addEventListener('click',()=>{const i=Number(o.dataset.opt); if(isEndMode(p)) selectDeferred(i); else if(sim) submitImmediateSim(i); else submitBank(i,false);}));
    qsa('#options .discard-option').forEach(o=>o.addEventListener('click',ev=>{ev.stopPropagation();toggleEliminate(Number(o.dataset.discard));}));
    p.eliminated.forEach(i=>applyEliminationVisual(i,true)); if(sim&&p.selected!=null)document.querySelector(`.option-answer[data-opt="${p.selected}"]`)?.classList.add('selected-sim');
    updateEliminationHint(); renderSimMap();
    if(q.imagen_url){$('qImage').src=q.imagen_url;$('qImageWrap').classList.remove('hidden');}else $('qImageWrap').classList.add('hidden');
  }
  function applyEliminationVisual(index,on){const row=document.querySelector(`[data-row="${index}"]`),ans=document.querySelector(`.option-answer[data-opt="${index}"]`),btn=document.querySelector(`.discard-option[data-discard="${index}"]`);row?.classList.toggle('eliminated',on);if(ans&&!isSimKind())ans.disabled=on;if(btn)btn.textContent=on?'↩':'✕';}
  function toggleEliminate(index){const p=state.practice;if(!p||p.answered)return;if(p.eliminated.has(index)){p.eliminated.delete(index);applyEliminationVisual(index,false);}else{if(isSimKind(p)&&p.selected===index)p.selected=null;p.eliminated.add(index);applyEliminationVisual(index,true);}if(isSimKind(p))saveSimState();updateEliminationHint();renderQuestionSelectionOnly();}
  function clearEliminations(){const p=state.practice;if(!p||p.answered)return;[...p.eliminated].forEach(i=>applyEliminationVisual(i,false));p.eliminated=new Set();if(isSimKind(p))saveSimState();updateEliminationHint();}
  function updateEliminationHint(){const p=state.practice,q=currentQuestion();if(!p||!q)return;const left=normalizeOptions(q).length-p.eliminated.size;$('remainingOptions').textContent=p.eliminated.size?`${left} alternativas vivas`:'Sin descartes';}
  function renderQuestionSelectionOnly(){if(!isSimKind())return;qsa('.option-answer').forEach(x=>x.classList.remove('selected-sim'));if(state.practice.selected!=null)document.querySelector(`.option-answer[data-opt="${state.practice.selected}"]`)?.classList.add('selected-sim');}
  function selectSim(index){const p=state.practice;if(p.eliminated.has(index)){p.eliminated.delete(index);applyEliminationVisual(index,false);}p.selected=index;saveSimState({isBlank:false});renderQuestionSelectionOnly();renderSimMap();}
  async function blankAnswer(){if(isEndMode()){state.practice.selected=null;state.practice.answered=true;saveSimState({isBlank:true});renderQuestionSelectionOnly();renderSimMap();$('nextBtn').disabled=false;toast('Pregunta marcada en blanco');}else if(isSimKind()){await submitImmediateSim(null,true);}else await submitBank(null,true);}
  function saveSimState(extra={}){const p=state.practice,old=p.answers[p.index]||{};p.answers[p.index]={...old,selected:p.selected??null,isBlank:extra.isBlank!==undefined?extra.isBlank:(old.isBlank||false),eliminated:[...p.eliminated],marked:Boolean(old.marked),tiempo_seg:Math.max(0,Math.round((Date.now()-p.questionStart)/1000))};if(p.selected!=null)p.answers[p.index].isBlank=false;}
  function toggleMarkReview(){const p=state.practice;if(!p||p.kind!=='sim')return;saveSimState();const s=p.answers[p.index];s.marked=!s.marked;$('markReviewBtn').classList.toggle('active',s.marked);$('markReviewBtn').textContent=s.marked?'★ Marcada para revisar':'☆ Marcar para revisar';renderSimMap();}
  function renderSimMap(){const p=state.practice;if(!p||!isSimKind(p))return;let answered=0;$('simMap').innerHTML=p.questions.map((q,i)=>{const s=p.answers[i]||{},isAns=s.selected!=null,isBlank=s.isBlank===true;if(isAns)answered++;let cls=isAns?'answered':isBlank?'blank':'';if(s.marked)cls+=' marked';if(i===p.index)cls+=' current';return `<button data-sim-index="${i}" class="sim-q ${cls.trim()}">${i+1}${s.marked?'★':''}</button>`;}).join('');$('simAnsweredCount').textContent=`${answered}/${p.questions.length}`;}
  function jumpSim(i){const p=state.practice;if(!p||!isSimKind(p))return;saveSimState();p.index=Math.max(0,Math.min(i,p.questions.length-1));renderQuestion();}

  function selectDeferred(index){
    const p=state.practice;if(!p)return;
    if(p.eliminated.has(index)){p.eliminated.delete(index);applyEliminationVisual(index,false);}
    p.selected=index;p.answered=true;
    saveSimState({isBlank:false});
    qsa('.option-answer').forEach(x=>x.classList.remove('selected-sim','deferred-selected'));
    const el=document.querySelector(`.option-answer[data-opt="${index}"]`);el?.classList.add('selected-sim','deferred-selected');
    $('nextBtn').disabled=false;renderSimMap();
  }

  async function submitImmediateSim(index,isBlank=false){
    const p=state.practice,q=currentQuestion();if(!p||p.answered)return;
    await submitBank(index,isBlank,true);
    saveSimState({isBlank:index==null});
    renderSimMap();
  }

  async function submitBank(index,isBlank,fromSim=false){
    const p=state.practice,q=currentQuestion();if(!p||p.answered)return;const letters=['A','B','C','D','E'],op=index==null?'':letters[index],elapsed=Math.max(0,Math.round((Date.now()-p.questionStart)/1000));
    let d;
    $('feedback').innerHTML='<div class="loading-inline">Verificando respuesta…</div>';
    qsa('.option-answer,.discard-option').forEach(x=>x.classList.add('processing'));
    try{
      if(state.demo){const correct=q.correcta,result=!op?'BLANCO':op===correct?'CORRECTA':'INCORRECTA';d={resultado:result,correcta:correct,explicacion:q.explicacion,datito_galactico:q.datito_galactico,estadisticas:{intentos:124,pct_acierto:68,pct_fallo:26,pct_blanco:6,dificultad:'Media',descartes:{A:40,B:10,C:50,D:62,E:0}},twin_scheduled:result==='INCORRECTA'};}
      else d=await api('submitAnswer',authPayload({question_id:q.id,opcion:op,tiempo_seg:elapsed,descartadas:[...p.eliminated].map(i=>letters[i])}));
    } finally { qsa('.option-answer,.discard-option').forEach(x=>x.classList.remove('processing')); }
    p.answered=true;p.selected=index;if(d.resultado==='CORRECTA')p.correct++;else if(d.resultado==='INCORRECTA')p.incorrect++;else p.blank++;
    if(isSimKind(p)){const old=p.answers[p.index]||{};p.answers[p.index]={...old,selected:index??null,isBlank:index==null,eliminated:[...p.eliminated],marked:Boolean(old.marked),tiempo_seg:elapsed,result:d.resultado,correcta:d.correcta};}
    qsa('.option-answer').forEach((el,i)=>{el.disabled=true;const letter=letters[i];if(letter===d.correcta)el.classList.add('correct');if(index===i&&letter!==d.correcta)el.classList.add('wrong');});qsa('.discard-option').forEach(x=>x.disabled=true);
    const title=d.resultado==='CORRECTA'?'✅ Correcta':d.resultado==='BLANCO'?'⬜ En blanco':'❌ Incorrecta';
    $('feedback').innerHTML=`<div class="feedback-box ${d.resultado==='CORRECTA'?'good':'bad'}"><h3>${title}</h3><p><b>Respuesta correcta: ${esc(d.correcta)}</b></p><p>${esc(d.explicacion||'Comentario pendiente de revisión.')}</p>${d.twin_scheduled?'<small>🧬 BANQO programó una pregunta gemela para comprobar este concepto más adelante.</small>':''}</div>`;
    $('galaxyTip').textContent=d.datito_galactico||'Sigue practicando: el patrón se vuelve más fácil con repetición.';
    renderCommunity(d.estadisticas||{});$('nextBtn').disabled=false;$('notePanel').classList.remove('hidden');$('bookmarkBtn').classList.remove('hidden');
    if(!state.demo){api('getNote',authPayload({question_id:q.id})).then(n=>{$('personalNote').value=n.nota||'';}).catch(()=>{});}
  }
  function renderCommunity(s){
    const el=$('communityStats');el.classList.remove('hidden'); const cls=s.dificultad||'Sin clasificación'; $('qDifficulty').textContent=cls;$('qDifficulty').classList.remove('hidden');
    el.innerHTML=`<h4>Estadísticas de la comunidad</h4><div class="community-grid"><span><b>${round1(s.pct_acierto)}%</b><small>Aciertos</small></span><span><b>${round1(s.pct_fallo)}%</b><small>Fallos</small></span><span><b>${round1(s.pct_blanco)}%</b><small>En blanco</small></span></div><small>${Number(s.intentos||0)} intentos · dificultad ${esc(cls)}</small><div class="discard-mini">Descartes: ${['A','B','C','D','E'].filter(k=>s.descartes&&s.descartes[k]).map(k=>`${k} ${s.descartes[k]}`).join(' · ')||'aún sin datos'}</div>`;
  }
  async function nextQuestion(){
    const p=state.practice;if(!p)return;
    if(isEndMode(p)){
      saveSimState();
      if(p.index>=p.questions.length-1){ if(isSimKind(p)) await finishSimulation(); else await finishDeferredBank(); return; }
      p.index++;renderQuestion();return;
    }
    if(isSimKind(p)){
      if(!p.answered)return;
      if(p.index>=p.questions.length-1){showImmediateSimResult();return;}
      p.index++;renderQuestion();return;
    }
    if(!p.answered)return;
    if(p.index>=p.questions.length-1){showBankResult();return;}
    p.index++;renderQuestion();
  }
  async function finishDeferredBank(){
    const p=state.practice;if(!p)return;
    const answers=p.questions.map((q,i)=>{const a=p.answers[i]||{};return {question_id:q.id,opcion:a.selected==null?'':String.fromCharCode(65+a.selected),descartadas:(a.eliminated||[]).map(x=>String.fromCharCode(65+x)),tiempo_seg:Number(a.tiempo_seg||0)};});
    let d;
    if(state.demo){let c=0,w=0,b=0;const review=p.questions.map((q,i)=>{const a=answers[i],r=!a.opcion?'BLANCO':a.opcion===q.correcta?'CORRECTA':'INCORRECTA';if(r==='CORRECTA')c++;else if(r==='INCORRECTA')w++;else b++;return {question_id:q.id,pregunta:q.pregunta,opciones:q.opciones,seleccionada:a.opcion,correcta:q.correcta,resultado:r,explicacion:q.explicacion,datito_galactico:q.datito_galactico};});d={correctas:c,incorrectas:w,blancas:b,puntaje:p.questions.length?c/p.questions.length*100:0,review};}
    else d=await api('finishBankSession',authPayload({answers,session_id:p.sessionId,examen:p.source,fecha_inicio:p.startedAt,feedback_mode:p.feedbackMode}));
    clearInterval(timerInt);renderSimulationResult(d,p,'Banqueo finalizado');state.practice=null;if(!state.demo)loadDashboard().catch(()=>{});
  }
  function showImmediateSimResult(){
    const p=state.practice;clearInterval(timerInt);const total=p.questions.length,pct=total?Math.round(p.correct/total*100):0;
    $('resultTitle').textContent='Simulacro guiado finalizado';$('resultPct').textContent=`${pct}%`;$('resultScore').textContent=`${p.correct}/${total} correctas`;$('resultAdvice').textContent='Elegiste ver la corrección después de cada pregunta.';$('resultMapWrap').classList.remove('hidden');$('resultMap').innerHTML=p.questions.map((q,i)=>{const a=p.answers[i]||{},cls=a.result==='CORRECTA'?'correct':a.result==='INCORRECTA'?'wrong':'blank';return `<span class="sim-q ${cls}${a.marked?' marked':''}">${i+1}${a.marked?'★':''}</span>`;}).join('');$('resultReview').innerHTML='';go('result');
    if(!state.demo){api('recordGuidedSimulation',authPayload({session_id:p.sessionId,examen:p.source,fecha_inicio:p.startedAt,total_preguntas:total,correctas:p.correct,incorrectas:p.incorrect||0,blancas:p.blank||0,puntaje:pct})).then(()=>{state.progress=null;}).catch(()=>{});}
    state.practice=null;
  }
  function showBankResult(){
    const p=state.practice;clearInterval(timerInt);const total=p.questions.length,pct=total?Math.round(p.correct/total*100):0;
    $('resultTitle').textContent='¡Banqueo completado!';$('resultPct').textContent=`${pct}%`;$('resultScore').textContent=`${p.correct}/${total} correctas`;$('resultAdvice').textContent=pct>=80?'Muy buen rendimiento. Mantén la constancia.':pct>=60?'Buen avance. Revisa tus errores y vuelve a intentarlo.':'Conviene repasar los temas fallados y usar las preguntas gemelas.';$('resultMapWrap').classList.add('hidden');$('resultReview').innerHTML='';go('result');
    if(!state.demo){api('recordBankSession',authPayload({session_id:p.sessionId,examen:p.source,fecha_inicio:p.startedAt,total_preguntas:total,correctas:p.correct,incorrectas:p.incorrect||0,blancas:p.blank||0,puntaje:pct,feedback_mode:p.feedbackMode})).then(()=>{state.progress=null;}).catch(()=>{});}
    state.practice=null;
  }

  async function finishSimulation(){
    const p=state.practice;if(!p||p.kind!=='sim')return;if(!confirm('¿Finalizar el simulacro? Después verás las respuestas y explicaciones.'))return;saveSimState();
    const answers=p.questions.map((q,i)=>{const s=p.answers[i]||{};return {question_id:q.id,opcion:s.selected==null?'':String.fromCharCode(65+s.selected),descartadas:(s.eliminated||[]).map(x=>String.fromCharCode(65+x)),marked:Boolean(s.marked),tiempo_seg:Number(s.tiempo_seg||0)};});
    let d;
    if(state.demo){let c=0,w=0,b=0;const review=p.questions.map((q,i)=>{const a=answers[i],r=!a.opcion?'BLANCO':a.opcion===q.correcta?'CORRECTA':'INCORRECTA';if(r==='CORRECTA')c++;else if(r==='INCORRECTA')w++;else b++;return {question_id:q.id,pregunta:q.pregunta,opciones:q.opciones,seleccionada:a.opcion,correcta:q.correcta,resultado:r,explicacion:q.explicacion,datito_galactico:q.datito_galactico};});d={correctas:c,incorrectas:w,blancas:b,puntaje:p.questions.length?c/p.questions.length*100:0,review};}
    else d=await api('finishSimulation',authPayload({simulation_id:p.simulationId,answers}));
    clearInterval(timerInt);renderSimulationResult(d,p);state.practice=null;state.progress=null;if(!state.demo)await loadDashboard();
  }
  function renderSimulationResult(d,p,customTitle='Simulacro finalizado'){
    $('resultTitle').textContent=customTitle;$('resultPct').textContent=`${round1(d.puntaje)}%`;$('resultScore').textContent=`${d.correctas} correctas · ${d.incorrectas} incorrectas · ${d.blancas} en blanco`;$('resultAdvice').textContent='Las respuestas y explicaciones se liberan recién ahora, al finalizar el examen.';
    $('resultMapWrap').classList.remove('hidden');const review=d.review||[];$('resultMap').innerHTML=review.map((r,i)=>{const saved=p.answers[i]||{};const cls=r.resultado==='CORRECTA'?'correct':r.resultado==='INCORRECTA'?'wrong':'blank';return `<span class="sim-q ${cls}${saved.marked?' marked':''}">${i+1}${saved.marked?'★':''}</span>`;}).join('');
    $('resultReview').innerHTML=review.map((r,i)=>`<details class="review-item"><summary>Pregunta ${i+1} · <b>${esc(r.resultado)}</b></summary><p>${esc(r.pregunta||'')}</p><p><b>Tu respuesta:</b> ${esc(r.seleccionada||'En blanco')} · <b>Correcta:</b> ${esc(r.correcta)}</p><p>${esc(r.explicacion||'Comentario pendiente.')}</p>${r.datito_galactico?`<div class="galaxy-review">🚀 ${esc(r.datito_galactico)}</div>`:''}</details>`).join(''); go('result');
  }

  async function saveNote(){const q=currentQuestion();if(!q)return;if(state.demo){localStorage.setItem(`demo_note_${q.id}`,$('personalNote').value);toast('Nota guardada en este navegador');return;}await api('saveNote',authPayload({question_id:q.id,nota:$('personalNote').value}));toast('Nota guardada');}
  async function toggleBookmark(){const q=currentQuestion();if(!q)return;if(state.demo){toast('Guardado en demo');return;}const d=await api('toggleBookmark',authPayload({question_id:q.id}));$('bookmarkBtn').textContent=d.bookmarked?'★ Pregunta guardada':'☆ Guardar pregunta';toast(d.bookmarked?'Pregunta guardada':'Pregunta retirada de guardados');}

  async function loadErrors(){
    const el=$('errorsList'); if(!el)return;
    if(state.demo){el.innerHTML='<article class="card"><b>Aún no tienes errores en la demo.</b></article>';return;}
    try{const d=await api('getErrors',authPayload());const arr=d.errors||[];el.innerHTML=arr.length?arr.map(x=>`<article class="card error-item clickable" data-error-id="${esc(x.id)}"><div><b>${esc(x.especialidad||'General')} · ${esc(x.tema||'')}</b><p>${esc(x.pregunta)}</p><small>Haz clic para ver la respuesta correcta y la explicación.</small></div><span class="pill p-red">${x.fallos} fallo${x.fallos===1?'':'s'}</span></article>`).join(''):'<article class="card"><b>Sin errores registrados todavía.</b><p>Cuando falles una pregunta aparecerá aquí.</p></article>';}
    catch(e){el.innerHTML=`<article class="card">${esc(friendlyError(e))}</article>`;}
  }
  async function openErrorDetail(questionId){
    const modal=$('errorDetailModal'),box=$('errorDetailContent');if(!modal||!box)return;
    modal.classList.remove('hidden');box.innerHTML='<div class="loading-inline">Cargando explicación...</div>';
    try{
      let d;
      if(state.demo){const q=demoQuestions.find(x=>x.id===questionId);d=q?{question:q,correcta:q.correcta,explicacion:q.explicacion,datito_galactico:q.datito_galactico,estadisticas:{}}:null;}
      else d=await api('getErrorDetail',authPayload({question_id:questionId}));
      if(!d)throw new Error('QUESTION_NOT_FOUND');
      const q=d.question||{},opts=q.opciones||{};
      box.innerHTML=`<span class="pill p-red">❌ Error registrado</span><h2>Revisión de la pregunta</h2><div class="error-detail-question">${esc(q.pregunta||'')}</div><div class="error-options">${['A','B','C','D','E'].filter(k=>opts[k]).map(k=>`<div class="error-option ${k===d.correcta?'correct':''}"><b>${k}.</b> ${esc(opts[k])}${k===d.correcta?' <strong>✓ Correcta</strong>':''}</div>`).join('')}</div><div class="error-explanation"><b>¿Por qué?</b><br>${esc(d.explicacion||'Comentario pendiente de revisión.')}</div>${d.datito_galactico?`<div class="error-galaxy">🚀 ${esc(d.datito_galactico)}</div>`:''}`;
    }catch(e){box.innerHTML=`<h2>No se pudo cargar la revisión</h2><p>${esc(friendlyError(e))}</p>`;}
  }

  async function loadProfile(){
    if(!state.user)return;
    if(state.demo){loadProfileDemo();return;}
    try{
      const [d,plazas]=await Promise.all([api('getProfile',authPayload()),loadDreamPlazas()]);
      state.profile=d.profile;renderProfile(d.profile);
      if(!state.progress) loadProgressData().catch(()=>{});
    }catch(e){toast(friendlyError(e));}
  }
  function loadProfileDemo(){
    state.dreamPlazas=demoDreamPlazas();
    renderProfile({nombre:state.user.nombre,apellido:state.user.apellido,objetivo:state.user.objetivo,enam_score:'',graduation_year:'',pregrad_average:'',serums_difficulty:'',first_level_years:0,fifth_superior:false,dream_plaza_id:''});
    setupDreamSelectors();
  }
  function renderProfile(p){
    $('profileName').value=p.nombre||'';$('profileLast').value=p.apellido||'';$('profileGoal').value=p.objetivo||'';$('profileEnamScore').value=p.enam_score||'';$('profileGradYear').value=p.graduation_year||'';$('profilePregradAvg').value=p.pregrad_average||'';$('profileSerumsDifficulty').value=p.serums_difficulty||'';$('profileFirstLevelYears').value=p.first_level_years||0;$('profileFifthSuperior').checked=Boolean(p.fifth_superior);
    state.dreamSelected=p.dream_plaza_id||state.dreamSelected||'';$('dreamPlazaCard')?.classList.toggle('hidden',(p.objetivo||'')!=='ENARM');renderCv();setupDreamSelectors();renderDreamProjection();
  }
  async function saveProfile(){
    const p={nombre:$('profileName').value.trim(),apellido:$('profileLast').value.trim(),objetivo:$('profileGoal').value,enam_score:$('profileEnamScore').value,graduation_year:$('profileGradYear').value,pregrad_average:$('profilePregradAvg').value,serums_difficulty:$('profileSerumsDifficulty').value,first_level_years:$('profileFirstLevelYears').value,fifth_superior:$('profileFifthSuperior').checked,dream_plaza_id:$('dreamPlaza')?.value||''};
    if(state.demo){state.user.nombre=p.nombre||state.user.nombre;state.user.apellido=p.apellido||state.user.apellido;state.user.objetivo=p.objetivo;state.profile={...(state.profile||{}),...p};state.dreamSelected=p.dream_plaza_id;renderGoalGreeting(p.objetivo);renderDreamProjection();toast('Perfil demo actualizado');return;}
    const d=await api('saveProfile',authPayload({profile:p}));state.profile=d.profile;state.dreamSelected=d.profile.dream_plaza_id||'';state.user={...state.user,nombre:d.profile.nombre,apellido:d.profile.apellido,objetivo:d.profile.objetivo};writeJSON('banqo_user',state.user);$('userName').textContent=state.user.nombre;renderGoalGreeting(state.user.objetivo);renderDreamProjection();toast('Perfil guardado');
  }

  async function loadProgressData(){
    if(state.demo){
      state.progress={history:[
        {type:'SIMULACRO',date:new Date(Date.now()-6*86400000).toISOString(),score:58,total:20,label:'Simulacro ENARM'},
        {type:'BANQUEO',date:new Date(Date.now()-5*86400000).toISOString(),score:70,total:10,label:'Banqueo'},
        {type:'SIMULACRO',date:new Date(Date.now()-3*86400000).toISOString(),score:64,total:20,label:'Simulacro ENARM'},
        {type:'SIMULACRO',date:new Date(Date.now()-1*86400000).toISOString(),score:69,total:20,label:'Simulacro ENARM'}
      ]};
      return state.progress;
    }
    const d=await api('getProgress',authPayload());
    state.progress=d;
    return d;
  }
  async function loadProgress(){
    try{
      $('progressUpdated').textContent='Actualizando...';
      const d=state.progress||await loadProgressData();
      renderProgress(d);
      $('progressUpdated').textContent='Al día';
      renderDreamProjection();
    }catch(e){
      $('progressUpdated').textContent='Error';
      toast(friendlyError(e));
    }
  }
  function setProgressFilter(filter){
    state.progressFilter=filter||'TODOS';
    qsa('[data-progress-filter]').forEach(b=>b.classList.toggle('active',b.dataset.progressFilter===state.progressFilter));
    if(state.progress) renderProgress(state.progress);
  }
  function filteredHistory(data){
    const arr=(data?.history||[]).slice().sort((a,b)=>new Date(a.date)-new Date(b.date));
    return state.progressFilter==='TODOS'?arr:arr.filter(x=>x.type===state.progressFilter);
  }
  function renderProgress(data){
    const arr=filteredHistory(data),scores=arr.map(x=>Number(x.score||0)).filter(x=>Number.isFinite(x));
    $('progSessions').textContent=arr.length;
    $('progAverage').textContent=scores.length?`${round1(scores.reduce((a,b)=>a+b,0)/scores.length)}%`:'—';
    $('progBest').textContent=scores.length?`${round1(Math.max(...scores))}%`:'—';
    $('progLatest').textContent=scores.length?`${round1(scores[scores.length-1])}%`:'—';
    const names={TODOS:'Evolución general',SIMULACRO:'Evolución de simulacros',BANQUEO:'Evolución de banqueos',BATALLA:'Evolución de batallas'};
    $('progressChartTitle').textContent=names[state.progressFilter]||'Evolución';
    $('progressChartSubtitle').textContent=arr.length?`${arr.length} sesión${arr.length===1?'':'es'} registrada${arr.length===1?'':'s'}.`:'Aún no hay sesiones registradas con este filtro.';
    $('progressChart').innerHTML=buildLineChart(arr.map((x,i)=>({label:String(i+1),value:Number(x.score||0)})),null);
    $('progressHistory').innerHTML=arr.length?arr.slice().reverse().map(x=>`<div class="progress-row"><div><b>${esc(x.label||x.type)}</b><small>${formatDate(x.date)} · ${esc(x.type)}</small></div><strong>${round1(x.score)}%</strong></div>`).join(''):'<p class="muted">Aún no hay resultados con este filtro.</p>';
  }
  function buildLineChart(points,target){
    if(!points.length)return '<div class="empty-chart">Aún no hay sesiones registradas.</div>';
    const w=760,h=250,pad=34,minY=0,maxY=100;
    const x=i=>points.length===1?w/2:pad+i*(w-2*pad)/(points.length-1);
    const y=v=>h-pad-(Math.max(minY,Math.min(maxY,v))-minY)/(maxY-minY)*(h-2*pad);
    const poly=points.map((p,i)=>`${x(i)},${y(Number(p.value||0))}`).join(' ');
    const grid=[0,20,40,60,80,100].map(v=>`<line x1="${pad}" y1="${y(v)}" x2="${w-pad}" y2="${y(v)}" class="chart-grid"/><text x="4" y="${y(v)+4}" class="chart-axis">${v}</text>`).join('');
    const targetLine=target==null?'':`<line x1="${pad}" y1="${y(target)}" x2="${w-pad}" y2="${y(target)}" class="chart-target"/><text x="${w-pad-4}" y="${y(target)-7}" text-anchor="end" class="chart-target-label">Meta ${round1(target)}</text>`;
    const dots=points.map((p,i)=>`<circle cx="${x(i)}" cy="${y(Number(p.value||0))}" r="5" class="chart-dot"><title>${esc(p.label||String(i+1))}: ${round1(p.value)}%</title></circle>`).join('');
    const labels=points.length<=12?points.map((p,i)=>`<text x="${x(i)}" y="${h-8}" text-anchor="middle" class="chart-axis">${esc(p.label||String(i+1))}</text>`).join(''):'';
    return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Gráfico de progreso">${grid}${targetLine}<polyline points="${poly}" class="chart-line"/>${dots}${labels}</svg>`;
  }
  function formatDate(v){
    const d=new Date(v);if(isNaN(d))return '';
    return d.toLocaleDateString('es-PE',{day:'2-digit',month:'short'});
  }

  function demoDreamPlazas(){
    return [
      {id:'2025-ENDO-SEGUIN',especialidad:'Endocrinología',sede:'Hospital Nacional III-1 Carlos Alberto Seguín Escobedo',modalidad:'Libre',anio:2025,puntaje_referencia:76.797},
      {id:'2025-ORL-SEGUIN',especialidad:'Otorrinolaringología',sede:'Hospital Nacional III-1 Carlos Alberto Seguín Escobedo',modalidad:'Libre',anio:2025,puntaje_referencia:73.264},
      {id:'2025-PED-SEGUIN',especialidad:'Pediatría',sede:'Hospital Nacional III-1 Carlos Alberto Seguín Escobedo',modalidad:'Libre',anio:2025,puntaje_referencia:69.403}
    ];
  }
  async function loadDreamPlazas(){
    if(state.demo){state.dreamPlazas=demoDreamPlazas();return state.dreamPlazas;}
    if(state.dreamPlazas.length)return state.dreamPlazas;
    const d=await api('getDreamPlazas',authPayload());
    state.dreamPlazas=d.plazas||[];
    setupDreamSelectors();
    return state.dreamPlazas;
  }
  function setupDreamSelectors(){
    const s=$('dreamSpecialty'),p=$('dreamPlaza');if(!s||!p)return;
    const specialties=[...new Set((state.dreamPlazas||[]).map(x=>x.especialidad).filter(Boolean))].sort();
    const currentSpecialty=(state.dreamPlazas||[]).find(x=>String(x.id)===String(state.dreamSelected))?.especialidad||s.value||'';
    s.innerHTML='<option value="">Selecciona especialidad</option>'+specialties.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');
    if(currentSpecialty)s.value=currentSpecialty;
    populateDreamPlazas(s.value);
  }
  function populateDreamPlazas(specialty){
    const el=$('dreamPlaza');if(!el)return;
    const arr=(state.dreamPlazas||[]).filter(x=>!specialty||x.especialidad===specialty);
    el.innerHTML='<option value="">Selecciona una plaza</option>'+arr.map(x=>`<option value="${esc(x.id)}">${esc(x.sede)} · ${esc(x.modalidad||'Libre')} · ${esc(x.anio)}</option>`).join('');
    if(state.dreamSelected && arr.some(x=>String(x.id)===String(state.dreamSelected)))el.value=state.dreamSelected;
  }
  function currentCvEstimate(){
    const year=Number($('profileGradYear')?.value||0),enam=Number($('profileEnamScore')?.value||0),avg=Number($('profilePregradAvg')?.value||0),ser=Number($('profileSerumsDifficulty')?.value||0),years=Number($('profileFirstLevelYears')?.value||0),fifth=Boolean($('profileFifthSuperior')?.checked);
    const serMap={1:1,2:3,3:6,4:8,5:10}; const serPts=serMap[ser]||0,firstPts=years>=5?4:years===4?3:years===3?2:years===2?1:0,fifthPts=fifth?1:0;
    let academic=0;
    if(year && year<2009)academic=Math.min(5,Math.max(0,avg/20*5));
    else{const enamPts=enam>=18?2.5:enam>=15?2:enam>=13?1.5:enam>=11?1:0,avgPts=Math.min(2.5,Math.max(0,avg/20*2.5));academic=Math.min(5,enamPts+avgPts);}
    return serPts+firstPts+fifthPts+academic;
  }
  function renderDreamProjection(){
    const id=$('dreamPlaza')?.value||state.dreamSelected||'';
    const plaza=(state.dreamPlazas||[]).find(x=>String(x.id)===String(id));
    if(!plaza){$('dreamReference')?.classList.add('hidden');if($('dreamChart'))$('dreamChart').innerHTML='<div class="empty-chart">Selecciona una plaza para ver tu evolución.</div>';return;}
    state.dreamSelected=String(plaza.id);
    const sims=(state.progress?.history||[]).filter(x=>x.type==='SIMULACRO').sort((a,b)=>new Date(a.date)-new Date(b.date));
    const cv=currentCvEstimate();
    const projected=sims.map((x,i)=>({label:String(i+1),value:Math.min(100,Number(x.score||0)*0.8+cv)}));
    const current=projected.length?projected[projected.length-1].value:null,target=Number(plaza.puntaje_referencia||0),gap=current==null?null:current-target;
    $('dreamReference').classList.remove('hidden');$('dreamTargetScore').textContent=target?round1(target):'—';$('dreamCurrentScore').textContent=current==null?'—':round1(current);$('dreamGap').textContent=gap==null?'—':`${gap>=0?'+':''}${round1(gap)}`;$('dreamGap').className=gap==null?'':gap>=0?'positive':'negative';
    $('dreamChart').innerHTML=projected.length?buildLineChart(projected,target):'<div class="empty-chart">Completa al menos un simulacro para comparar tu proyección.</div>';
    $('dreamNote').textContent=`Referencia observada ${plaza.anio}: ${plaza.especialidad} · ${plaza.sede}. BANQO proyecta tu resultado oficial como 80% del rendimiento del simulacro + tu CV estimado actual (${round1(cv)}/20). Es una referencia histórica, no un corte garantizado.`;
  }

  function renderCv(){
    const year=Number($('profileGradYear')?.value||0),enam=Number($('profileEnamScore')?.value||0),avg=Number($('profilePregradAvg')?.value||0),ser=Number($('profileSerumsDifficulty')?.value||0),years=Number($('profileFirstLevelYears')?.value||0),fifth=Boolean($('profileFifthSuperior')?.checked);
    const serMap={1:1,2:3,3:6,4:8,5:10}; const serPts=serMap[ser]||0,firstPts=years>=5?4:years===4?3:years===3?2:years===2?1:0,fifthPts=fifth?1:0;
    let academic=0,desc='';
    if(year && year<2009){academic=Math.min(5,Math.max(0,avg/20*5));desc='Graduados antes de 2009: estimación académica basada en promedio de pregrado.';}
    else{let enamPts=enam>=18?2.5:enam>=15?2:enam>=13?1.5:enam>=11?1:0;let avgPts=Math.min(2.5,Math.max(0,avg/20*2.5));academic=Math.min(5,enamPts+avgPts);desc='Graduados desde 2009: ENAM + promedio de pregrado/internado, máximo 5 puntos.';}
    const total=serPts+firstPts+fifthPts+academic;$('cvSerums').textContent=serPts.toFixed(2);$('cvFirstLevel').textContent=firstPts.toFixed(2);$('cvFifth').textContent=fifthPts.toFixed(2);$('cvAcademic').textContent=academic.toFixed(2);$('cvTotal').textContent=total.toFixed(2);$('cvExplanation').textContent=desc;
  }

  function round1(v){return Math.round(Number(v||0)*10)/10;}
  function shuffleLocal(arr){const a=arr.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}

  boot();
})();
