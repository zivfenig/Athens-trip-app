// ============================================================
//  GREECE TRIP APP – Logic (app.js)
//  Model: openai/gpt-oss-120b:groq via HuggingFace Router
// ============================================================

// ─── CONSTANTS ───────────────────────────────────────────────
const ALLOWED_USERS       = ['זיו', 'ירדן', 'מנהל'];
const HOTEL_LAT           = 37.9271;
const HOTEL_LNG           = 23.7058;
const DAY_NAMES           = ['יום 1', 'יום 2', 'יום 3', 'יום 4'];
const EUR_TO_ILS_FALLBACK = 3.9;

// ── HuggingFace Router ────────────────────────────────────────
const HF_BASE_URL = 'https://router.huggingface.co/v1';
const HF_MODEL    = 'openai/gpt-oss-120b:groq';
// ⬇️  הכנס כאן את ה-HF Token שלך (או הזן דרך ממשק 🔑)
const HF_TOKEN_HARDCODED = 'YOUR_HF_TOKEN_HERE';

const CAT_CONFIG = {
  shopping: { label: 'שופינג',  emoji: '🛍️', color: '#9b72f0' },
  food:     { label: 'אוכל',    emoji: '🍽️', color: '#f5874a' },
  transport:{ label: 'תחבורה',  emoji: '🚌', color: '#3a9fd8' },
  other:    { label: 'אחר',     emoji: '📦', color: '#2dd4a0' }
};

// ─── STATE ───────────────────────────────────────────────────
let currentUser      = '';
let isAdmin          = false;
let currentDay       = 0;
let selectedCat      = 'shopping';
let selectedCurrency = 'ILS';
let showAllInILS     = false;
let eurRate          = EUR_TO_ILS_FALLBACK;
let rateIsLive       = false;
let editingAttrId    = null;
let chatHistory      = [];   // full multi-turn history

// ─── HF API ──────────────────────────────────────────────────
function getHfToken() {
  return HF_TOKEN_HARDCODED !== 'YOUR_HF_TOKEN_HERE'
    ? HF_TOKEN_HARDCODED
    : (localStorage.getItem('hf_token') || '');
}
function saveHfToken(k) { localStorage.setItem('hf_token', k.trim()); }

