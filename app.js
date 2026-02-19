// ============================================================
//  GREECE TRIP APP – app.js
//  Model: openai/gpt-oss-120b:groq via HuggingFace Router
// ============================================================

// ─── CONSTANTS ───────────────────────────────────────────────
const ALLOWED_USERS       = ['זיו', 'ירדן', 'מנהל'];
const HOTEL_LAT           = 37.9271;
const HOTEL_LNG           = 23.7058;
const DAY_NAMES           = ['יום 1', 'יום 2', 'יום 3', 'יום 4'];
const EUR_TO_ILS_FALLBACK = 3.9;
const HF_BASE_URL         = 'https://router.huggingface.co/v1';
const HF_MODEL            = 'openai/gpt-oss-120b:groq';
const HF_TOKEN_HARDCODED  = 'YOUR_HF_TOKEN_HERE'; // ← הכנס כאן או דרך ממשק 🔑

const EXPENSE_CATS = {
  shopping: { label:'שופינג',  emoji:'🛍️', color:'#9b72f0' },
  food:     { label:'אוכל',    emoji:'🍽️', color:'#f5874a' },
  transport:{ label:'תחבורה',  emoji:'🚌', color:'#3a9fd8' },
  other:    { label:'אחר',     emoji:'📦', color:'#2dd4a0' }
};

// ─── APP STATE ───────────────────────────────────────────────
let currentUser      = '';
let isAdmin          = false;
let currentDay       = 0;
let selectedExpCat   = 'shopping';
let selectedCurrency = 'ILS';
let showAllInILS     = false;
let eurRate          = EUR_TO_ILS_FALLBACK;
let rateIsLive       = false;
let chatHistory      = [];

// per-page state
let editingId        = {};   // { attractions, restaurants, shopping, itinerary }
let activeCatFilter  = { restaurants:'all', attractions:'all', shopping:'all' };
let sortedByProx     = { restaurants:false, attractions:false, shopping:false };
let editingCatPage   = null; // 'restaurants' | 'attractions' | 'shopping'
let editingCatId     = null;