async function hfChat(messages) {
  const token = getHfToken();
  if (!token) throw new Error('NO_KEY');

  const res = await fetch(`${HF_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ model: HF_MODEL, max_tokens: 1024, messages })
  });

  if (res.status === 401 || res.status === 403) throw new Error('KEY_INVALID');
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || 'שגיאת שרת ' + res.status);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
}

function aiErrMsg(err) {
  if (err.message === 'NO_KEY')      return 'לא הוגדר HuggingFace Token. לחץ על 🔑 בראש המסך.';
  if (err.message === 'KEY_INVALID') return 'ה-Token אינו תקין. עדכן אותו דרך 🔑.';
  return 'שגיאת רשת: ' + err.message;
}

// ─── DEFAULT ATTRACTIONS ─────────────────────────────────────
const defaultAttractions = [
  { id:1, day:0, name:'האקרופוליס', order:1,
    desc:'אתר הירושה העולמי המפורסם עם הפרתנון המרשים',
    time:'09:00 - 11:30', lat:37.9715, lng:23.7267,
    address:'Acropolis, Athens', hours:'א׳-ו׳ 08:00-20:00', tips:'קנו כרטיסים מראש!' },
  { id:2, day:0, name:'מוזיאון האקרופוליס', order:2,
    desc:'מוזיאון מודרני עם ממצאים מהאקרופוליס',
    time:'11:30 - 13:00', lat:37.9681, lng:23.7289,
    address:'Acropolis Museum, Athens', hours:'א׳-ו׳ 09:00-17:00', tips:'ממוזג ונעים בקיץ' },
  { id:3, day:0, name:'פלאקה – השכונה הישנה', order:3,
    desc:'שכונה היסטורית עם חנויות, מסעדות וצבעוניות יוונית',
    time:'14:00 - 17:00', lat:37.9745, lng:23.7305,
    address:'Plaka, Athens', hours:'כל השבוע', tips:'נסו גלידה יוונית!' },
  { id:4, day:1, name:'נמל פיראוס', order:1,
    desc:'הנמל הגדול ביוון, נקודת יציאה לאיים',
    time:'09:00 - 10:30', lat:37.9422, lng:23.6466,
    address:'Piraeus Port', hours:'פתוח 24/7', tips:'אפשרות לטיול יום לאיים' },
  { id:5, day:1, name:'כף סוניון', order:2,
    desc:'חורבות מקדש פוסידון על צוק עם נוף לים האגאי',
    time:'12:00 - 15:00', lat:37.6513, lng:24.0264,
    address:'Cape Sounion', hours:'09:30-20:00', tips:'שקיעה מדהימה!' },
  { id:6, day:2, name:'מונסטיראקי', order:1,
    desc:'שוק פשפשים ואזור קניות עשיר בתרבות',
    time:'10:00 - 13:00', lat:37.9753, lng:23.7244,
    address:'Monastiraki, Athens', hours:'כל ימי השבוע', tips:'שבת הוא יום השוק הגדול' },
  { id:7, day:2, name:'גבעת לוקבטוס', order:2,
    desc:'הנקודה הגבוהה ביותר באתונה עם פנורמה של 360°',
    time:'17:00 - 19:00', lat:37.9811, lng:23.7442,
    address:'Lycabettus Hill, Athens', hours:'כל השנה', tips:'עלייה ברכבל כבלים – 7€' },
  { id:8, day:3, name:'אגורה הרומאית', order:1,
    desc:'שוק רומי עתיק הסמוך לאגורה האתנאית',
    time:'09:00 - 11:00', lat:37.9751, lng:23.7236,
    address:'Roman Agora, Athens', hours:'08:00-20:00', tips:'כלול בכרטיס מאוחד' },
  { id:9, day:3, name:'חוף גליפאדה', order:2,
    desc:'חוף ים קרוב לאתונה, מושלם לשחייה ומנוחה',
    time:'13:00 - 17:00', lat:37.8687, lng:23.7508,
    address:'Glyfada Beach, Athens', hours:'פתוח כל השנה', tips:'לא ממרחק רחוק' }
];

// ─── STORAGE ─────────────────────────────────────────────────
function getAttractions() {
  const s = localStorage.getItem('trip_attractions');
  return s ? JSON.parse(s) : defaultAttractions;
}
function saveAttractions(d) { localStorage.setItem('trip_attractions', JSON.stringify(d)); }
function getExpenses() {
  const s = localStorage.getItem('trip_expenses');
  return s ? JSON.parse(s) : [];
}
function saveExpenses(d) { localStorage.setItem('trip_expenses', JSON.stringify(d)); }

// ─── EXCHANGE RATE ────────────────────────────────────────────
async function fetchEurRate() {
  try {
    const res = await fetch('https://api.frankfurter.app/latest?from=EUR&to=ILS');
    if (!res.ok) throw new Error();
    const data = await res.json();
    if (data.rates?.ILS) { eurRate = data.rates.ILS; rateIsLive = true; }
  } catch {
    rateIsLive = false;
    promptManualRate();
  }
  updateRateTag();
}
function promptManualRate() {
  const tag = document.getElementById('rateTag');
  if (!tag) return;
  tag.className = 'rate-tag stale';
  tag.innerHTML = `⚠️ שער לא זמין – <button onclick="askManualRate()" style="background:none;border:none;color:var(--orange);font-weight:700;cursor:pointer;font-family:'Heebo',sans-serif;font-size:12px;text-decoration:underline">הזן ידנית</button>`;
}
function askManualRate() {
  const val = prompt('הכנס שער יורו לשקל:', eurRate.toFixed(2));
  if (val && !isNaN(parseFloat(val))) {
    eurRate = parseFloat(val); rateIsLive = false;
    updateRateTag(); renderExpenses(); updateExpenseSummary();
    showToast('✅ שער עודכן: ₪' + eurRate.toFixed(2));
  }
}
function updateRateTag() {
  const tag = document.getElementById('rateTag');
  if (!tag) return;
  if (rateIsLive) {
    tag.className = 'rate-tag';
    tag.innerHTML = `🟢 שער אמת: €1 = ₪${eurRate.toFixed(3)}`;
  } else {
    tag.className = 'rate-tag stale';
    tag.innerHTML = `🟡 שער ידני: €1 = ₪${eurRate.toFixed(3)} <button onclick="askManualRate()" style="background:none;border:none;color:var(--orange);font-weight:700;cursor:pointer;font-family:'Heebo',sans-serif;font-size:12px;margin-right:4px">עדכן</button>`;
  }
}

// ─── LOGIN ───────────────────────────────────────────────────
function doLogin() {
  const val = document.getElementById('usernameInput').value.trim();
  const err = document.getElementById('loginError');
  if (!val)                           { err.textContent = 'הכניסו שם משתמש'; return; }
  if (!ALLOWED_USERS.includes(val))   { err.textContent = 'שם משתמש לא מורשה'; return; }
  err.textContent = '';
  currentUser = val; isAdmin = (val === 'מנהל');
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  document.getElementById('topBarUser').textContent = val;
  document.getElementById('adminBadgeTop').style.display = isAdmin ? 'inline' : 'none';
  document.getElementById('adminAddBtn').style.display   = isAdmin ? 'block'  : 'none';
  if (!localStorage.getItem('trip_attractions')) saveAttractions(defaultAttractions);
  fetchEurRate();
  initApp();
}
function doLogout() {
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
  document.getElementById('usernameInput').value = '';
  currentUser = ''; isAdmin = false; chatHistory = [];
}

// ─── NAVIGATION ──────────────────────────────────────────────
function showPage(name, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  document.getElementById('page' + name.charAt(0).toUpperCase() + name.slice(1)).classList.add('active');
  if (btn) btn.classList.add('active');
  if (name === 'itinerary')   renderItinerary();
  if (name === 'expenses')    { renderExpenses(); updateExpenseSummary(); }
  if (name === 'restaurants') renderRestaurants();
}

// ─── INIT ─────────────────────────────────────────────────────
function initApp() {
  renderSummary();
  buildDayTabs();
  renderItinerary();
  renderExpenses();
  updateExpenseSummary();
  updateKeyStatus();
  renderRestaurants();
}

// ─── SUMMARY ─────────────────────────────────────────────────
function renderSummary() {
  const attrs = getAttractions(), exps = getExpenses();
  document.getElementById('statAttrs').textContent    = attrs.length;
  document.getElementById('statExpenses').textContent = exps.length;
  const list = document.getElementById('summaryDaysList');
  list.innerHTML = '';
  for (let d = 0; d < 4; d++) {
    const da = attrs.filter(a => a.day === d);
    const div = document.createElement('div');
    div.className = 'summary-day-card';
    div.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div style="font-weight:700;font-size:15px">📅 ${DAY_NAMES[d]}</div>
        <div style="font-size:12px;color:var(--text-dim)">${da.length} אטרקציות</div>
      </div>
      <div style="margin-top:8px;font-size:13px;color:var(--text-dim)">${da.map(a=>a.name).join(' • ')||'אין אטרקציות עדיין'}</div>`;
    div.onclick = () => { currentDay=d; showPage('itinerary', document.querySelectorAll('.nav-item')[1]); };
    list.appendChild(div);
  }
}

// ─── EXPENSE SUMMARY WIDGET ───────────────────────────────────
function updateExpenseSummary() {
  const exps = getExpenses();
  const cats = ['shopping','food','transport','other'];
  const totals = {}; let grand = 0;
  cats.forEach(c => { totals[c] = 0; });
  exps.forEach(e => {
    const ils = e.currency==='EUR' ? e.amount*eurRate : e.amount;
    totals[e.cat] = (totals[e.cat]||0) + ils; grand += ils;
  });
  ['summaryTotal','summaryTotal2'].forEach(id => {
    const el = document.getElementById(id); if(el) el.textContent = '₪'+grand.toFixed(0);
  });
  ['summaryBars','summaryBars2'].forEach(id => {
    const el = document.getElementById(id); if(!el) return;
    el.innerHTML = cats.map(c => {
      const pct = grand>0 ? (totals[c]/grand*100) : 0;
      return `<div class="cat-bar-row">
        <div class="cat-bar-label">${CAT_CONFIG[c].emoji} ${CAT_CONFIG[c].label}</div>
        <div class="cat-bar-track"><div class="cat-bar-fill" style="width:${pct}%;background:${CAT_CONFIG[c].color}"></div></div>
        <div class="cat-bar-amount">₪${totals[c].toFixed(0)}</div>
      </div>`;
    }).join('');
  });
  renderSummary();
}

// ─── ITINERARY ────────────────────────────────────────────────
function buildDayTabs() {
  const tabs = document.getElementById('dayTabs');
  tabs.innerHTML = '';
  DAY_NAMES.forEach((name,i) => {
    const btn = document.createElement('button');
    btn.className = 'day-tab' + (i===currentDay?' active':'');
    btn.textContent = name;
    btn.onclick = () => { currentDay=i; document.querySelectorAll('.day-tab').forEach(t=>t.classList.remove('active')); btn.classList.add('active'); renderItinerary(); };
    tabs.appendChild(btn);
  });
}
function renderItinerary() {
  buildDayTabs();
  const attrs = getAttractions().filter(a=>a.day===currentDay).sort((a,b)=>(a.order||99)-(b.order||99));
  const list = document.getElementById('attractionsList');
  list.innerHTML = '';
  if (!attrs.length) { list.innerHTML = '<div style="text-align:center;color:var(--text-dim);padding:40px;font-size:14px">אין אטרקציות ליום זה עדיין</div>'; return; }
  attrs.forEach((attr,idx) => {
    if (idx>0) { const c=document.createElement('div'); c.className='attr-connector'; c.textContent='🚶 הגעה לאטרקציה הבאה'; list.appendChild(c); }
    const card = document.createElement('div');
    card.className = 'attr-card';
    const adminBtns = isAdmin ? `<button class="attr-btn btn-edit" onclick="openEditAttrModal(${attr.id})">✏️ עריכה</button><button class="attr-btn btn-delete" onclick="deleteAttr(${attr.id})">🗑️ מחק</button>` : '';
    card.innerHTML = `
      <div class="attr-order">${idx+1}</div>
      <div class="attr-name">${attr.name}</div>
      <div class="attr-desc">${attr.desc}</div>
      <div class="attr-time">🕐 ${attr.time}</div>
      <div class="attr-actions">
        <a class="attr-btn btn-nav" href="https://www.google.com/maps/dir/?api=1&destination=${attr.lat},${attr.lng}&travelmode=driving" target="_blank">🧭 נווט אליי</a>
        <button class="attr-btn btn-info" onclick="showAttrInfo(${attr.id})">ℹ️ מידע</button>
        ${adminBtns}
      </div>`;
    list.appendChild(card);
  });
}

// ─── OPTIMIZE ────────────────────────────────────────────────
function optimizeDay() {
  let all=getAttractions(), da=all.filter(a=>a.day===currentDay);
  if (da.length<2) { showToast('⚠️ צריך לפחות 2 אטרקציות'); return; }
  let rem=[...da], ord=[], cLat=HOTEL_LAT, cLng=HOTEL_LNG;
  while(rem.length) {
    let best=null, bd=Infinity;
    rem.forEach(a=>{ const d=Math.hypot(a.lat-cLat,a.lng-cLng); if(d<bd){bd=d;best=a;} });
    ord.push(best); cLat=best.lat; cLng=best.lng; rem=rem.filter(a=>a.id!==best.id);
  }
  ord.forEach((a,i)=>{ a.order=i+1; });
  ord.forEach(oa=>{ const idx=all.findIndex(a=>a.id===oa.id); if(idx>=0)all[idx].order=oa.order; });
  saveAttractions(all); renderItinerary(); showToast('✅ סדר עודכן!');
}

// ─── ATTR INFO / EDIT ─────────────────────────────────────────
function showAttrInfo(id) {
  const attr=getAttractions().find(a=>a.id===id); if(!attr) return;
  document.getElementById('modalTitle').textContent = attr.name;
  document.getElementById('modalContent').innerHTML = `
    <div class="modal-body">
      <h4>📍 כתובת</h4><p>${attr.address}</p>
      <h4>🕐 שעות פתיחה</h4><p>${attr.hours||'לא זמין'}</p>
      <h4>📝 תיאור</h4><p>${attr.desc}</p>
      <h4>💡 טיפים</h4><p>${attr.tips||'ללא טיפים'}</p>
      <h4>🗺️ מיקום</h4>
      <a href="https://www.google.com/maps/search/?api=1&query=${attr.lat},${attr.lng}" target="_blank" style="color:var(--blue-light)">פתח בגוגל מפס ↗</a>
    </div>
    <iframe src="https://maps.google.com/maps?q=${attr.lat},${attr.lng}&output=embed&z=15&hl=iw" style="width:100%;height:200px;border:none;border-radius:12px;margin-top:16px"></iframe>`;
  openModal();
}
function openAddAttrModal()   { editingAttrId=null; document.getElementById('modalTitle').textContent='➕ הוסף אטרקציה'; document.getElementById('modalContent').innerHTML=attrForm({}); openModal(); }
function openEditAttrModal(id){ editingAttrId=id; const a=getAttractions().find(x=>x.id===id); document.getElementById('modalTitle').textContent='✏️ עריכה'; document.getElementById('modalContent').innerHTML=attrForm(a); openModal(); }
function attrForm(a) {
  return `
    <label class="form-label">שם</label><input class="form-input" id="af_name" value="${a.name||''}" placeholder="שם...">
    <label class="form-label">תיאור</label><textarea class="form-textarea" id="af_desc" rows="2" style="resize:none">${a.desc||''}</textarea>
    <label class="form-label">שעות ביקור</label><input class="form-input" id="af_time" value="${a.time||''}" placeholder="09:00-11:00">
    <label class="form-label">כתובת</label><input class="form-input" id="af_address" value="${a.address||''}" placeholder="Athens, Greece">
    <label class="form-label">Latitude</label><input class="form-input" id="af_lat" value="${a.lat||''}" type="number" step="any" placeholder="37.97...">
    <label class="form-label">Longitude</label><input class="form-input" id="af_lng" value="${a.lng||''}" type="number" step="any" placeholder="23.72...">
    <label class="form-label">שעות פתיחה</label><input class="form-input" id="af_hours" value="${a.hours||''}" placeholder="09:00-20:00">
    <label class="form-label">טיפים</label><input class="form-input" id="af_tips" value="${a.tips||''}" placeholder="טיפים...">
    <label class="form-label">יום</label>
    <select class="form-select" id="af_day">${DAY_NAMES.map((n,i)=>`<option value="${i}"${a.day===i?' selected':''}>${n}</option>`).join('')}</select>
    <button class="save-btn" onclick="saveAttr()">💾 שמור</button>`;
}
function saveAttr() {
  const name=document.getElementById('af_name').value.trim(); if(!name){showToast('⚠️ הכניסו שם');return;}
  let all=getAttractions();
  const data={name,desc:document.getElementById('af_desc').value,time:document.getElementById('af_time').value,
    address:document.getElementById('af_address').value,lat:parseFloat(document.getElementById('af_lat').value)||37.97,
    lng:parseFloat(document.getElementById('af_lng').value)||23.72,hours:document.getElementById('af_hours').value,
    tips:document.getElementById('af_tips').value,day:parseInt(document.getElementById('af_day').value)};
  if(editingAttrId){ const idx=all.findIndex(a=>a.id===editingAttrId); if(idx>=0)all[idx]={...all[idx],...data}; }
  else { data.id=Date.now(); data.order=all.filter(a=>a.day===data.day).length+1; all.push(data); }
  saveAttractions(all); closeModalDirect(); renderItinerary(); showToast('✅ נשמר!');
}
function deleteAttr(id) { if(!confirm('למחוק?'))return; saveAttractions(getAttractions().filter(a=>a.id!==id)); renderItinerary(); showToast('🗑️ נמחק'); }