// ─── HF API ──────────────────────────────────────────────────
function getHfToken() {
  return HF_TOKEN_HARDCODED !== 'YOUR_HF_TOKEN_HERE'
    ? HF_TOKEN_HARDCODED : (localStorage.getItem('hf_token') || '');
}
function saveHfToken(k) { localStorage.setItem('hf_token', k.trim()); }
async function hfChat(messages) {
  const token = getHfToken(); if (!token) throw new Error('NO_KEY');
  const res = await fetch(`${HF_BASE_URL}/chat/completions`, {
    method:'POST',
    headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${token}` },
    body: JSON.stringify({ model:HF_MODEL, max_tokens:1024, messages })
  });
  if (res.status===401||res.status===403) throw new Error('KEY_INVALID');
  if (!res.ok) { const e=await res.json().catch(()=>({})); throw new Error(e?.error?.message||'שגיאת שרת '+res.status); }
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim()||'';
}
function aiErr(e) {
  if (e.message==='NO_KEY')      return 'לא הוגדר HuggingFace Token. לחץ על 🔑 בראש המסך.';
  if (e.message==='KEY_INVALID') return 'ה-Token אינו תקין. עדכן אותו דרך 🔑.';
  return 'שגיאת רשת: '+e.message;
}

// ─── DISTANCE HELPER ─────────────────────────────────────────
function distKm(lat1,lng1,lat2,lng2) {
  const R=6371,dLat=(lat2-lat1)*Math.PI/180,dLng=(lng2-lng1)*Math.PI/180;
  const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  const d=R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
  return d<1?Math.round(d*1000)+'מ׳':d.toFixed(1)+'ק"מ';
}

// ═══════════════════════════════════════════════════════════════
//  DEFAULT DATA
// ═══════════════════════════════════════════════════════════════

// ── ATTRACTIONS ───────────────────────────────────────────────
const defaultAttrCats = [
  { id:'history',  name:'היסטוריה ועתיקות', emoji:'🏛️', color:'#3a9fd8' },
  { id:'nature',   name:'טבע ונופים',        emoji:'🌿', color:'#2dd4a0' },
  { id:'museum',   name:'מוזיאונים',          emoji:'🎭', color:'#9b72f0' },
  { id:'beach',    name:'חופים',              emoji:'🏖️', color:'#f5874a' },
  { id:'market',   name:'שווקים',             emoji:'🛒', color:'#d4a843' }
];
const defaultAttractions = [
  { id:1,  catId:'history', name:'האקרופוליס',           lat:37.9715, lng:23.7267, address:'Acropolis, Athens',         hours:'08:00-20:00', desc:'אתר הירושה העולמי עם הפרתנון המרשים',          notes:'קנו כרטיסים מראש!' },
  { id:2,  catId:'museum',  name:'מוזיאון האקרופוליס',   lat:37.9681, lng:23.7289, address:'Acropolis Museum, Athens',  hours:'09:00-17:00', desc:'מוזיאון מודרני עם ממצאים מהאקרופוליס',          notes:'ממוזג ונעים בקיץ' },
  { id:3,  catId:'history', name:'פלאקה',                lat:37.9745, lng:23.7305, address:'Plaka, Athens',             hours:'כל השבוע',    desc:'שכונה היסטורית עם חנויות ומסעדות',              notes:'נסו גלידה יוונית!' },
  { id:4,  catId:'history', name:'נמל פיראוס',            lat:37.9422, lng:23.6466, address:'Piraeus Port',              hours:'24/7',         desc:'הנמל הגדול ביוון, נקודת יציאה לאיים',           notes:'אפשרות לטיול יום לאיים' },
  { id:5,  catId:'history', name:'כף סוניון',             lat:37.6513, lng:24.0264, address:'Cape Sounion',              hours:'09:30-20:00',  desc:'מקדש פוסידון על צוק עם נוף לים האגאי',         notes:'שקיעה מדהימה!' },
  { id:6,  catId:'market',  name:'מונסטיראקי',            lat:37.9753, lng:23.7244, address:'Monastiraki, Athens',       hours:'כל השבוע',    desc:'שוק פשפשים ואזור קניות עשיר בתרבות',           notes:'שבת הוא יום השוק הגדול' },
  { id:7,  catId:'nature',  name:'גבעת לוקבטוס',          lat:37.9811, lng:23.7442, address:'Lycabettus Hill, Athens',   hours:'כל השנה',     desc:'הנקודה הגבוהה ביותר באתונה עם פנורמה 360°',    notes:'רכבל כבלים 7€' },
  { id:8,  catId:'history', name:'אגורה הרומאית',          lat:37.9751, lng:23.7236, address:'Roman Agora, Athens',       hours:'08:00-20:00',  desc:'שוק רומי עתיק הסמוך לאגורה האתנאית',          notes:'כלול בכרטיס מאוחד' },
  { id:9,  catId:'beach',   name:'חוף גליפאדה',            lat:37.8687, lng:23.7508, address:'Glyfada Beach, Athens',     hours:'פתוח כל השנה',desc:'חוף ים קרוב לאתונה, מושלם לשחייה ומנוחה',      notes:'לא ממרחק רחוק' }
];

// ── RESTAURANTS ───────────────────────────────────────────────
const defaultRestCats = [
  { id:'greek',   name:'יוונית מסורתית',   emoji:'🏛️', color:'#3a9fd8' },
  { id:'seafood', name:'פירות ים',          emoji:'🦞', color:'#2dd4a0' },
  { id:'italian', name:'איטלקית',           emoji:'🍕', color:'#f5874a' },
  { id:'bar',     name:'ברים וקוקטיילים',  emoji:'🍹', color:'#9b72f0' },
  { id:'cafe',    name:'קפה וארוחות בוקר', emoji:'☕', color:'#d4a843' },
  { id:'street',  name:'אוכל רחוב',        emoji:'🥙', color:'#e85555' }
];
const defaultRestaurants = [
  { id:101, catId:'greek',   name:'Tzitzikas & Mermigas', lat:37.9755, lng:23.7310, address:'Mitropoleos 12-14, Athens',         hours:'12:00-00:00', desc:'מסעדת מεζεδοπωλείο קלאסית – מנות קטנות ואווירה אותנטית', notes:'מומלץ להזמין מקום מראש' },
  { id:102, catId:'seafood', name:'Varoulko Seaside',      lat:37.9494, lng:23.6448, address:'Akti Koumoundourou 52, Mikrolimano', hours:'13:00-23:30', desc:'מסעדת שף פרס מישלן – פירות ים ייחודיים עם נוף לים',      notes:'יקרה אך חוויה בלתי נשכחת' },
  { id:103, catId:'street',  name:'Feyrouz',               lat:37.9758, lng:23.7287, address:'Mitropoleos 23, Athens',             hours:'11:00-23:00', desc:'המסעדה הלבנונית הטובה באתונה – פלאפל ושווארמה',          notes:'תור קצר בשעות שיא' },
  { id:104, catId:'bar',     name:'The Clumsies',           lat:37.9772, lng:23.7271, address:'Praxitelous 30, Athens',             hours:'10:00-03:00', desc:'בר קוקטיילים ידוע עולמית – כלול ב-50 הטובים בעולם',     notes:'נסו את הקוקטייל הקלאסי' },
  { id:105, catId:'street',  name:'Lukumades',              lat:37.9780, lng:23.7264, address:'Aiolou 4, Athens',                   hours:'09:00-21:00', desc:'סופגניות יווניות חמות עם דבש ואגוזים',                   notes:'חובה לנסות!' },
  { id:106, catId:'cafe',    name:'Melina Cafe',            lat:37.9735, lng:23.7302, address:'Lyssiou 22, Plaka',                  hours:'08:00-22:00', desc:'קפה בסגנון ביסטרו בפלאקה עם נוף לאקרופוליס',            notes:'ארוחת בוקר מדהימה' }
];

// ── SHOPPING ──────────────────────────────────────────────────
const defaultShopCats = [
  { id:'souvenir', name:'מזכרות',        emoji:'🎁', color:'#3a9fd8' },
  { id:'fashion',  name:'אופנה',         emoji:'👗', color:'#9b72f0' },
  { id:'market',   name:'שווקים',        emoji:'🛒', color:'#d4a843' },
  { id:'jewelry',  name:'תכשיטים',       emoji:'💎', color:'#2dd4a0' },
  { id:'food',     name:'מזון מקומי',    emoji:'🫒', color:'#f5874a' }
];
const defaultShopping = [
  { id:201, catId:'market',   name:'שוק מונסטיראקי',       lat:37.9753, lng:23.7244, address:'Monastiraki Flea Market, Athens', hours:'כל השבוע',   desc:'שוק פשפשים ענק עם כל דבר – וינטאג׳, כלי בית, מזכרות',  notes:'מחירים ניתנים למשא ומתן' },
  { id:202, catId:'souvenir', name:'חנויות פלאקה',          lat:37.9745, lng:23.7305, address:'Plaka Shopping, Athens',         hours:'10:00-22:00', desc:'רחוב קניות עמוס מזכרות, תכשיטים ומוצרים יווניים',      notes:'מקחו עם המוכרים' },
  { id:203, catId:'food',     name:'Varvakios Agora',        lat:37.9786, lng:23.7249, address:'Athinas 42, Athens',             hours:'07:00-15:00', desc:'שוק האוכל המרכזי של אתונה – דגים, מזון טרי, מוצרים מקומיים', notes:'בואו בבוקר לטריות מקסימלית' },
  { id:204, catId:'fashion',  name:'Ermou Street',           lat:37.9765, lng:23.7290, address:'Ermou St, Athens',               hours:'10:00-21:00', desc:'רחוב קניות ראשי עם רשתות אופנה בינלאומיות ומקומיות',   notes:'הצפוף ביותר בסופ"ש' },
  { id:205, catId:'jewelry',  name:'Zolotas Jewelry',        lat:37.9755, lng:23.7302, address:'Stadiou 9, Athens',              hours:'10:00-19:00', desc:'תכשיטני יוונים מפורסמים – עיצובים בהשראה יוונית קלאסית', notes:'יקר אך איכותי מאוד' },
  { id:206, catId:'food',     name:'Mastiha Shop',           lat:37.9762, lng:23.7281, address:'Panepistimou 6, Athens',         hours:'10:00-20:00', desc:'מוצרי שרף מסטיחה מאיי חיוס – ממתקים, ליקר, קוסמטיקה', notes:'מתנה מושלמת הביתה' }
];

// ═══════════════════════════════════════════════════════════════
//  STORAGE
// ═══════════════════════════════════════════════════════════════
const STORE = {
  attractions: { key:'trip_v2_attractions',  def:()=>defaultAttractions },
  attrCats:    { key:'trip_v2_attr_cats',    def:()=>defaultAttrCats    },
  restaurants: { key:'trip_v2_restaurants',  def:()=>defaultRestaurants },
  restCats:    { key:'trip_v2_rest_cats',    def:()=>defaultRestCats    },
  shopping:    { key:'trip_v2_shopping',     def:()=>defaultShopping    },
  shopCats:    { key:'trip_v2_shop_cats',    def:()=>defaultShopCats    },
  itinerary:   { key:'trip_v2_itinerary',    def:()=>[]                 },
  expenses:    { key:'trip_v2_expenses',     def:()=>[]                 }
};
function load(k)    { const s=localStorage.getItem(STORE[k].key); return s?JSON.parse(s):STORE[k].def(); }
function save(k,v)  { localStorage.setItem(STORE[k].key, JSON.stringify(v)); }

// ═══════════════════════════════════════════════════════════════
//  EXCHANGE RATE
// ═══════════════════════════════════════════════════════════════
async function fetchEurRate() {
  try {
    const res = await fetch('https://api.frankfurter.app/latest?from=EUR&to=ILS');
    if (!res.ok) throw new Error();
    const d = await res.json();
    if (d.rates?.ILS) { eurRate=d.rates.ILS; rateIsLive=true; }
  } catch { rateIsLive=false; promptManualRate(); }
  updateRateTag();
}
function promptManualRate() {
  const t=document.getElementById('rateTag'); if(!t) return;
  t.className='rate-tag stale';
  t.innerHTML=`⚠️ שער לא זמין – <button onclick="askManualRate()" style="background:none;border:none;color:var(--orange);font-weight:700;cursor:pointer;font-family:'Heebo',sans-serif;font-size:12px;text-decoration:underline">הזן ידנית</button>`;
}
function askManualRate() {
  const v=prompt('שער יורו לשקל:',eurRate.toFixed(2));
  if(v&&!isNaN(parseFloat(v))){ eurRate=parseFloat(v); rateIsLive=false; updateRateTag(); renderExpenses(); updateExpenseSummary(); showToast('✅ שער עודכן'); }
}
function updateRateTag() {
  const t=document.getElementById('rateTag'); if(!t) return;
  t.className=rateIsLive?'rate-tag':'rate-tag stale';
  t.innerHTML=rateIsLive
    ?`🟢 שער אמת: €1 = ₪${eurRate.toFixed(3)}`
    :`🟡 שער ידני: €1 = ₪${eurRate.toFixed(3)} <button onclick="askManualRate()" style="background:none;border:none;color:var(--orange);font-weight:700;cursor:pointer;font-family:'Heebo',sans-serif;font-size:12px;margin-right:4px">עדכן</button>`;
}

// ═══════════════════════════════════════════════════════════════
//  LOGIN / NAV
// ═══════════════════════════════════════════════════════════════
function doLogin() {
  const val=document.getElementById('usernameInput').value.trim();
  const err=document.getElementById('loginError');
  if(!val){ err.textContent='הכניסו שם משתמש'; return; }
  if(!ALLOWED_USERS.includes(val)){ err.textContent='שם משתמש לא מורשה'; return; }
  err.textContent=''; currentUser=val; isAdmin=(val==='מנהל');
  document.getElementById('loginScreen').style.display='none';
  document.getElementById('app').style.display='block';
  document.getElementById('topBarUser').textContent=val;
  document.getElementById('adminBadgeTop').style.display=isAdmin?'inline':'none';
  fetchEurRate(); initApp();
}
function doLogout() {
  document.getElementById('loginScreen').style.display='flex';
  document.getElementById('app').style.display='none';
  document.getElementById('usernameInput').value='';
  currentUser=''; isAdmin=false; chatHistory=[];
}

function showPage(name,btn) {
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.remove('active'));
  document.getElementById('page'+name.charAt(0).toUpperCase()+name.slice(1)).classList.add('active');
  if(btn) btn.classList.add('active');
  const renders = {
    itinerary:   renderItinerary,
    expenses:    ()=>{ renderExpenses(); updateExpenseSummary(); },
    attractions: ()=>renderPlacePage('attractions'),
    restaurants: ()=>renderPlacePage('restaurants'),
    shopping:    ()=>renderPlacePage('shopping')
  };
  renders[name]?.();
}

function initApp() {
  renderSummary(); updateExpenseSummary(); updateKeyStatus();
  renderPlacePage('attractions');
  renderPlacePage('restaurants');
  renderPlacePage('shopping');
  renderItinerary();
  renderExpenses();
}

// ═══════════════════════════════════════════════════════════════
//  HOME SUMMARY
// ═══════════════════════════════════════════════════════════════
function renderSummary() {
  const itin=load('itinerary'), exps=load('expenses');
  document.getElementById('statItinerary').textContent = itin.length;
  document.getElementById('statExpenses').textContent  = exps.length;
  document.getElementById('statAttr').textContent      = load('attractions').length;
}

function updateExpenseSummary() {
  const exps=load('expenses'), cats=Object.keys(EXPENSE_CATS);
  const totals={}; let grand=0;
  cats.forEach(c=>{totals[c]=0;});
  exps.forEach(e=>{ const ils=e.currency==='EUR'?e.amount*eurRate:e.amount; totals[e.cat]=(totals[e.cat]||0)+ils; grand+=ils; });
  ['summaryTotal','summaryTotal2'].forEach(id=>{ const el=document.getElementById(id); if(el) el.textContent='₪'+grand.toFixed(0); });
  ['summaryBars','summaryBars2'].forEach(id=>{
    const el=document.getElementById(id); if(!el) return;
    el.innerHTML=cats.map(c=>{
      const pct=grand>0?(totals[c]/grand*100):0;
      return `<div class="cat-bar-row">
        <div class="cat-bar-label">${EXPENSE_CATS[c].emoji} ${EXPENSE_CATS[c].label}</div>
        <div class="cat-bar-track"><div class="cat-bar-fill" style="width:${pct}%;background:${EXPENSE_CATS[c].color}"></div></div>
        <div class="cat-bar-amount">₪${totals[c].toFixed(0)}</div>
      </div>`;
    }).join('');
  });
  renderSummary();
}

// ═══════════════════════════════════════════════════════════════
//  GENERIC PLACE PAGE (attractions / restaurants / shopping)
// ═══════════════════════════════════════════════════════════════
const PAGE_CFG = {
  attractions: { label:'אטרקציות', icon:'🏛️', catsKey:'attrCats',  accent:'var(--blue-light)' },
  restaurants: { label:'מסעדות',   icon:'🍽️', catsKey:'restCats',  accent:'var(--gold)'       },
  shopping:    { label:'קניות',    icon:'🛍️', catsKey:'shopCats',  accent:'var(--purple)'     }
};

function renderPlacePage(page) {
  const cfg   = PAGE_CFG[page];
  const cats  = load(cfg.catsKey);
  const items = load(page);
  const af    = activeCatFilter[page];
  const isProx= sortedByProx[page];

  // ── category filter
  const filterEl=document.getElementById(page+'CatFilter');
  if(filterEl) {
    filterEl.innerHTML =
      `<button class="rest-chip ${af==='all'?'active':''}" onclick="setCatFilter('${page}','all')">✨ הכל</button>`+
      cats.map(c=>`<button class="rest-chip ${af===c.id?'active':''}"
        style="${af===c.id?`background:${c.color};border-color:${c.color}`:''}"
        onclick="setCatFilter('${page}','${c.id}')">${c.emoji} ${c.name}</button>`).join('')+
      (isAdmin?`<button class="rest-chip rest-chip-edit" onclick="openCatManager('${page}')">⚙️ ערוך</button>`:'');
  }

  // ── proximity button label
  const proxBtn=document.getElementById(page+'ProxBtn');
  if(proxBtn) proxBtn.innerHTML=isProx?'📍 ממויין לפי קרבה ✓':'📍 דרג לפי קרבה';

  // ── filter + sort
  let filtered=af==='all'?[...items]:items.filter(i=>i.catId===af);
  if(isProx) {
    const lat=window._userLat||HOTEL_LAT, lng=window._userLng||HOTEL_LNG;
    filtered.sort((a,b)=>Math.hypot(a.lat-lat,a.lng-lng)-Math.hypot(b.lat-lat,b.lng-lng));
  }

  // ── render list
  const listEl=document.getElementById(page+'List');
  if(!listEl) return;
  if(!filtered.length){ listEl.innerHTML='<div style="text-align:center;color:var(--text-dim);padding:40px;font-size:14px">אין פריטים בקטגוריה זו</div>'; return; }

  listEl.innerHTML=filtered.map((item,idx)=>{
    const cat=cats.find(c=>c.id===item.catId)||{emoji:'📍',name:'כללי',color:'#8ba0c0'};
    const distLabel=(isProx&&window._userLat)?`<span style="font-size:11px;color:var(--green)">📍 ${distKm(item.lat,item.lng,window._userLat,window._userLng)}</span>`:'';
    const adminBtns=isAdmin?`<button class="attr-btn btn-edit" onclick="openEditItem('${page}',${item.id})">✏️ עריכה</button><button class="attr-btn btn-delete" onclick="deleteItem('${page}',${item.id})">🗑️</button>`:'';
    const inItinerary=load('itinerary').some(i=>i.sourceId===item.id&&i.sourcePage===page);
    const addBtn=`<button class="attr-btn btn-add-itin ${inItinerary?'in-itin':''}" onclick="toggleItinerary('${page}',${item.id})">${inItinerary?'✅ במסלול':'➕ למסלול'}</button>`;
    return `<div class="rest-card">
      <div class="rest-rank" style="background:linear-gradient(135deg,${cat.color},${cat.color}99)">${idx+1}</div>
      <div class="rest-cat-badge" style="background:${cat.color}20;border-color:${cat.color}40;color:${cat.color}">${cat.emoji} ${cat.name}</div>
      <div class="rest-name">${item.name}</div>
      <div class="rest-desc">${item.desc||''}</div>
      <div class="rest-meta">🕐 ${item.hours||'שעות לא ידועות'} ${item.notes?`<span style="margin-right:8px">💡 ${item.notes}</span>`:''} ${distLabel}</div>
      <div class="attr-actions" style="margin-top:12px">
        <a class="attr-btn btn-nav" href="https://www.google.com/maps/dir/?api=1&destination=${item.lat},${item.lng}&travelmode=walking" target="_blank">🧭 נווט</a>
        <button class="attr-btn btn-info" onclick="showPlaceInfo('${page}',${item.id})">ℹ️ מידע</button>
        ${addBtn}
        ${adminBtns}
      </div>
    </div>`;
  }).join('');

  const adminAdd=document.getElementById(page+'AdminAdd');
  if(adminAdd) adminAdd.style.display=isAdmin?'block':'none';
}

function setCatFilter(page,catId) { activeCatFilter[page]=catId; sortedByProx[page]=false; renderPlacePage(page); }

function sortByProximity(page) {
  if(sortedByProx[page]){ sortedByProx[page]=false; renderPlacePage(page); return; }
  if(!navigator.geolocation){ showToast('⚠️ המכשיר לא תומך במיקום'); return; }
  showToast('📍 מאתר מיקום...');
  navigator.geolocation.getCurrentPosition(
    pos=>{ window._userLat=pos.coords.latitude; window._userLng=pos.coords.longitude; sortedByProx[page]=true; renderPlacePage(page); showToast('✅ ממויין לפי קרבה!'); },
    ()=>{ window._userLat=HOTEL_LAT; window._userLng=HOTEL_LNG; sortedByProx[page]=true; renderPlacePage(page); showToast('📍 ממויין ממלון (GPS לא זמין)'); }
  );
}

// ─── PLACE INFO MODAL ────────────────────────────────────────
function showPlaceInfo(page,id) {
  const item=load(page).find(i=>i.id===id); if(!item) return;
  const cats=load(PAGE_CFG[page].catsKey);
  const cat=cats.find(c=>c.id===item.catId)||{emoji:'📍',name:'כללי'};
  document.getElementById('modalTitle').textContent=item.name;
  document.getElementById('modalContent').innerHTML=`
    <div class="modal-body">
      <h4>📍 כתובת</h4><p>${item.address||'לא ידוע'}</p>
      <h4>🕐 שעות פתיחה</h4><p>${item.hours||'לא ידוע'}</p>
      <h4>📂 קטגוריה</h4><p>${cat.emoji} ${cat.name}</p>
      <h4>📝 תיאור</h4><p>${item.desc||''}</p>
      ${item.notes?`<h4>💡 הערות</h4><p>${item.notes}</p>`:''}
      <h4>🗺️ גוגל מפס</h4>
      <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.name+' '+item.address)}" target="_blank" style="color:var(--blue-light)">פתח בגוגל מפס ↗</a>
    </div>
    <iframe src="https://maps.google.com/maps?q=${encodeURIComponent(item.name+' '+item.address)}&output=embed&z=16&hl=iw"
      style="width:100%;height:220px;border:none;border-radius:12px;margin-top:16px"></iframe>`;
  openModal();
}

// ─── ADD/EDIT ITEM ────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════
//  ADD / EDIT PLACE  –  Nominatim in-app search
// ═══════════════════════════════════════════════════════════════

// State for the place form
let _pfPage = '';
let _pfSearchTimer = null;

function openAddItem(page) {
  editingId[page] = null; _pfPage = page;
  document.getElementById('modalTitle').textContent = '➕ הוסף מקום';
  document.getElementById('modalContent').innerHTML = placeForm(page, {});
  openModal();
}
function openEditItem(page, id) {
  editingId[page] = id; _pfPage = page;
  const item = load(page).find(i => i.id === id);
  document.getElementById('modalTitle').textContent = '✏️ עריכה';
  document.getElementById('modalContent').innerHTML = placeForm(page, item);
  // If editing existing item, show its map immediately
  if (item && item.lat) _pfSetLocation(item.lat, item.lng, item.name, item.address || '');
  openModal();
}

// ── Main form HTML ────────────────────────────────────────────
function placeForm(page, item) {
  const cats = load(PAGE_CFG[page].catsKey);
  return `
    <!-- SEARCH BAR -->
    <div class="pf-search-wrap">
      <div class="pf-search-row">
        <input class="pf-search-input" id="pf_search"
          placeholder="🔍 חפשו שם מקום באתונה..."
          oninput="_pfOnSearch()"
          onkeydown="if(event.key==='Enter'){event.preventDefault();_pfDoSearch();}"
          autocomplete="off">
        <button class="pf-search-btn" onclick="_pfDoSearch()">חפש</button>
      </div>
      <div class="pf-results" id="pf_results" style="display:none"></div>
    </div>

    <!-- MAP PREVIEW -->
    <div class="pf-map-wrap" id="pf_map_wrap" style="display:none">
      <iframe id="pf_map_iframe"
        style="width:100%;height:200px;border:none;border-radius:12px"
        loading="lazy"></iframe>
      <div class="pf-selected-badge" id="pf_selected_badge"></div>
    </div>

    <!-- HIDDEN COORDS -->
    <input type="hidden" id="pf_lat" value="${item.lat||''}">
    <input type="hidden" id="pf_lng" value="${item.lng||''}">

    <!-- DETAILS -->
    <div id="pf_details">
      <label class="form-label">שם המקום *</label>
      <input class="form-input" id="pf_name" value="${item.name||''}" placeholder="שם המקום...">

      <label class="form-label">קטגוריה</label>
      <select class="form-select" id="pf_cat">
        ${cats.map(c=>`<option value="${c.id}"${item.catId===c.id?' selected':''}>${c.emoji} ${c.name}</option>`).join('')}
      </select>

      <label class="form-label">תיאור</label>
      <textarea class="form-textarea" id="pf_desc" rows="2" style="resize:none">${item.desc||''}</textarea>

      <label class="form-label">שעות פתיחה</label>
      <input class="form-input" id="pf_hours" value="${item.hours||''}" placeholder="09:00-20:00">

      <label class="form-label">הערות / טיפים</label>
      <input class="form-input" id="pf_notes" value="${item.notes||''}" placeholder="טיפ שימושי...">
    </div>

    <button class="save-btn" onclick="saveItem('${page}')">💾 שמור מקום</button>`;
}

// ── Search with debounce ──────────────────────────────────────
function _pfOnSearch() {
  clearTimeout(_pfSearchTimer);
  _pfSearchTimer = setTimeout(_pfDoSearch, 600);
}

async function _pfDoSearch() {
  const q = (document.getElementById('pf_search')?.value || '').trim();
  if (q.length < 2) return;

  const resultsEl = document.getElementById('pf_results');
  resultsEl.style.display = 'block';
  resultsEl.innerHTML = '<div class="pf-result-loading">🔍 מחפש...</div>';

  try {
    // Nominatim – free OpenStreetMap geocoding, bias to Athens area
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q+' Athens Greece')}&limit=6&addressdetails=1&accept-language=he,en`;
    const res  = await fetch(url, { headers: { 'Accept-Language': 'he,en' } });
    const data = await res.json();

    if (!data.length) {
      resultsEl.innerHTML = '<div class="pf-result-empty">לא נמצאו תוצאות – נסה שם אחר</div>';
      return;
    }

    resultsEl.innerHTML = data.map((r, i) => {
      const name    = r.namedetails?.name || r.display_name.split(',')[0];
      const address = r.display_name.split(',').slice(1, 3).join(',').trim();
      const icon    = _pfTypeIcon(r.type, r.class);
      return `<div class="pf-result-item" onclick="_pfSelectResult(${i})"
        data-lat="${r.lat}" data-lng="${r.lon}"
        data-name="${encodeURIComponent(name)}"
        data-address="${encodeURIComponent(r.display_name)}">
        <span class="pf-result-icon">${icon}</span>
        <div class="pf-result-text">
          <div class="pf-result-name">${name}</div>
          <div class="pf-result-addr">${address}</div>
        </div>
        <span class="pf-result-arrow">›</span>
      </div>`;
    }).join('');
  } catch(e) {
    resultsEl.innerHTML = '<div class="pf-result-empty">שגיאת רשת – בדקו חיבור לאינטרנט</div>';
  }
}