// ─── EXPENSES ─────────────────────────────────────────────────
function selectCat(el) {
  selectedCat=el.dataset.cat;
  document.querySelectorAll('#expCatChips .cat-chip').forEach(c=>{c.classList.remove('active');c.style.background='';c.style.borderColor='';c.style.color='';});
  el.classList.add('active'); el.style.background=CAT_CONFIG[selectedCat].color; el.style.borderColor=CAT_CONFIG[selectedCat].color; el.style.color='white';
}
function selectCurrency(c) {
  selectedCurrency=c;
  document.getElementById('btnILS').classList.toggle('active',c==='ILS');
  document.getElementById('btnEUR').classList.toggle('active',c==='EUR');
}
function addExpense() {
  const amount=parseFloat(document.getElementById('expAmount').value);
  const desc=document.getElementById('expDesc').value.trim();
  if(!amount||amount<=0){showToast('⚠️ סכום תקין');return;} if(!desc){showToast('⚠️ פירוט');return;}
  const exps=getExpenses();
  exps.push({id:Date.now(),cat:selectedCat,desc,amount,currency:selectedCurrency,date:new Date().toLocaleDateString('he-IL')});
  saveExpenses(exps); document.getElementById('expAmount').value=''; document.getElementById('expDesc').value='';
  renderExpenses(); updateExpenseSummary(); showToast('✅ הוצאה נוספה!');
}
function deleteExpense(id) { saveExpenses(getExpenses().filter(e=>e.id!==id)); renderExpenses(); updateExpenseSummary(); showToast('🗑️ נמחק'); }
function toggleConversion() {
  showAllInILS=!showAllInILS;
  document.getElementById('convertBtn').innerHTML=showAllInILS?'💱 הצג במטבע מקורי':'💱 הצג הכל בשקלים';
  renderExpenses();
}
function renderExpenses() {
  const exps=getExpenses(), list=document.getElementById('expensesList');
  if(!exps.length){list.innerHTML='<div style="text-align:center;color:var(--text-dim);padding:30px;font-size:14px">אין הוצאות עדיין</div>';return;}
  list.innerHTML=[...exps].reverse().map(e=>{
    const cat=CAT_CONFIG[e.cat]; let displayAmt,subAmt='';
    if(showAllInILS){const ils=e.currency==='EUR'?e.amount*eurRate:e.amount; displayAmt='₪'+ils.toFixed(0); if(e.currency==='EUR')subAmt=`<div style="font-size:11px;color:var(--text-dim)">€${e.amount}</div>`;}
    else{displayAmt=(e.currency==='EUR'?'€':'₪')+e.amount.toFixed(0);}
    return `<div class="expense-item">
      <div class="expense-item-cat">${cat.emoji}</div>
      <div class="expense-item-info"><div class="expense-item-cat-name">${cat.label} · ${e.date}</div><div class="expense-item-desc">${e.desc}</div></div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
        <div class="expense-item-amount">${displayAmt}</div>${subAmt}
        <button class="expense-item-del" onclick="deleteExpense(${e.id})">🗑️</button>
      </div></div>`;
  }).join('');
  updateExpenseSummary();
}

// ─── EXPORT CSV ───────────────────────────────────────────────
function exportCSV() {
  const exps=getExpenses(); if(!exps.length){showToast('⚠️ אין הוצאות');return;}
  const rows=exps.map(e=>{
    const ils=e.currency==='EUR'?(e.amount*eurRate).toFixed(2):e.amount.toFixed(2);
    const desc=e.desc.includes(',')? `"${e.desc}"` :e.desc;
    return `${e.date},${CAT_CONFIG[e.cat]?.label||e.cat},${desc},${e.amount},${e.currency},${ils}`;
  });
  const blob=new Blob(['\uFEFF'+'תאריך,קטגוריה,פירוט,סכום,מטבע,בשקלים\n'+rows.join('\n')],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob), a=document.createElement('a');
  a.href=url; a.download='הוצאות-יוון.csv'; a.click(); URL.revokeObjectURL(url);
  showToast('📥 CSV הורד!');
}

// ─── AI EXPENSE ANALYSIS ──────────────────────────────────────
async function analyzeExpenses() {
  const exps=getExpenses(); if(!exps.length){showToast('⚠️ אין הוצאות');return;}
  const resultEl=document.getElementById('aiExpenseResult');
  resultEl.style.display='block';
  resultEl.innerHTML='<div class="search-loading"><div class="spinner"></div><br>מנתח הוצאות...</div>';
  const totals={}; let grand=0;
  exps.forEach(e=>{const ils=e.currency==='EUR'?e.amount*eurRate:e.amount; totals[e.cat]=(totals[e.cat]||0)+ils; grand+=ils;});
  const breakdown=Object.entries(totals).map(([k,v])=>`${CAT_CONFIG[k].label}: ₪${v.toFixed(0)} (${(v/grand*100).toFixed(1)}%)`).join(', ');
  const expList=exps.map(e=>`${CAT_CONFIG[e.cat].label}: ${e.desc} – ₪${(e.currency==='EUR'?e.amount*eurRate:e.amount).toFixed(0)}`).join('\n');
  try {
    const text=await hfChat([
      {role:'system',content:'אתה יועץ פיננסי לטיולים. ענה בעברית בלבד.'},
      {role:'user',content:`סה"כ: ₪${grand.toFixed(0)}\nחלוקה: ${breakdown}\nפירוט:\n${expList}\n\nתן ניתוח קצר ו-3-4 המלצות חיסכון ספציפיות.`}
    ]);
    resultEl.innerHTML=`<div class="ai-result"><h3>🤖 ניתוח AI – המלצות חיסכון</h3>${text.replace(/\n/g,'<br>')}</div>`;
  } catch(err) {
    resultEl.innerHTML=`<div class="ai-result" style="border-color:rgba(232,85,85,0.3)"><h3 style="color:var(--red)">⚠️ שגיאה</h3>${aiErrMsg(err)}</div>`;
  }
}

// ─── CHAT ─────────────────────────────────────────────────────
const CHAT_SYSTEM = `אתה מדריך טיולים מומחה ליוון שמלווה ישראלים באתונה.
ענה תמיד בעברית בלבד, בצורה ידידותית וקצרה.
אתה מכיר את אתונה, האיים, האוכל, התחבורה ושעות הפתיחה של האתרים.
אם שאלו על מקום – ציין שעות פתיחה, מחיר כניסה (אם יש) וטיפ שימושי.`;

function appendChatBubble(role, text) {
  const area=document.getElementById('chatMessages');
  const wrap=document.createElement('div');
  wrap.className='chat-row '+(role==='user'?'chat-row-user':'chat-row-ai');
  const bubble=document.createElement('div');
  bubble.className='chat-bubble '+(role==='user'?'chat-bubble-user':'chat-bubble-ai');
  bubble.innerHTML=text.replace(/\n/g,'<br>');
  wrap.appendChild(bubble);
  area.appendChild(wrap);
  area.scrollTop=area.scrollHeight;
}
function appendTyping() {
  const area=document.getElementById('chatMessages');
  const wrap=document.createElement('div');
  wrap.className='chat-row chat-row-ai'; wrap.id='typingIndicator';
  wrap.innerHTML='<div class="chat-bubble chat-bubble-ai"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></div>';
  area.appendChild(wrap); area.scrollTop=area.scrollHeight;
}
async function sendChatMessage() {
  const input=document.getElementById('chatInput');
  const text=input.value.trim(); if(!text) return;
  input.value=''; input.style.height='auto';
  appendChatBubble('user', text);
  chatHistory.push({role:'user',content:text});
  appendTyping();
  document.getElementById('chatSendBtn').disabled=true;
  try {
    const reply=await hfChat([{role:'system',content:CHAT_SYSTEM},...chatHistory]);
    document.getElementById('typingIndicator')?.remove();
    chatHistory.push({role:'assistant',content:reply});
    appendChatBubble('assistant',reply);
  } catch(err) {
    document.getElementById('typingIndicator')?.remove();
    appendChatBubble('assistant','⚠️ '+aiErrMsg(err));
  } finally {
    document.getElementById('chatSendBtn').disabled=false;
    input.focus();
  }
}
function clearChat() {
  chatHistory=[];
  const area=document.getElementById('chatMessages');
  if(area) {
    area.innerHTML='';
    appendChatBubble('assistant','שלום! אני כאן לעזור לכם ביוון 🏛️\nשאלו אותי על מקומות, שעות פתיחה, אוכל, תחבורה – כל מה שצריך!');
  }
}

// ─── TOKEN MANAGEMENT UI ─────────────────────────────────────
function updateKeyStatus() {
  const el=document.getElementById('keyStatusBtn'); if(!el) return;
  const hasKey=HF_TOKEN_HARDCODED!=='YOUR_HF_TOKEN_HERE'||!!getHfToken();
  el.innerHTML=hasKey?'🔑 AI מוגדר ✅':'🔑 הגדר Token';
  el.style.borderColor=hasKey?'rgba(45,212,160,0.4)':'rgba(155,114,240,0.4)';
  el.style.color=hasKey?'var(--green)':'var(--purple)';
}
function showKeyModal() {
  const current=getHfToken();
  document.getElementById('modalTitle').textContent='🔑 HuggingFace Token';
  document.getElementById('modalContent').innerHTML=`
    <div class="modal-body" style="margin-bottom:12px">
      <p style="color:var(--text-dim);font-size:13px;margin-bottom:16px">ה-Token נשמר במכשיר זה בלבד.</p>
      <h4>קבל Token חינמי</h4>
      <p style="margin-bottom:16px"><a href="https://huggingface.co/settings/tokens" target="_blank" style="color:var(--blue-light)">huggingface.co/settings/tokens ↗</a><br>→ New Token → Type: Read</p>
      <h4>הכנס Token</h4>
    </div>
    <input class="form-input" id="keyInput" type="password" placeholder="hf_..." value="${current}" style="font-family:monospace">
    <button class="save-btn" onclick="saveKeyFromModal()">💾 שמור Token</button>
    ${current?`<button onclick="clearKey()" style="width:100%;margin-top:10px;background:rgba(232,85,85,0.1);border:1px solid rgba(232,85,85,0.3);color:var(--red);border-radius:12px;padding:12px;font-family:'Heebo',sans-serif;font-size:14px;font-weight:600;cursor:pointer;">🗑️ מחק Token</button>`:''}`;
  openModal();
}
function saveKeyFromModal() {
  const val=document.getElementById('keyInput').value.trim();
  if(!val){showToast('⚠️ הכנס Token');return;}
  saveHfToken(val); closeModalDirect(); updateKeyStatus(); showToast('✅ Token נשמר!');
}
function clearKey() {
  if(!confirm('למחוק Token?'))return;
  localStorage.removeItem('hf_token'); closeModalDirect(); updateKeyStatus(); showToast('🗑️ Token נמחק');
}