function _pfTypeIcon(type, cls) {
  const icons = {
    restaurant:'🍽️', cafe:'☕', bar:'🍹', fast_food:'🌮',
    museum:'🏛️', attraction:'🎯', monument:'🗿', viewpoint:'🌅',
    park:'🌿', beach:'🏖️', hotel:'🏨', shop:'🛍️',
    supermarket:'🛒', mall:'🏪', marketplace:'🏪',
    clothes:'👗', jewelry:'💎', tourism:'📸'
  };
  return icons[type] || icons[cls] || '📍';
}

function _pfSelectResult(idx) {
  const items = document.querySelectorAll('.pf-result-item');
  const el    = items[idx];
  if (!el) return;

  const lat     = parseFloat(el.dataset.lat);
  const lng     = parseFloat(el.dataset.lng);
  const name    = decodeURIComponent(el.dataset.name);
  const address = decodeURIComponent(el.dataset.address);

  _pfSetLocation(lat, lng, name, address);
  document.getElementById('pf_results').style.display = 'none';
  document.getElementById('pf_search').value = name;
}

function _pfSetLocation(lat, lng, name, address) {
  // Set hidden coords
  document.getElementById('pf_lat').value = lat;
  document.getElementById('pf_lng').value = lng;

  // Auto-fill name if empty
  const nameEl = document.getElementById('pf_name');
  if (nameEl && !nameEl.value) nameEl.value = name;

  // Show map preview
  const wrap = document.getElementById('pf_map_wrap');
  const iframe = document.getElementById('pf_map_iframe');
  const badge  = document.getElementById('pf_selected_badge');
  if (wrap && iframe) {
    iframe.src = `https://maps.google.com/maps?q=${lat},${lng}&output=embed&z=17&hl=iw`;
    wrap.style.display = 'block';
  }
  if (badge) {
    badge.innerHTML = `✅ מיקום נבחר: <strong>${name}</strong>
      <a href="https://www.google.com/maps?q=${lat},${lng}" target="_blank"
        style="color:var(--blue-light);margin-right:6px;font-size:11px">פתח בגוגל מפס ↗</a>`;
  }
}