// ─── MODAL / TOAST ────────────────────────────────────────────
function openModal()       { document.getElementById('modalOverlay').classList.add('open'); }
function closeModal(e)     { if(e.target===document.getElementById('modalOverlay')) closeModalDirect(); }
function closeModalDirect(){ document.getElementById('modalOverlay').classList.remove('open'); }
function showToast(msg)    { const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2500); }

// ─── INIT LISTENERS ───────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('usernameInput').addEventListener('keydown', e=>{if(e.key==='Enter')doLogin();});
  const ci=document.getElementById('chatInput');
  if(ci){
    ci.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendChatMessage();}});
    ci.addEventListener('input',()=>{ci.style.height='auto';ci.style.height=Math.min(ci.scrollHeight,120)+'px';});
  }
  clearChat();
});

// ═══════════════════════════════════════════════════════════════
//  RESTAURANTS
// ═══════════════════════════════════════════════════════════════

// ─── DEFAULT CATEGORIES & RESTAURANTS ────────────────────────
const defaultRestCategories = [
  { id:'greek',    name:'יוונית מסורתית', emoji:'🏛️', color:'#3a9fd8' },
  { id:'seafood',  name:'פירות ים',       emoji:'🦞', color:'#2dd4a0' },
  { id:'italian',  name:'איטלקית',        emoji:'🍕', color:'#f5874a' },
  { id:'bar',      name:'ברים וקוקטיילים',emoji:'🍹', color:'#9b72f0' },
  { id:'cafe',     name:'קפה וארוחות בוקר',emoji:'☕', color:'#d4a843' },
  { id:'street',   name:'אוכל רחוב',      emoji:'🥙', color:'#e85555' }
];

const defaultRestaurants = [
  { id:101, name:'Tzitzikas & Mermigas', catId:'greek',
    desc:'מסעדת מεζεδοπωλείο קלאסית – מנות קטנות ואווירה יוונית אותנטית',
    address:'Mitropoleos 12-14, Athens', lat:37.9755, lng:23.7310,
    hours:'12:00-00:00', notes:'מומלץ להזמין מקום מראש' },
  { id:102, name:'Varoulko Seaside', catId:'seafood',
    desc:'מסעדת שף פרס מישלן – פירות ים ייחודיים עם נוף לים', 
    address:'Akti Koumoundourou 52, Mikrolimano', lat:37.9494, lng:23.6448,
    hours:'13:00-23:30', notes:'יקרה אך חוויה בלתי נשכחת' },
  { id:103, name:'Feyrouz', catId:'street',
    desc:'המסעדה הלבנונית הטובה באתונה – פלאפל ושווארמה מעולים',
    address:'Mitropoleos 23, Athens', lat:37.9758, lng:23.7287,
    hours:'11:00-23:00', notes:'תור קצר בשעות שיא' },
  { id:104, name:'The Clumsies', catId:'bar',
    desc:'ברקוקטיילים ידוע עולמית – כלול ב-50 הברים הטובים בעולם',
    address:'Praxitelous 30, Athens', lat:37.9772, lng:23.7271,
    hours:'10:00-03:00', notes:'נסו את הקוקטייל הקלאסי שלהם' },
  { id:105, name:'Lukumades', catId:'street',
    desc:'לוקומדס – סופגניות יווניות חמות עם דבש ואגוזים',
    address:'Aiolou 4, Athens', lat:37.9780, lng:23.7264,
    hours:'09:00-21:00', notes:'חובה לנסות!' },
  { id:106, name:'Melina Cafe', catId:'cafe',
    desc:'קפה בסגנון ביסטרו בפלאקה עם נוף לאקרופוליס',
    address:'Lyssiou 22, Plaka', lat:37.9735, lng:23.7302,
    hours:'08:00-22:00', notes:'ארוחת בוקר מדהימה' }
];

// ─── STORAGE ─────────────────────────────────────────────────
function getRestaurants()    { const s=localStorage.getItem('trip_restaurants');   return s?JSON.parse(s):defaultRestaurants; }
function saveRestaurants(d)  { localStorage.setItem('trip_restaurants', JSON.stringify(d)); }
function getRestCategories() { const s=localStorage.getItem('trip_rest_cats');     return s?JSON.parse(s):defaultRestCategories; }
function saveRestCategories(d){ localStorage.setItem('trip_rest_cats', JSON.stringify(d)); }

// ─── STATE ───────────────────────────────────────────────────
let activeRestCat    = 'all';   // 'all' or catId
let restSortedByProx = false;
let editingRestId    = null;
let editingCatId     = null;

// ─── RENDER ──────────────────────────────────────────────────
function renderRestaurants() {
  const cats = getRestCategories();
  const all  = getRestaurants();

  // Build category filter chips
  const filterEl = document.getElementById('restCatFilter');
  if (filterEl) {
    filterEl.innerHTML =
      `<button class="rest-chip ${activeRestCat==='all'?'active':''}" onclick="setRestCat('all')">🍽️ הכל</button>` +
      cats.map(c =>
        `<button class="rest-chip ${activeRestCat===c.id?'active':''}"
          style="${activeRestCat===c.id?`background:${c.color};border-color:${c.color}`:''}"
          onclick="setRestCat('${c.id}')">${c.emoji} ${c.name}</button>`
      ).join('') +
      (isAdmin ? `<button class="rest-chip rest-chip-edit" onclick="openCatManagerModal()">⚙️ ערוך קטגוריות</button>` : '');
  }

  // Filter
  let filtered = activeRestCat==='all' ? [...all] : all.filter(r=>r.catId===activeRestCat);

  // Sort by proximity if active
  if (restSortedByProx && filtered.length > 0) {
    const btn = document.querySelector('.proximity-btn');
    // use last known coords stored in state
    const lat = window._userLat || HOTEL_LAT;
    const lng = window._userLng || HOTEL_LNG;
    filtered.sort((a,b) => Math.hypot(a.lat-lat,a.lng-lng) - Math.hypot(b.lat-lat,b.lng-lng));
    if (btn) btn.innerHTML = '📍 ממוין לפי קרבה ✓';
  } else {
    const btn = document.querySelector('.proximity-btn');
    if (btn) btn.innerHTML = '📍 דרג לפי קרבה';
  }

  const list = document.getElementById('restaurantsList');
  if (!list) return;
  if (!filtered.length) { list.innerHTML = '<div style="text-align:center;color:var(--text-dim);padding:40px;font-size:14px">אין מסעדות בקטגוריה זו</div>'; return; }

  list.innerHTML = filtered.map((r, idx) => {
    const cat = cats.find(c=>c.id===r.catId) || { emoji:'🍽️', name:'כללי', color:'#8ba0c0' };
    const distLabel = (restSortedByProx && window._userLat)
      ? `<span style="font-size:11px;color:var(--green);margin-right:6px">📍 ${distKm(r.lat,r.lng,window._userLat,window._userLng)}</span>`
      : '';
    const adminBtns = isAdmin
      ? `<button class="attr-btn btn-edit" onclick="openEditRestModal(${r.id})">✏️ עריכה</button>
         <button class="attr-btn btn-delete" onclick="deleteRest(${r.id})">🗑️</button>`
      : '';
    return `<div class="rest-card">
      <div class="rest-rank">${idx+1}</div>
      <div class="rest-cat-badge" style="background:${cat.color}20;border-color:${cat.color}40;color:${cat.color}">${cat.emoji} ${cat.name}</div>
      <div class="rest-name">${r.name}</div>
      <div class="rest-desc">${r.desc}</div>
      <div class="rest-meta">
        🕐 ${r.hours || 'שעות לא ידועות'}
        ${r.notes ? `<span style="margin-right:10px">💡 ${r.notes}</span>` : ''}
        ${distLabel}
      </div>
      <div class="attr-actions" style="margin-top:12px">
        <a class="attr-btn btn-nav"
           href="https://www.google.com/maps/dir/?api=1&destination=${r.lat},${r.lng}&travelmode=walking"
           target="_blank">🧭 נווט אליי</a>
        <button class="attr-btn btn-info" onclick="showRestInfo(${r.id})">ℹ️ מידע</button>
        ${adminBtns}
      </div>
    </div>`;
  }).join('');

  // Show/hide admin add button
  const adminAdd = document.getElementById('adminRestAddBtn');
  if (adminAdd) adminAdd.style.display = isAdmin ? 'block' : 'none';
}

function distKm(lat1,lng1,lat2,lng2) {
  const R=6371, dLat=(lat2-lat1)*Math.PI/180, dLng=(lng2-lng1)*Math.PI/180;
  const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  const d=R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
  return d<1 ? Math.round(d*1000)+'מ׳' : d.toFixed(1)+'ק"מ';
}

function setRestCat(id) { activeRestCat=id; restSortedByProx=false; renderRestaurants(); }

function sortByProximity() {
  if (restSortedByProx) { restSortedByProx=false; renderRestaurants(); return; }
  if (!navigator.geolocation) { showToast('⚠️ המכשיר לא תומך במיקום'); return; }
  showToast('📍 מאתר מיקום...');
  navigator.geolocation.getCurrentPosition(
    pos => {
      window._userLat = pos.coords.latitude;
      window._userLng = pos.coords.longitude;
      restSortedByProx = true;
      renderRestaurants();
      showToast('✅ ממויין לפי קרבה!');
    },
    () => {
      showToast('⚠️ לא ניתן לקבל מיקום – ממיין ממלון');
      window._userLat = HOTEL_LAT; window._userLng = HOTEL_LNG;
      restSortedByProx = true;
      renderRestaurants();
    }
  );
}

// ─── INFO MODAL (Google Maps embed) ──────────────────────────
function showRestInfo(id) {
  const r = getRestaurants().find(x=>x.id===id); if(!r) return;
  const cats = getRestCategories();
  const cat  = cats.find(c=>c.id===r.catId) || { emoji:'🍽️', name:'כללי' };
  document.getElementById('modalTitle').textContent = r.name;
  document.getElementById('modalContent').innerHTML = `
    <div class="modal-body">
      <h4>📍 כתובת</h4><p>${r.address}</p>
      <h4>🕐 שעות פתיחה</h4><p>${r.hours||'לא ידוע'}</p>
      <h4>📂 קטגוריה</h4><p>${cat.emoji} ${cat.name}</p>
      <h4>📝 תיאור</h4><p>${r.desc}</p>
      ${r.notes?`<h4>💡 הערות</h4><p>${r.notes}</p>`:''}
      <h4>🗺️ מיקום בגוגל מפס</h4>
      <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.name+' '+r.address)}" 
         target="_blank" style="color:var(--blue-light);text-decoration:none">פתח בגוגל מפס ↗</a>
    </div>
    <iframe 
      src="https://maps.google.com/maps?q=${encodeURIComponent(r.name+' '+r.address)}&output=embed&z=16&hl=iw"
      style="width:100%;height:220px;border:none;border-radius:12px;margin-top:16px">
    </iframe>`;
  openModal();
}