function saveItem(page) {
  const name = document.getElementById('pf_name')?.value.trim();
  const lat  = parseFloat(document.getElementById('pf_lat')?.value);
  const lng  = parseFloat(document.getElementById('pf_lng')?.value);

  if (!name)      { showToast('⚠️ הכניסו שם מקום'); return; }
  if (!lat || !lng) { showToast('⚠️ יש לבחור מקום מהחיפוש'); return; }

  let all = load(page);
  const data = {
    name, lat, lng,
    catId:   document.getElementById('pf_cat')?.value || '',
    desc:    document.getElementById('pf_desc')?.value || '',
    address: document.getElementById('pf_search')?.value || '',
    hours:   document.getElementById('pf_hours')?.value || '',
    notes:   document.getElementById('pf_notes')?.value || ''
  };
  if (editingId[page]) {
    const idx = all.findIndex(i => i.id === editingId[page]);
    if (idx >= 0) all[idx] = { ...all[idx], ...data };
  } else {
    data.id = Date.now();
    all.push(data);
  }
  save(page, all);
  closeModalDirect();
  renderPlacePage(page);
  showToast('✅ ' + name + ' נשמר!');
}

function deleteItem(page, id) {
  if (!confirm('למחוק מקום זה?')) return;
  save(page, load(page).filter(i => i.id !== id));
  renderPlacePage(page);
  showToast('🗑️ נמחק');
}