// ─── ADD / EDIT RESTAURANT ────────────────────────────────────
function openAddRestModal() {
  editingRestId = null;
  document.getElementById('modalTitle').textContent = '➕ הוסף מסעדה';
  document.getElementById('modalContent').innerHTML = restForm({});
  openModal();
}
function openEditRestModal(id) {
  editingRestId = id;
  const r = getRestaurants().find(x=>x.id===id);
  document.getElementById('modalTitle').textContent = '✏️ עריכת מסעדה';
  document.getElementById('modalContent').innerHTML = restForm(r);
  openModal();
}
function restForm(r) {
  const cats = getRestCategories();
  return `
    <label class="form-label">שם המסעדה</label>
    <input class="form-input" id="rf_name" value="${r.name||''}" placeholder="שם...">
    <label class="form-label">תיאור</label>
    <textarea class="form-textarea" id="rf_desc" rows="2" style="resize:none">${r.desc||''}</textarea>
    <label class="form-label">קטגוריה</label>
    <select class="form-select" id="rf_cat">
      ${cats.map(c=>`<option value="${c.id}" ${r.catId===c.id?'selected':''}>${c.emoji} ${c.name}</option>`).join('')}
    </select>
    <label class="form-label">כתובת</label>
    <input class="form-input" id="rf_address" value="${r.address||''}" placeholder="Athens, Greece">
    <label class="form-label">Latitude</label>
    <input class="form-input" id="rf_lat" value="${r.lat||''}" type="number" step="any" placeholder="37.97...">
    <label class="form-label">Longitude</label>
    <input class="form-input" id="rf_lng" value="${r.lng||''}" type="number" step="any" placeholder="23.72...">
    <label class="form-label">שעות פתיחה</label>
    <input class="form-input" id="rf_hours" value="${r.hours||''}" placeholder="12:00-23:00">
    <label class="form-label">הערות</label>
    <input class="form-input" id="rf_notes" value="${r.notes||''}" placeholder="טיפ, מחיר, המלצה...">
    <button class="save-btn" onclick="saveRest()">💾 שמור</button>`;
}
function saveRest() {
  const name = document.getElementById('rf_name').value.trim();
  if (!name) { showToast('⚠️ הכניסו שם'); return; }
  let all = getRestaurants();
  const data = {
    name, desc: document.getElementById('rf_desc').value,
    catId: document.getElementById('rf_cat').value,
    address: document.getElementById('rf_address').value,
    lat: parseFloat(document.getElementById('rf_lat').value)||37.97,
    lng: parseFloat(document.getElementById('rf_lng').value)||23.72,
    hours: document.getElementById('rf_hours').value,
    notes: document.getElementById('rf_notes').value
  };
  if (editingRestId) {
    const idx=all.findIndex(r=>r.id===editingRestId); if(idx>=0) all[idx]={...all[idx],...data};
  } else {
    data.id=Date.now(); all.push(data);
  }
  saveRestaurants(all); closeModalDirect(); renderRestaurants(); showToast('✅ מסעדה נשמרה!');
}
function deleteRest(id) {
  if(!confirm('למחוק מסעדה זו?'))return;
  saveRestaurants(getRestaurants().filter(r=>r.id!==id));
  renderRestaurants(); showToast('🗑️ נמחק');
}

// ─── CATEGORY MANAGER (admin only) ───────────────────────────
function openCatManagerModal() {
  document.getElementById('modalTitle').textContent = '⚙️ ניהול קטגוריות';
  renderCatManagerContent();
  openModal();
}
function renderCatManagerContent() {
  const cats = getRestCategories();
  document.getElementById('modalContent').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">
      ${cats.map(c=>`
        <div style="display:flex;align-items:center;gap:10px;background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:10px">
          <span style="font-size:20px">${c.emoji}</span>
          <span style="flex:1;font-size:14px;font-weight:600">${c.name}</span>
          <button onclick="openEditCatModal('${c.id}')" style="background:rgba(212,168,67,.15);border:1px solid rgba(212,168,67,.3);color:var(--gold);border-radius:8px;padding:6px 10px;font-size:12px;cursor:pointer;font-family:'Heebo',sans-serif">✏️ ערוך</button>
          <button onclick="deleteCat('${c.id}')" style="background:rgba(232,85,85,.1);border:1px solid rgba(232,85,85,.3);color:var(--red);border-radius:8px;padding:6px 10px;font-size:12px;cursor:pointer;font-family:'Heebo',sans-serif">🗑️</button>
        </div>`).join('')}
    </div>
    <button class="add-btn" style="margin-bottom:0" onclick="openAddCatModal()">➕ הוסף קטגוריה</button>`;
}
function openAddCatModal() {
  editingCatId=null;
  document.getElementById('modalTitle').textContent='➕ קטגוריה חדשה';
  document.getElementById('modalContent').innerHTML=catForm({});
}
function openEditCatModal(id) {
  editingCatId=id;
  const cat=getRestCategories().find(c=>c.id===id);
  document.getElementById('modalTitle').textContent='✏️ עריכת קטגוריה';
  document.getElementById('modalContent').innerHTML=catForm(cat);
}
function catForm(c) {
  return `
    <label class="form-label">שם קטגוריה</label>
    <input class="form-input" id="cf_name" value="${c.name||''}" placeholder="למשל: יוונית מסורתית">
    <label class="form-label">אמוג'י</label>
    <input class="form-input" id="cf_emoji" value="${c.emoji||'🍽️'}" placeholder="🍽️">
    <label class="form-label">צבע (hex)</label>
    <input class="form-input" id="cf_color" value="${c.color||'#3a9fd8'}" placeholder="#3a9fd8">
    <button class="save-btn" onclick="saveCat()">💾 שמור קטגוריה</button>
    <button onclick="openCatManagerModal()" style="width:100%;margin-top:8px;background:none;border:1px solid var(--border);color:var(--text-dim);border-radius:12px;padding:12px;font-family:'Heebo',sans-serif;font-size:14px;cursor:pointer;">← חזור לרשימה</button>`;
}
function saveCat() {
  const name=document.getElementById('cf_name').value.trim();
  if(!name){showToast('⚠️ הכניסו שם');return;}
  let cats=getRestCategories();
  const data={name, emoji:document.getElementById('cf_emoji').value||'🍽️', color:document.getElementById('cf_color').value||'#3a9fd8'};
  if(editingCatId){
    const idx=cats.findIndex(c=>c.id===editingCatId); if(idx>=0) cats[idx]={...cats[idx],...data};
  } else {
    data.id='cat_'+Date.now(); cats.push(data);
  }
  saveRestCategories(cats); openCatManagerModal(); showToast('✅ קטגוריה נשמרה!');
}
function deleteCat(id) {
  if(!confirm('למחוק קטגוריה זו?'))return;
  saveRestCategories(getRestCategories().filter(c=>c.id!==id));
  renderCatManagerContent(); renderRestaurants(); showToast('🗑️ קטגוריה נמחקה');
}