// ═══════════════════════════════════════════════════════════════
//  ITINERARY (pulls from all three pages)
// ═══════════════════════════════════════════════════════════════
function toggleItinerary(page,sourceId) {
  let itin=load('itinerary');
  const exists=itin.findIndex(i=>i.sourceId===sourceId&&i.sourcePage===page);
  if(exists>=0) {
    itin.splice(exists,1);
    save('itinerary',itin);
    showToast('🗑️ הוסר מהמסלול');
  } else {
    const source=load(page).find(i=>i.id===sourceId); if(!source) return;
    itin.push({ id:Date.now(), sourceId, sourcePage:page, day:0, order:itin.filter(i=>i.day===0).length+1 });
    save('itinerary',itin);
    showToast('✅ נוסף למסלול!');
  }
  renderPlacePage(page);
  renderItinerary();
  renderSummary();
}

function renderItinerary() {
  const itin  = load('itinerary');
  const tabs  = document.getElementById('dayTabs');
  if(!tabs) return;

  // Day tabs
  tabs.innerHTML=DAY_NAMES.map((n,i)=>
    `<button class="day-tab${i===currentDay?' active':''}" onclick="switchDay(${i})">${n} <span style="font-size:10px;color:var(--text-dim)">(${itin.filter(x=>x.day===i).length})</span></button>`
  ).join('');

  // Day items sorted by order
  let dayItems=itin.filter(x=>x.day===currentDay).sort((a,b)=>(a.order||99)-(b.order||99));

  const list=document.getElementById('itineraryList'); if(!list) return;
  if(!dayItems.length){ list.innerHTML='<div style="text-align:center;color:var(--text-dim);padding:40px;font-size:14px">אין פריטים ביום זה – הוסיפו ממסעדות, אטרקציות או קניות ➕</div>'; return; }

  list.innerHTML=dayItems.map((entry,idx)=>{
    const pageItems=load(entry.sourcePage);
    const item=pageItems.find(i=>i.id===entry.sourceId);
    if(!item) return '';
    const cfg=PAGE_CFG[entry.sourcePage];
    const cats=load(PAGE_CFG[entry.sourcePage].catsKey);
    const cat=cats.find(c=>c.id===item.catId)||{emoji:'📍',name:'כללי',color:'#8ba0c0'};
    const icons={attractions:'🏛️',restaurants:'🍽️',shopping:'🛍️'};
    return `<div class="rest-card" style="border-right:3px solid ${cat.color};">
      <div class="rest-rank" style="background:linear-gradient(135deg,${cat.color},${cat.color}88)">${idx+1}</div>
      <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;flex-wrap:wrap">
        <div class="rest-cat-badge" style="background:${cat.color}20;border-color:${cat.color}40;color:${cat.color}">${cat.emoji} ${cat.name}</div>
        <div style="font-size:11px;background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:2px 8px;color:var(--text-dim)">${icons[entry.sourcePage]} ${cfg.label}</div>
      </div>
      <div class="rest-name">${item.name}</div>
      <div class="rest-desc">${item.desc||''}</div>
      <div class="rest-meta">🕐 ${item.hours||'-'} ${item.notes?`· 💡 ${item.notes}`:''}</div>
      <div class="attr-actions" style="margin-top:12px">
        <a class="attr-btn btn-nav" href="https://www.google.com/maps/dir/?api=1&destination=${item.lat},${item.lng}&travelmode=walking" target="_blank">🧭 נווט</a>
        <button class="attr-btn btn-info" onclick="showPlaceInfo('${entry.sourcePage}',${item.id})">ℹ️ מידע</button>
        <select class="attr-btn" style="background:var(--surface2);border:1px solid var(--border);color:var(--text);font-family:'Heebo',sans-serif;font-size:12px"
          onchange="moveToDay(${entry.id},parseInt(this.value))">
          ${DAY_NAMES.map((n,i)=>`<option value="${i}"${entry.day===i?' selected':''}>${n}</option>`).join('')}
        </select>
        <button class="attr-btn btn-delete" onclick="removeFromItinerary(${entry.id})">🗑️</button>
      </div>
    </div>`;
  }).join('');

  // Optimize button
  const optBtn=document.getElementById('itinOptBtn');
  if(optBtn) optBtn.style.display=dayItems.length>1?'flex':'none';
}

function switchDay(d) { currentDay=d; renderItinerary(); }

function removeFromItinerary(entryId) {
  const itin=load('itinerary').filter(i=>i.id!==entryId);
  save('itinerary',itin); renderItinerary(); renderSummary();
  // refresh all place pages to update ✅ buttons
  ['attractions','restaurants','shopping'].forEach(renderPlacePage);
  showToast('🗑️ הוסר מהמסלול');
}

function moveToDay(entryId,day) {
  const itin=load('itinerary');
  const idx=itin.findIndex(i=>i.id===entryId); if(idx<0) return;
  itin[idx].day=day; itin[idx].order=itin.filter(i=>i.day===day).length;
  save('itinerary',itin); renderItinerary();
}

function optimizeItineraryDay() {
  const itin=load('itinerary');
  let dayItems=itin.filter(i=>i.day===currentDay);
  if(dayItems.length<2){ showToast('⚠️ צריך לפחות 2 פריטים לסידור'); return; }
  // get coords for each
  const withCoords=dayItems.map(entry=>{
    const item=load(entry.sourcePage).find(i=>i.id===entry.sourceId);
    return {...entry, lat:item?.lat||HOTEL_LAT, lng:item?.lng||HOTEL_LNG};
  });
  let rem=[...withCoords], ord=[], cLat=HOTEL_LAT, cLng=HOTEL_LNG;
  while(rem.length){ let best=null,bd=Infinity; rem.forEach(a=>{const d=Math.hypot(a.lat-cLat,a.lng-cLng);if(d<bd){bd=d;best=a;}}); ord.push(best); cLat=best.lat; cLng=best.lng; rem=rem.filter(a=>a.id!==best.id); }
  ord.forEach((e,i)=>{ const idx=itin.findIndex(x=>x.id===e.id); if(idx>=0) itin[idx].order=i+1; });
  save('itinerary',itin); renderItinerary(); showToast('✅ סדר עודכן!');
}

// ═══════════════════════════════════════════════════════════════
//  CATEGORY MANAGER (generic for all three pages)
// ═══════════════════════════════════════════════════════════════
function openCatManager(page) {
  editingCatPage=page; editingCatId=null;
  document.getElementById('modalTitle').textContent='⚙️ ניהול קטגוריות – '+PAGE_CFG[page].label;
  renderCatManagerContent(page);
  openModal();
}
function renderCatManagerContent(page) {
  const cats=load(PAGE_CFG[page].catsKey);
  document.getElementById('modalContent').innerHTML=`
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">
      ${cats.map(c=>`<div style="display:flex;align-items:center;gap:10px;background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:10px">
        <span style="font-size:20px">${c.emoji}</span>
        <span style="flex:1;font-size:14px;font-weight:600">${c.name}</span>
        <div style="width:14px;height:14px;border-radius:50%;background:${c.color};flex-shrink:0"></div>
        <button onclick="openEditCat('${page}','${c.id}')" style="background:rgba(212,168,67,.15);border:1px solid rgba(212,168,67,.3);color:var(--gold);border-radius:8px;padding:6px 10px;font-size:12px;cursor:pointer;font-family:'Heebo',sans-serif">✏️</button>
        <button onclick="deleteCat('${page}','${c.id}')" style="background:rgba(232,85,85,.1);border:1px solid rgba(232,85,85,.3);color:var(--red);border-radius:8px;padding:6px 10px;font-size:12px;cursor:pointer;font-family:'Heebo',sans-serif">🗑️</button>
      </div>`).join('')}
    </div>
    <button class="add-btn" onclick="openAddCat('${page}')">➕ הוסף קטגוריה</button>`;
}
function openAddCat(page) { editingCatId=null; document.getElementById('modalTitle').textContent='➕ קטגוריה חדשה'; document.getElementById('modalContent').innerHTML=catForm(page,{}); }
function openEditCat(page,id) { editingCatId=id; const c=load(PAGE_CFG[page].catsKey).find(x=>x.id===id); document.getElementById('modalTitle').textContent='✏️ עריכת קטגוריה'; document.getElementById('modalContent').innerHTML=catForm(page,c); }
function catForm(page,c) {
  return `
    <label class="form-label">שם</label><input class="form-input" id="cf_name" value="${c.name||''}" placeholder="שם קטגוריה">
    <label class="form-label">אמוג'י</label><input class="form-input" id="cf_emoji" value="${c.emoji||'📍'}" placeholder="📍">
    <label class="form-label">צבע (hex)</label><input class="form-input" id="cf_color" value="${c.color||'#3a9fd8'}" placeholder="#3a9fd8">
    <button class="save-btn" onclick="saveCat('${page}')">💾 שמור</button>
    <button onclick="openCatManager('${page}')" style="width:100%;margin-top:8px;background:none;border:1px solid var(--border);color:var(--text-dim);border-radius:12px;padding:12px;font-family:'Heebo',sans-serif;font-size:14px;cursor:pointer">← חזור</button>`;
}
function saveCat(page) {
  const name=document.getElementById('cf_name').value.trim(); if(!name){showToast('⚠️ הכניסו שם');return;}
  let cats=load(PAGE_CFG[page].catsKey);
  const data={name, emoji:document.getElementById('cf_emoji').value||'📍', color:document.getElementById('cf_color').value||'#3a9fd8'};
  if(editingCatId){ const idx=cats.findIndex(c=>c.id===editingCatId); if(idx>=0) cats[idx]={...cats[idx],...data}; }
  else { data.id='cat_'+Date.now(); cats.push(data); }
  save(PAGE_CFG[page].catsKey,cats); openCatManager(page); showToast('✅ קטגוריה נשמרה!');
}
function deleteCat(page,id) {
  if(!confirm('למחוק קטגוריה?'))return;
  save(PAGE_CFG[page].catsKey, load(PAGE_CFG[page].catsKey).filter(c=>c.id!==id));
  renderCatManagerContent(page); renderPlacePage(page); showToast('🗑️ נמחקה');
}

// ═══════════════════════════════════════════════════════════════
//  EXPENSES
// ═══════════════════════════════════════════════════════════════
function selectExpCat(el) {
  selectedExpCat=el.dataset.cat;
  document.querySelectorAll('#expCatChips .cat-chip').forEach(c=>{ c.classList.remove('active'); c.style.background=''; c.style.borderColor=''; c.style.color=''; });
  el.classList.add('active'); el.style.background=EXPENSE_CATS[selectedExpCat].color; el.style.borderColor=EXPENSE_CATS[selectedExpCat].color; el.style.color='white';
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
  const exps=load('expenses');
  exps.push({id:Date.now(),cat:selectedExpCat,desc,amount,currency:selectedCurrency,date:new Date().toLocaleDateString('he-IL')});
  save('expenses',exps); document.getElementById('expAmount').value=''; document.getElementById('expDesc').value='';
  renderExpenses(); updateExpenseSummary(); showToast('✅ הוצאה נוספה!');
}
function deleteExpense(id) { save('expenses',load('expenses').filter(e=>e.id!==id)); renderExpenses(); updateExpenseSummary(); showToast('🗑️ נמחק'); }
function toggleConversion() {
  showAllInILS=!showAllInILS;
  document.getElementById('convertBtn').innerHTML=showAllInILS?'💱 הצג במטבע מקורי':'💱 הצג הכל בשקלים';
  renderExpenses();
}
function renderExpenses() {
  const exps=load('expenses'), list=document.getElementById('expensesList');
  if(!exps.length){ list.innerHTML='<div style="text-align:center;color:var(--text-dim);padding:30px;font-size:14px">אין הוצאות עדיין</div>'; return; }
  list.innerHTML=[...exps].reverse().map(e=>{
    const cat=EXPENSE_CATS[e.cat]; let displayAmt,subAmt='';
    if(showAllInILS){ const ils=e.currency==='EUR'?e.amount*eurRate:e.amount; displayAmt='₪'+ils.toFixed(0); if(e.currency==='EUR') subAmt=`<div style="font-size:11px;color:var(--text-dim)">€${e.amount}</div>`; }
    else{ displayAmt=(e.currency==='EUR'?'€':'₪')+e.amount.toFixed(0); }
    return `<div class="expense-item">
      <div class="expense-item-cat">${cat.emoji}</div>
      <div class="expense-item-info"><div class="expense-item-cat-name">${cat.label} · ${e.date}</div><div class="expense-item-desc">${e.desc}</div></div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
        <div class="expense-item-amount">${displayAmt}</div>${subAmt}
        <button class="expense-item-del" onclick="deleteExpense(${e.id})">🗑️</button>
      </div></div>`;
  }).join('');
}
function exportCSV() {
  const exps=load('expenses'); if(!exps.length){showToast('⚠️ אין הוצאות');return;}
  const rows=exps.map(e=>{ const ils=e.currency==='EUR'?(e.amount*eurRate).toFixed(2):e.amount.toFixed(2); const desc=e.desc.includes(',')?`"${e.desc}"`:e.desc; return `${e.date},${EXPENSE_CATS[e.cat]?.label||e.cat},${desc},${e.amount},${e.currency},${ils}`; });
  const blob=new Blob(['\uFEFF'+'תאריך,קטגוריה,פירוט,סכום,מטבע,בשקלים\n'+rows.join('\n')],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob),a=document.createElement('a'); a.href=url; a.download='הוצאות-יוון.csv'; a.click(); URL.revokeObjectURL(url); showToast('📥 CSV הורד!');
}
async function analyzeExpenses() {
  const exps=load('expenses'); if(!exps.length){showToast('⚠️ אין הוצאות');return;}
  const el=document.getElementById('aiExpenseResult'); el.style.display='block'; el.innerHTML='<div class="search-loading"><div class="spinner"></div><br>מנתח הוצאות...</div>';
  const totals={}; let grand=0;
  exps.forEach(e=>{ const ils=e.currency==='EUR'?e.amount*eurRate:e.amount; totals[e.cat]=(totals[e.cat]||0)+ils; grand+=ils; });
  const breakdown=Object.entries(totals).map(([k,v])=>`${EXPENSE_CATS[k].label}: ₪${v.toFixed(0)} (${(v/grand*100).toFixed(1)}%)`).join(', ');
  const expList=exps.map(e=>`${EXPENSE_CATS[e.cat].label}: ${e.desc} – ₪${(e.currency==='EUR'?e.amount*eurRate:e.amount).toFixed(0)}`).join('\n');
  try {
    const text=await hfChat([{role:'system',content:'אתה יועץ פיננסי לטיולים. ענה בעברית בלבד.'},{role:'user',content:`סה"כ: ₪${grand.toFixed(0)}\nחלוקה: ${breakdown}\nפירוט:\n${expList}\n\nתן ניתוח קצר ו-3-4 המלצות חיסכון.`}]);
    el.innerHTML=`<div class="ai-result"><h3>🤖 ניתוח AI</h3>${text.replace(/\n/g,'<br>')}</div>`;
  } catch(err){ el.innerHTML=`<div class="ai-result" style="border-color:rgba(232,85,85,.3)"><h3 style="color:var(--red)">⚠️ שגיאה</h3>${aiErr(err)}</div>`; }
}

// ═══════════════════════════════════════════════════════════════
//  CHAT
// ═══════════════════════════════════════════════════════════════
const CHAT_SYSTEM=`אתה מדריך טיולים מומחה ליוון שמלווה ישראלים באתונה. ענה תמיד בעברית בלבד, בצורה ידידותית וקצרה.`;
function appendBubble(role,text){ const a=document.getElementById('chatMessages'); const w=document.createElement('div'); w.className='chat-row '+(role==='user'?'chat-row-user':'chat-row-ai'); const b=document.createElement('div'); b.className='chat-bubble '+(role==='user'?'chat-bubble-user':'chat-bubble-ai'); b.innerHTML=text.replace(/\n/g,'<br>'); w.appendChild(b); a.appendChild(w); a.scrollTop=a.scrollHeight; }
function appendTyping(){ const a=document.getElementById('chatMessages'); const w=document.createElement('div'); w.className='chat-row chat-row-ai'; w.id='typingIndicator'; w.innerHTML='<div class="chat-bubble chat-bubble-ai"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></div>'; a.appendChild(w); a.scrollTop=a.scrollHeight; }
async function sendChatMessage(){ const inp=document.getElementById('chatInput'); const text=inp.value.trim(); if(!text) return; inp.value=''; inp.style.height='auto'; appendBubble('user',text); chatHistory.push({role:'user',content:text}); appendTyping(); document.getElementById('chatSendBtn').disabled=true; try{ const reply=await hfChat([{role:'system',content:CHAT_SYSTEM},...chatHistory]); document.getElementById('typingIndicator')?.remove(); chatHistory.push({role:'assistant',content:reply}); appendBubble('assistant',reply); }catch(err){ document.getElementById('typingIndicator')?.remove(); appendBubble('assistant','⚠️ '+aiErr(err)); }finally{ document.getElementById('chatSendBtn').disabled=false; inp.focus(); } }
function clearChat(){ chatHistory=[]; const a=document.getElementById('chatMessages'); if(a){ a.innerHTML=''; appendBubble('assistant','שלום! אני כאן לעזור לכם ביוון 🏛️\nשאלו אותי על מקומות, שעות פתיחה, אוכל, תחבורה – כל מה שצריך!'); } }

// ═══════════════════════════════════════════════════════════════
//  TOKEN MANAGEMENT
// ═══════════════════════════════════════════════════════════════
function updateKeyStatus(){ const el=document.getElementById('keyStatusBtn'); if(!el) return; const ok=HF_TOKEN_HARDCODED!=='YOUR_HF_TOKEN_HERE'||!!getHfToken(); el.innerHTML=ok?'🔑 AI ✅':'🔑 הגדר Token'; el.style.borderColor=ok?'rgba(45,212,160,.4)':'rgba(155,114,240,.4)'; el.style.color=ok?'var(--green)':'var(--purple)'; }
function showKeyModal(){
  const cur=getHfToken();
  document.getElementById('modalTitle').textContent='🔑 HuggingFace Token';
  const delBtn=cur?'<button onclick="clearKey()" style="width:100%;margin-top:10px;background:rgba(232,85,85,.1);border:1px solid rgba(232,85,85,.3);color:var(--red);border-radius:12px;padding:12px;font-family:\'Heebo\',sans-serif;font-size:14px;font-weight:600;cursor:pointer;">🗑️ מחק Token</button>':'';
  document.getElementById('modalContent').innerHTML=
    '<div class="modal-body" style="margin-bottom:12px"><p style="color:var(--text-dim);font-size:13px;margin-bottom:16px">ה-Token נשמר במכשיר זה בלבד.</p><h4>קבל Token חינמי</h4><p style="margin-bottom:16px"><a href="https://huggingface.co/settings/tokens" target="_blank" style="color:var(--blue-light)">huggingface.co/settings/tokens ↗</a><br>→ New Token → Type: Read</p><h4>הכנס Token</h4></div>'+
    '<input class="form-input" id="keyInput" type="password" placeholder="hf_..." value="'+cur+'" style="font-family:monospace">'+
    '<button class="save-btn" onclick="saveKeyFromModal()">💾 שמור</button>'+delBtn;
  openModal();
}
function saveKeyFromModal(){ const v=document.getElementById('keyInput').value.trim(); if(!v){showToast('⚠️ הכנס Token');return;} saveHfToken(v); closeModalDirect(); updateKeyStatus(); showToast('✅ Token נשמר!'); }
function clearKey(){ if(!confirm('למחוק Token?'))return; localStorage.removeItem('hf_token'); closeModalDirect(); updateKeyStatus(); showToast('🗑️ Token נמחק'); }

// ═══════════════════════════════════════════════════════════════
//  MODAL / TOAST
// ═══════════════════════════════════════════════════════════════
function openModal(){ document.getElementById('modalOverlay').classList.add('open'); }
function closeModal(e){ if(e.target===document.getElementById('modalOverlay')) closeModalDirect(); }
function closeModalDirect(){ document.getElementById('modalOverlay').classList.remove('open'); }
function showToast(msg){ const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2500); }

// ═══════════════════════════════════════════════════════════════
//  DOM READY
// ═══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('usernameInput').addEventListener('keydown',e=>{ if(e.key==='Enter') doLogin(); });
  const ci=document.getElementById('chatInput');
  if(ci){
    ci.addEventListener('keydown',e=>{ if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendChatMessage();} });
    ci.addEventListener('input',()=>{ ci.style.height='auto'; ci.style.height=Math.min(ci.scrollHeight,120)+'px'; });
  }
  clearChat();
});
