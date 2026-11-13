/* ============================================================
 *  HDTM Rural — Frontend Logic
 *  Tất cả data qua GAS Multi-Purpose (table-based CRUD)
 * ============================================================ */

// ===== CONFIG =====
let GAS_URL = localStorage.getItem('hdtm_gas_url') || '';
let CURRENT_ROLE = localStorage.getItem('hdtm_role') || 'admin';
let CURRENT_USER = 'demo_user'; // TODO: lấy từ auth thật

// ===== STATE =====
let STORE_DATA = null;       // storelist.json content
let ALL_STORES = [];
let ACTIVITY_TYPES = [];
let RULES = [];
let ACTIVITIES = [];         // cache cho tracking/dashboard
let TARGETS = [];
let SELECTED_STORES = [];    // trong flow đăng ký
let REG_STEP = 1;
let REG_TYPE_SELECTED = null;
let TR_PAGE = 1;
const TR_PAGE_SIZE = 25;
let CAL_MONTH = new Date().getMonth();
let CAL_YEAR = new Date().getFullYear();

const STATUS_LABELS = {
  DRAFT:'Nháp', REGISTERED:'Đã đăng ký', APPROVED:'Đã duyệt', PLANNED:'Đã lên kế hoạch',
  IN_PROGRESS:'Đang triển khai', COMPLETED:'Hoàn thành', CANCELLED:'Đã hủy',
  REPLACED:'Đã thay thế', OVERDUE:'Quá hạn'
};
const STATUS_BADGE = {
  DRAFT:'badge-draft', REGISTERED:'badge-registered', APPROVED:'badge-approved',
  PLANNED:'badge-planned', IN_PROGRESS:'badge-inprogress', COMPLETED:'badge-completed',
  CANCELLED:'badge-cancelled', REPLACED:'badge-replaced', OVERDUE:'badge-overdue'
};

// ===== INIT =====
document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('gasUrlInput').value = GAS_URL;
  document.getElementById('roleSelector').value = CURRENT_ROLE;
  updateUserRoleChip();
  bindNav();
  await loadStoreList();
  populateMonthWeekSelectors();
  populateCascadingFilters();
  loadMasterData();
  renderStoreList();
  renderTypeCards();
  loadDashboard();
  renderCalendar();
  loadMasterStoreTable();
});

function bindNav() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      const view = item.dataset.view;
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      document.getElementById('view-' + view).classList.add('active');
      document.getElementById('viewTitle').textContent = item.textContent.trim();
      document.getElementById('sidebar').classList.remove('show');
      // lazy loads
      if (view === 'tracking') loadTracking(1);
      if (view === 'recap') loadRecap();
      if (view === 'target') loadTargetTable();
      if (view === 'master-type') loadTypeMasterTable();
      if (view === 'master-rule') loadRuleMasterTable();
      if (view === 'audit') loadAudit();
    });
  });
  document.getElementById('menuToggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('show');
  });
}

function updateUserRoleChip() {
  const labels = {admin:'👑 Admin', manager:'🧑‍💼 Manager', qlkv:'👤 QLKV', gdv:'👤 GĐV', viewer:'👁️ Viewer'};
  document.getElementById('userRole').textContent = labels[CURRENT_ROLE] || CURRENT_ROLE;
}
function changeRole() {
  CURRENT_ROLE = document.getElementById('roleSelector').value;
  localStorage.setItem('hdtm_role', CURRENT_ROLE);
  updateUserRoleChip();
}
function saveGasUrl() {
  GAS_URL = document.getElementById('gasUrlInput').value.trim();
  localStorage.setItem('hdtm_gas_url', GAS_URL);
  alert('✅ Đã lưu GAS URL. Tải lại trang để áp dụng.');
}

// ===== GAS API HELPERS =====
async function gasGet(params) {
  if (!GAS_URL) return { success:false, error:'Chưa cấu hình GAS URL (vào Setting)' };
  const qs = new URLSearchParams(params).toString();
  try {
    const res = await fetch(GAS_URL + '?' + qs);
    return await res.json();
  } catch(e) {
    console.error(e);
    return { success:false, error:String(e) };
  }
}
async function gasPost(body) {
  if (!GAS_URL) return { success:false, error:'Chưa cấu hình GAS URL (vào Setting)' };
  try {
    const res = await fetch(GAS_URL, {
      method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'},
      body: JSON.stringify(body)
    });
    return await res.json();
  } catch(e) {
    console.error(e);
    return { success:false, error:String(e) };
  }
}
async function listTable(table) {
  const r = await gasGet({ action:'list', table });
  return (r && r.success && r.data) ? r.data : [];
}

// ===== STORE LIST (local JSON, fallback) =====
async function loadStoreList() {
  try {
    const res = await fetch('storelist.json');
    STORE_DATA = await res.json();
    ALL_STORES = STORE_DATA.stores || [];
  } catch(e) {
    console.error('Không tải được storelist.json', e);
    ALL_STORES = [];
  }
}

function uniqueVals(arr, key) {
  return [...new Set(arr.map(s => s[key]).filter(Boolean))].sort();
}

function populateCascadingFilters() {
  const miens = uniqueVals(ALL_STORES, 'mien');
  ['regMien','trMien','dbMien','rcMien'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    miens.forEach(m => el.insertAdjacentHTML('beforeend', `<option value="${m}">${m}</option>`));
  });

  // cascading for registration step 2
  const regMien = document.getElementById('regMien');
  const regTinh = document.getElementById('regTinh');
  const regHuyen = document.getElementById('regHuyen');
  const regQlkv = document.getElementById('regQlkv');
  const regGdv = document.getElementById('regGdv');

  regMien.addEventListener('change', () => cascadeUpdate('tinh'));
  regTinh.addEventListener('change', () => cascadeUpdate('huyen'));
  regHuyen.addEventListener('change', () => cascadeUpdate('qlkv'));
  regQlkv.addEventListener('change', () => cascadeUpdate('gdv'));
  regGdv.addEventListener('change', () => renderStoreList());
  [regMien, regTinh, regHuyen, regQlkv].forEach(el => el.addEventListener('change', renderStoreList));

  function cascadeUpdate(level) {
    const mien = regMien.value, tinh = regTinh.value, huyen = regHuyen.value, qlkv = regQlkv.value;
    let filtered = ALL_STORES;
    if (mien) filtered = filtered.filter(s => s.mien === mien);
    if (level === 'tinh' || level === 'huyen' || level === 'qlkv' || level === 'gdv') {
      if (level === 'tinh') {
        regTinh.innerHTML = '<option value="">— Tất cả —</option>' + uniqueVals(filtered,'tinh').map(t=>`<option value="${t}">${t}</option>`).join('');
        regHuyen.innerHTML = '<option value="">— Tất cả —</option>';
        regQlkv.innerHTML = '<option value="">— Tất cả —</option>';
        regGdv.innerHTML = '<option value="">— Tất cả —</option>';
      }
    }
    if (tinh) filtered = filtered.filter(s => s.tinh === tinh);
    if (level === 'huyen' || level === 'qlkv' || level === 'gdv') {
      if (level === 'huyen') {
        regHuyen.innerHTML = '<option value="">— Tất cả —</option>' + uniqueVals(filtered,'huyen').map(h=>`<option value="${h}">${h}</option>`).join('');
        regQlkv.innerHTML = '<option value="">— Tất cả —</option>';
        regGdv.innerHTML = '<option value="">— Tất cả —</option>';
      }
    }
    if (huyen) filtered = filtered.filter(s => s.huyen === huyen);
    if (level === 'qlkv' || level === 'gdv') {
      if (level === 'qlkv') {
        regQlkv.innerHTML = '<option value="">— Tất cả —</option>' + uniqueVals(filtered,'qlkv').map(q=>`<option value="${q}">${q}</option>`).join('');
        regGdv.innerHTML = '<option value="">— Tất cả —</option>';
      }
    }
    if (qlkv) filtered = filtered.filter(s => s.qlkv === qlkv);
    if (level === 'gdv') {
      regGdv.innerHTML = '<option value="">— Tất cả —</option>' + uniqueVals(filtered,'gdv').map(g=>`<option value="${g}">${g}</option>`).join('');
    }
  }

  // tracking/dashboard filters: simple flat qlkv/gdv list
  const qlkvs = uniqueVals(ALL_STORES, 'qlkv');
  const gdvs = uniqueVals(ALL_STORES, 'gdv');
  ['trQlkv','dbQlkv'].forEach(id => {
    const el = document.getElementById(id);
    qlkvs.forEach(q => el.insertAdjacentHTML('beforeend', `<option value="${q}">${q}</option>`));
  });
  ['trGdv','dbGdv','rcGdv','rcQlkv'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const list = id.includes('Qlkv') ? qlkvs : gdvs;
    list.forEach(v => el.insertAdjacentHTML('beforeend', `<option value="${v}">${v}</option>`));
  });
}

function populateMonthWeekSelectors() {
  const now = new Date();
  const months = [];
  for (let i=-1;i<=3;i++){
    const d = new Date(now.getFullYear(), now.getMonth()+i, 1);
    months.push({val:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`, label:`Tháng ${d.getMonth()+1}/${d.getFullYear()}`});
  }
  ['regMonth','dbMonth','trMonth','rcMonth'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = months.map(m=>`<option value="${m.val}">${m.label}</option>`).join('');
  });
  document.getElementById('regMonth').value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;

  const weeks = [1,2,3,4,5].map(w=>`<option value="W${w}">Tuần ${w}</option>`).join('');
  ['regWeek','trWeek','rcWeek'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const hasAll = el.innerHTML.includes('Tất cả') || el.innerHTML.includes('Cả tháng');
    el.innerHTML = (hasAll ? el.innerHTML : '') + weeks;
  });
  updateDaysForWeek();
  document.getElementById('regWeek').addEventListener('change', updateDaysForWeek);
  document.getElementById('regMonth').addEventListener('change', updateDaysForWeek);
}

function updateDaysForWeek() {
  const monthVal = document.getElementById('regMonth').value;
  const [y,m] = monthVal.split('-').map(Number);
  const weekNum = parseInt(document.getElementById('regWeek').value.replace('W',''))||1;
  const firstDay = new Date(y, m-1, 1);
  // Simple week split: week N = days (N-1)*7+1 .. N*7 of month (bounded)
  const daysInMonth = new Date(y, m, 0).getDate();
  const start = (weekNum-1)*7+1;
  const end = Math.min(weekNum*7, daysInMonth);
  const dayNames = ['CN','T2','T3','T4','T5','T6','T7'];
  const sel = document.getElementById('regDay');
  sel.innerHTML = '';
  for (let d=start; d<=end; d++) {
    const dateObj = new Date(y, m-1, d);
    const label = `${dayNames[dateObj.getDay()]} - ${String(d).padStart(2,'0')}/${String(m).padStart(2,'0')}/${y}`;
    sel.insertAdjacentHTML('beforeend', `<option value="${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}">${label}</option>`);
  }
}

// ===== MASTER DATA (types + rules) =====
const DEFAULT_TYPES = [
  {code:'HN_T',name:'Hoạt náo_Thường',target_type:'weekly',days_per:1,uplift_benchmark:15,color:'#2196F3',active:'TRUE'},
  {code:'HN_DN',name:'Hoạt náo điểm nhấn_FF',target_type:'weekly',days_per:2,uplift_benchmark:30,color:'#FF9800',active:'TRUE'},
  {code:'HC',name:'Hội chợ',target_type:'monthly',days_per:1,uplift_benchmark:50,color:'#4CAF50',active:'TRUE'},
  {code:'HC_LON',name:'Hội chợ lớn',target_type:'monthly',days_per:1,uplift_benchmark:100,color:'#E91E63',active:'TRUE'},
  {code:'DDT',name:'Đánh đối thủ',target_type:'weekly',days_per:1,uplift_benchmark:40,color:'#9C27B0',active:'TRUE'},
  {code:'KT',name:'Khai trương',target_type:'monthly',days_per:1,uplift_benchmark:150,color:'#F44336',active:'TRUE'},
  {code:'KHAC',name:'Các hoạt động khác',target_type:'monthly',days_per:1,uplift_benchmark:10,color:'#607D8B',active:'TRUE'}
];
const DEFAULT_RULES = [
  {type_code:'HN_T',rule_name:'Số ngày/lượt',rule_value:'1',description:'Hoạt náo thường: 1 ngày/lượt'},
  {type_code:'HN_DN',rule_name:'Số ngày/lượt',rule_value:'2',description:'Hoạt náo điểm nhấn: 2 ngày/lượt'},
  {type_code:'HC',rule_name:'Target tháng',rule_value:'Theo Target',description:'Hội chợ: số lượng theo Target tháng được phân bổ'},
  {type_code:'KT',rule_name:'Quy đổi',rule_value:'Khai trương = Hội chợ lớn',description:'Khai trương tính như Hội chợ lớn'}
];

async function loadMasterData() {
  if (GAS_URL) {
    const types = await listTable('hdtm_types');
    const rules = await listTable('hdtm_rules');
    ACTIVITY_TYPES = types.length ? types : DEFAULT_TYPES;
    RULES = rules.length ? rules : DEFAULT_RULES;
  } else {
    ACTIVITY_TYPES = DEFAULT_TYPES;
    RULES = DEFAULT_RULES;
  }
  renderTypeCards();
}

// ===== STEP NAVIGATION (REGISTER) =====
function goStep(n) {
  if (n > REG_STEP) {
    if (REG_STEP === 3 && SELECTED_STORES.length === 0) { alert('⚠️ Vui lòng chọn ít nhất 1 cửa hàng'); return; }
    if (REG_STEP === 4 && !REG_TYPE_SELECTED) { alert('⚠️ Vui lòng chọn loại HĐTM'); return; }
  }
  REG_STEP = n;
  document.querySelectorAll('.step-tab').forEach(t => {
    const s = parseInt(t.dataset.step);
    t.classList.toggle('active', s === n);
    t.classList.toggle('done', s < n);
  });
  document.querySelectorAll('.step-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('step-'+n).classList.add('active');
  if (n === 5) renderStep5Summary();
}
document.querySelectorAll('.step-tab').forEach(t => {
  t.addEventListener('click', () => goStep(parseInt(t.dataset.step)));
});

// ===== STEP 3: STORE SELECTION =====
function getFilteredStoresForReg() {
  const mien = document.getElementById('regMien').value;
  const tinh = document.getElementById('regTinh').value;
  const huyen = document.getElementById('regHuyen').value;
  const qlkv = document.getElementById('regQlkv').value;
  const gdv = document.getElementById('regGdv').value;
  const search = (document.getElementById('storeSearch')?.value || '').toLowerCase();
  return ALL_STORES.filter(s => {
    if (mien && s.mien !== mien) return false;
    if (tinh && s.tinh !== tinh) return false;
    if (huyen && s.huyen !== huyen) return false;
    if (qlkv && s.qlkv !== qlkv) return false;
    if (gdv && s.gdv !== gdv) return false;
    if (search && !(s.sap.toLowerCase().includes(search) || s.name.toLowerCase().includes(search))) return false;
    return true;
  });
}

function renderStoreList() {
  const filtered = getFilteredStoresForReg().slice(0, 200); // perf cap
  const container = document.getElementById('storeList');
  if (!filtered.length) {
    container.innerHTML = '<div class="empty-state"><div class="ic">🔍</div>Không tìm thấy cửa hàng phù hợp</div>';
    return;
  }
  container.innerHTML = filtered.map(s => {
    const checked = SELECTED_STORES.some(x => x.sap === s.sap) ? 'checked' : '';
    return `<div class="store-row" onclick="toggleStoreCheckbox(event,'${s.sap}')">
      <input type="checkbox" ${checked} onclick="event.stopPropagation();toggleStore('${s.sap}')">
      <div class="s-info">
        <div class="s-name">${s.sap} — ${s.name}</div>
        <div class="s-meta">${s.qlkv || '—'} · ${s.gdv || '—'} · ${s.status || '—'} · ${s.nhom_dt || ''}</div>
      </div>
    </div>`;
  }).join('') + (filtered.length === 200 ? '<div style="padding:10px;text-align:center;color:var(--text3);font-size:.78rem">Hiển thị 200 kết quả đầu, thu hẹp bộ lọc để xem thêm</div>' : '');
  updateSelectedCount();
}
function toggleStoreCheckbox(e, sap) { toggleStore(sap); renderStoreList(); }
function toggleStore(sap) {
  const idx = SELECTED_STORES.findIndex(s => s.sap === sap);
  if (idx >= 0) SELECTED_STORES.splice(idx,1);
  else { const s = ALL_STORES.find(x => x.sap === sap); if (s) SELECTED_STORES.push(s); }
  renderSelectedChips();
  updateSelectedCount();
}
function selectAllFiltered() {
  const filtered = getFilteredStoresForReg();
  filtered.forEach(s => { if (!SELECTED_STORES.some(x=>x.sap===s.sap)) SELECTED_STORES.push(s); });
  renderStoreList(); renderSelectedChips(); updateSelectedCount();
}
function clearSelectedStores() {
  SELECTED_STORES = [];
  renderStoreList(); renderSelectedChips(); updateSelectedCount();
}
function removeSelectedStore(sap) {
  SELECTED_STORES = SELECTED_STORES.filter(s => s.sap !== sap);
  renderStoreList(); renderSelectedChips(); updateSelectedCount();
}
function renderSelectedChips() {
  const el = document.getElementById('selectedStoresChips');
  el.innerHTML = SELECTED_STORES.map(s => `<span class="selected-stores-chip">${s.sap} ${s.name.substring(0,20)} <button onclick="removeSelectedStore('${s.sap}')">×</button></span>`).join('');
}
function updateSelectedCount() {
  document.getElementById('selectedCount').textContent = `Đã chọn: ${SELECTED_STORES.length}`;
}

// ===== STEP 4: TYPE SELECTION =====
function renderTypeCards() {
  const grid = document.getElementById('typeCardGrid');
  if (!grid) return;
  grid.innerHTML = ACTIVITY_TYPES.filter(t => String(t.active).toUpperCase() !== 'FALSE').map(t => `
    <div class="type-card ${REG_TYPE_SELECTED===t.code?'selected':''}" onclick="selectType('${t.code}')" style="border-left:4px solid ${t.color||'#1a3c6e'}">
      <div class="t-name">${t.name}</div>
      <div class="t-meta">
        Chu kỳ: ${t.target_type==='weekly'?'Tuần':'Tháng'}<br>
        Số ngày/lượt: ${t.days_per}<br>
        Uplift benchmark: +${t.uplift_benchmark}%
      </div>
    </div>`).join('');
}
function selectType(code) {
  REG_TYPE_SELECTED = code;
  renderTypeCards();
  const t = ACTIVITY_TYPES.find(x => x.code === code);
  const rules = RULES.filter(r => r.type_code === code);
  document.getElementById('typeDetailBox').innerHTML = `
    <div class="card" style="background:var(--bg);box-shadow:none">
      <div class="card-title">Quy định áp dụng — ${t.name}</div>
      ${rules.map(r => `<div style="padding:6px 0;font-size:.84rem"><b>${r.rule_name}:</b> ${r.rule_value} <span style="color:var(--text2)">— ${r.description}</span></div>`).join('') || '<div style="color:var(--text3);font-size:.84rem">Chưa có rule riêng</div>'}
      <div style="margin-top:8px;font-size:.84rem"><b>Uplift dự kiến:</b> +${t.uplift_benchmark}% so với SPD base</div>
    </div>`;
}

// ===== STEP 5: SUMMARY + VALIDATION =====
function renderStep5Summary() {
  const monthVal = document.getElementById('regMonth').value;
  const week = document.getElementById('regWeek').value;
  const day = document.getElementById('regDay').value;
  const t = ACTIVITY_TYPES.find(x => x.code === REG_TYPE_SELECTED);

  document.getElementById('regSummary').innerHTML = `
    <div class="summary-row"><span class="label">Thời gian</span><span class="value">${week} · ${day}</span></div>
    <div class="summary-row"><span class="label">Số cửa hàng</span><span class="value">${SELECTED_STORES.length} CH</span></div>
    <div class="summary-row"><span class="label">Loại HĐTM</span><span class="value">${t ? t.name : '—'}</span></div>
    <div class="summary-row"><span class="label">Uplift dự kiến</span><span class="value">+${t ? t.uplift_benchmark : 0}%</span></div>
    <div class="summary-row"><span class="label">Người đăng ký</span><span class="value">${CURRENT_USER}</span></div>
    <div class="summary-row"><span class="label">Ghi chú</span><span class="value">${document.getElementById('regNote').value || '—'}</span></div>
  `;

  // Validation checks
  const warnings = [];
  // Check trùng lịch: same SAP + same day already in ACTIVITIES cache
  const dupStores = SELECTED_STORES.filter(s => ACTIVITIES.some(a => a.sap === s.sap && a.plan_date === day && a.status !== 'CANCELLED' && a.status !== 'REPLACED'));
  if (dupStores.length) {
    warnings.push(`<div class="warning-box danger">⚠️ ${dupStores.length} cửa hàng đã có hoạt động trong ngày này: ${dupStores.map(s=>s.sap).join(', ')}</div>`);
  }
  // Check vượt target (demo: so sánh count theo qlkv+type trong TARGETS)
  const qlkvGroups = {};
  SELECTED_STORES.forEach(s => { qlkvGroups[s.qlkv] = (qlkvGroups[s.qlkv]||0)+1; });
  Object.keys(qlkvGroups).forEach(q => {
    const tg = TARGETS.find(t2 => t2.qlkv === q && t2.type_code === REG_TYPE_SELECTED && t2.month === monthVal);
    if (tg) {
      const already = ACTIVITIES.filter(a => a.qlkv===q && a.type_code===REG_TYPE_SELECTED && a.status!=='CANCELLED').length;
      if (already + qlkvGroups[q] > Number(tg.target_qty)) {
        warnings.push(`<div class="warning-box">⚠️ QLKV ${q}: đăng ký (${already+qlkvGroups[q]}) vượt Target được phân bổ (${tg.target_qty})</div>`);
      }
    }
  });
  if (!warnings.length) warnings.push(`<div class="warning-box success">✅ Không phát hiện vi phạm quy tắc nào</div>`);
  document.getElementById('validationWarnings').innerHTML = warnings.join('');
}

async function submitRegistration() {
  const btn = document.getElementById('btnSubmitReg');
  btn.disabled = true; btn.textContent = '⏳ Đang đăng ký...';
  const monthVal = document.getElementById('regMonth').value;
  const week = document.getElementById('regWeek').value;
  const day = document.getElementById('regDay').value;
  const note = document.getElementById('regNote').value;
  const t = ACTIVITY_TYPES.find(x => x.code === REG_TYPE_SELECTED);
  const now = new Date().toISOString();

  let successCount = 0;
  for (const s of SELECTED_STORES) {
    const activityId = 'ACT-' + Date.now().toString(36).toUpperCase() + '-' + Math.floor(Math.random()*1000);
    const activity = {
      activity_id: activityId, parent_id: '', type_code: REG_TYPE_SELECTED, type_name: t?t.name:'',
      sap: s.sap, store_name: s.name, mien: s.mien, tinh: s.tinh, huyen: s.huyen, qlkv: s.qlkv, gdv: s.gdv,
      week: week, plan_date: day, target: 1, actual: '', uplift_planned: t?t.uplift_benchmark:0, uplift_actual:'',
      spd_base:'', spd_actual:'', status:'REGISTERED', registered_by: CURRENT_USER, registered_at: now,
      note: note, created_at: now, updated_at: now
    };
    if (GAS_URL) {
      await gasPost({ action:'save', table:'hdtm_activities', data: activity });
      await gasPost({ action:'save', table:'hdtm_history', data: {
        activity_id: activityId, action:'REGISTERED', changed_by: CURRENT_USER, changed_at: now,
        field_name:'ALL', old_value:'', new_value: JSON.stringify(activity), reason:'Đăng ký mới'
      }});
    }
    ACTIVITIES.push(activity);
    successCount++;
  }

  btn.disabled = false; btn.textContent = '✅ ĐĂNG KÝ HOẠT ĐỘNG';
  alert(`✅ Đã đăng ký thành công ${successCount} hoạt động!`);
  // reset
  SELECTED_STORES = []; REG_TYPE_SELECTED = null;
  renderSelectedChips(); updateSelectedCount(); renderTypeCards();
  document.getElementById('regNote').value = '';
  goStep(1);
  loadDashboard(); loadTracking(1);
}

// ===== DASHBOARD =====
async function loadDashboard() {
  if (GAS_URL) {
    ACTIVITIES = await listTable('hdtm_activities');
    TARGETS = await listTable('hdtm_targets');
  }
  const mien = document.getElementById('dbMien').value;
  const qlkv = document.getElementById('dbQlkv').value;
  const gdv = document.getElementById('dbGdv').value;

  let filtered = ACTIVITIES.filter(a => a.status !== 'REPLACED');
  if (mien) filtered = filtered.filter(a => a.mien === mien);
  if (qlkv) filtered = filtered.filter(a => a.qlkv === qlkv);
  if (gdv) filtered = filtered.filter(a => a.gdv === gdv);

  const totalCH = ALL_STORES.filter(s => (s.status||'').includes('hoạt động')).length;
  const targetTotal = TARGETS.reduce((sum,t) => sum + (Number(t.target_qty)||0), 0) || filtered.length || 1;
  const registered = filtered.filter(a => ['REGISTERED','APPROVED','PLANNED','IN_PROGRESS','COMPLETED'].includes(a.status)).length;
  const deployed = filtered.filter(a => ['IN_PROGRESS','COMPLETED'].includes(a.status)).length;
  const completed = filtered.filter(a => a.status === 'COMPLETED').length;
  const completeRate = registered ? Math.round(completed/registered*100) : 0;
  const upliftPlan = avgNum(filtered.map(a=>Number(a.uplift_planned)||0));
  const upliftActual = avgNum(filtered.filter(a=>a.uplift_actual).map(a=>Number(a.uplift_actual)||0));

  document.getElementById('kpiTotalCH').textContent = totalCH.toLocaleString();
  document.getElementById('kpiTarget').textContent = targetTotal.toLocaleString();
  document.getElementById('kpiRegistered').textContent = registered.toLocaleString();
  document.getElementById('kpiRegisteredPct').textContent = pctOf(registered,targetTotal) + '% target';
  document.getElementById('kpiDeployed').textContent = deployed.toLocaleString();
  document.getElementById('kpiDeployedPct').textContent = pctOf(deployed,targetTotal) + '% target';
  document.getElementById('kpiCompleted').textContent = completed.toLocaleString();
  document.getElementById('kpiCompletedPct').textContent = pctOf(completed,targetTotal) + '% target';
  document.getElementById('kpiCompleteRate').textContent = completeRate + '%';
  document.getElementById('kpiUpliftPlan').textContent = (upliftPlan||0).toFixed(1) + '%';
  document.getElementById('kpiUpliftActual').textContent = (upliftActual||0).toFixed(1) + '%';

  renderDashboardCharts(filtered, targetTotal);
  renderTopQlkv(filtered);
  renderByGdv(filtered);
}
function pctOf(a,b){ return b ? Math.round(a/b*100) : 0; }
function avgNum(arr){ return arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0; }

let chartProgress, chartByType, chartByWeek;
function renderDashboardCharts(filtered, targetTotal) {
  const registered = filtered.filter(a => ['REGISTERED','APPROVED','PLANNED','IN_PROGRESS','COMPLETED'].includes(a.status)).length;
  const completed = filtered.filter(a => a.status === 'COMPLETED').length;

  const ctx1 = document.getElementById('chartProgress');
  if (chartProgress) chartProgress.destroy();
  chartProgress = new Chart(ctx1, {
    type:'bar',
    data:{ labels:['Target','Registered','Completed'], datasets:[{ data:[targetTotal,registered,completed], backgroundColor:['#1a3c6e','#1976D2','#1e8e4e'], borderRadius:6 }] },
    options:{ plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true}} }
  });

  const byType = {};
  ACTIVITY_TYPES.forEach(t => byType[t.code] = 0);
  filtered.forEach(a => { byType[a.type_code] = (byType[a.type_code]||0)+1; });
  const ctx2 = document.getElementById('chartByType');
  if (chartByType) chartByType.destroy();
  chartByType = new Chart(ctx2, {
    type:'doughnut',
    data:{ labels: ACTIVITY_TYPES.map(t=>t.name), datasets:[{ data: ACTIVITY_TYPES.map(t=>byType[t.code]||0), backgroundColor: ACTIVITY_TYPES.map(t=>t.color||'#999') }] },
    options:{ plugins:{legend:{position:'bottom',labels:{font:{size:10}}}} }
  });

  const byWeek = {W1:0,W2:0,W3:0,W4:0,W5:0};
  filtered.forEach(a => { if (byWeek[a.week]!==undefined) byWeek[a.week]++; });
  const ctx3 = document.getElementById('chartByWeek');
  if (chartByWeek) chartByWeek.destroy();
  chartByWeek = new Chart(ctx3, {
    type:'line',
    data:{ labels:Object.keys(byWeek), datasets:[{ data:Object.values(byWeek), borderColor:'#d71920', backgroundColor:'rgba(215,25,32,.1)', fill:true, tension:.3 }] },
    options:{ plugins:{legend:{display:false}} }
  });
}

function renderTopQlkv(filtered) {
  const groups = {};
  filtered.forEach(a => { groups[a.qlkv] = groups[a.qlkv] || {reg:0}; groups[a.qlkv].reg++; });
  const rows = Object.keys(groups).map(q => {
    const tg = TARGETS.filter(t=>t.qlkv===q).reduce((s,t)=>s+(Number(t.target_qty)||0),0) || groups[q].reg;
    const pct = pctOf(groups[q].reg, tg);
    return {q, tg, reg:groups[q].reg, pct};
  }).sort((a,b)=>a.pct-b.pct).slice(0,8);
  document.getElementById('tblTopQlkv').innerHTML = rows.map(r => `
    <tr><td>${r.q}</td><td>${r.tg}</td><td>${r.reg}</td><td><span class="badge ${r.pct<70?'badge-cancelled':r.pct<100?'badge-planned':'badge-completed'}">${r.pct}%</span></td></tr>
  `).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--text3)">Chưa có dữ liệu</td></tr>';
}
function renderByGdv(filtered) {
  const groups = {};
  filtered.forEach(a => {
    groups[a.gdv] = groups[a.gdv] || {reg:0,dep:0,comp:0};
    groups[a.gdv].reg++;
    if (['IN_PROGRESS','COMPLETED'].includes(a.status)) groups[a.gdv].dep++;
    if (a.status==='COMPLETED') groups[a.gdv].comp++;
  });
  const rows = Object.keys(groups).map(g => {
    const tg = TARGETS.filter(t=>t.gdv===g).reduce((s,t)=>s+(Number(t.target_qty)||0),0) || groups[g].reg;
    return {g, tg, ...groups[g], pct: pctOf(groups[g].comp, tg)};
  });
  document.getElementById('tblByGdv').innerHTML = rows.map(r => `
    <tr><td>${r.g}</td><td>${r.tg}</td><td>${r.reg}</td><td>${r.dep}</td><td>${r.comp}</td><td><span class="badge ${r.pct<70?'badge-cancelled':r.pct<100?'badge-planned':'badge-completed'}">${r.pct}%</span></td></tr>
  `).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--text3)">Chưa có dữ liệu</td></tr>';
}

// ===== TRACKING =====
async function loadTracking(page) {
  TR_PAGE = page || TR_PAGE;
  if (GAS_URL && ACTIVITIES.length===0) ACTIVITIES = await listTable('hdtm_activities');
  const month = document.getElementById('trMonth').value;
  const week = document.getElementById('trWeek').value;
  const mien = document.getElementById('trMien').value;
  const qlkv = document.getElementById('trQlkv').value;
  const gdv = document.getElementById('trGdv').value;
  const type = document.getElementById('trType').value;
  const status = document.getElementById('trStatus').value;
  const search = document.getElementById('trSearch').value.toLowerCase();

  let filtered = ACTIVITIES.filter(a => {
    if (month && !(a.plan_date||'').startsWith(month)) return false;
    if (week && a.week !== week) return false;
    if (mien && a.mien !== mien) return false;
    if (qlkv && a.qlkv !== qlkv) return false;
    if (gdv && a.gdv !== gdv) return false;
    if (type && a.type_code !== type) return false;
    if (status && a.status !== status) return false;
    if (search && !((a.sap||'').toLowerCase().includes(search) || (a.store_name||'').toLowerCase().includes(search))) return false;
    return true;
  }).sort((a,b) => (b.created_at||'').localeCompare(a.created_at||''));

  document.getElementById('trCount').textContent = `${filtered.length} hoạt động`;
  const totalPages = Math.max(1, Math.ceil(filtered.length / TR_PAGE_SIZE));
  TR_PAGE = Math.min(TR_PAGE, totalPages);
  document.getElementById('trPageLabel').textContent = `${TR_PAGE}/${totalPages}`;
  const pageData = filtered.slice((TR_PAGE-1)*TR_PAGE_SIZE, TR_PAGE*TR_PAGE_SIZE);

  document.getElementById('trackingBody').innerHTML = pageData.map(a => `
    <tr>
      <td>${a.activity_id}</td><td>${a.sap}</td><td>${a.store_name}</td><td>${a.qlkv}</td><td>${a.gdv}</td>
      <td>${a.type_name||a.type_code}</td><td>${a.week}</td><td>${formatDate(a.plan_date)}</td>
      <td>${a.target||''}</td><td>${a.actual||'—'}</td><td>${a.uplift_actual?a.uplift_actual+'%':(a.uplift_planned?'+'+a.uplift_planned+'%':'—')}</td>
      <td><span class="badge ${STATUS_BADGE[a.status]||'badge-draft'}">${STATUS_LABELS[a.status]||a.status}</span></td>
      <td>${a.registered_by||''}</td>
      <td class="action-icons">
        <button class="icon-btn" title="Xem" onclick="viewActivity('${a.activity_id}')">👁️</button>
        <button class="icon-btn" title="Sửa" onclick="editActivity('${a.activity_id}')">✏️</button>
        <button class="icon-btn" title="Thay thế" onclick="replaceActivity('${a.activity_id}')">🔁</button>
        <button class="icon-btn" title="Hủy" onclick="cancelActivity('${a.activity_id}')">🗑️</button>
        <button class="icon-btn" title="Lịch sử" onclick="viewHistory('${a.activity_id}')">🕐</button>
      </td>
    </tr>
  `).join('') || `<tr><td colspan="14"><div class="empty-state"><div class="ic">📭</div>Không có hoạt động nào phù hợp</div></td></tr>`;
}
function trPrevPage(){ if(TR_PAGE>1) loadTracking(TR_PAGE-1); }
function trNextPage(){ loadTracking(TR_PAGE+1); }
function formatDate(d){ if(!d) return '—'; const p=d.split('-'); return p.length===3?`${p[2]}/${p[1]}/${p[0]}`:d; }

// ===== ACTIVITY ACTIONS (Modal) =====
function findActivity(id){ return ACTIVITIES.find(a=>a.activity_id===id); }

function viewActivity(id) {
  const a = findActivity(id); if(!a) return;
  document.getElementById('modalTitle').textContent = `Chi tiết — ${a.activity_id}`;
  document.getElementById('modalBody').innerHTML = `
    <div class="summary-box">
      <div class="summary-row"><span class="label">Cửa hàng</span><span class="value">${a.sap} — ${a.store_name}</span></div>
      <div class="summary-row"><span class="label">QLKV / GĐV</span><span class="value">${a.qlkv} / ${a.gdv}</span></div>
      <div class="summary-row"><span class="label">Loại HĐTM</span><span class="value">${a.type_name||a.type_code}</span></div>
      <div class="summary-row"><span class="label">Tuần / Ngày</span><span class="value">${a.week} · ${formatDate(a.plan_date)}</span></div>
      <div class="summary-row"><span class="label">Target / Actual</span><span class="value">${a.target} / ${a.actual||'—'}</span></div>
      <div class="summary-row"><span class="label">Uplift</span><span class="value">+${a.uplift_planned}% dự kiến ${a.uplift_actual?'/ +'+a.uplift_actual+'% thực tế':''}</span></div>
      <div class="summary-row"><span class="label">Trạng thái</span><span class="value"><span class="badge ${STATUS_BADGE[a.status]}">${STATUS_LABELS[a.status]||a.status}</span></span></div>
      <div class="summary-row"><span class="label">Người đăng ký</span><span class="value">${a.registered_by} · ${a.registered_at?new Date(a.registered_at).toLocaleString('vi-VN'):''}</span></div>
      <div class="summary-row"><span class="label">Ghi chú</span><span class="value">${a.note||'—'}</span></div>
    </div>`;
  document.getElementById('modalFooter').innerHTML = `<button class="btn btn-secondary" onclick="closeModal()">Đóng</button>`;
  showModal();
}

function editActivity(id) {
  const a = findActivity(id); if(!a) return;
  document.getElementById('modalTitle').textContent = `Sửa hoạt động — ${a.activity_id}`;
  document.getElementById('modalBody').innerHTML = `
    <div class="form-group" style="margin-bottom:12px"><label>Ngày triển khai</label><input type="date" id="editDate" value="${a.plan_date}"></div>
    <div class="form-group" style="margin-bottom:12px"><label>Target</label><input type="number" id="editTarget" value="${a.target}"></div>
    <div class="form-group" style="margin-bottom:12px"><label>Actual</label><input type="number" id="editActual" value="${a.actual||''}"></div>
    <div class="form-group" style="margin-bottom:12px"><label>Trạng thái</label>
      <select id="editStatus">${Object.keys(STATUS_LABELS).map(s=>`<option value="${s}" ${a.status===s?'selected':''}>${STATUS_LABELS[s]}</option>`).join('')}</select>
    </div>
    <div class="form-group" style="margin-bottom:12px"><label>Ghi chú</label><input type="text" id="editNote" value="${a.note||''}"></div>
    <div class="form-group"><label>Lý do thay đổi (bắt buộc)</label><input type="text" id="editReason" placeholder="VD: Điều chỉnh lịch triển khai"></div>
  `;
  document.getElementById('modalFooter').innerHTML = `
    <button class="btn btn-secondary" onclick="closeModal()">Hủy</button>
    <button class="btn btn-primary" onclick="saveEditActivity('${id}')">💾 Lưu thay đổi</button>`;
  showModal();
}
async function saveEditActivity(id) {
  const a = findActivity(id); if(!a) return;
  const reason = document.getElementById('editReason').value;
  if (!reason) { alert('⚠️ Vui lòng nhập lý do thay đổi'); return; }
  const changes = [];
  const newDate = document.getElementById('editDate').value;
  const newTarget = document.getElementById('editTarget').value;
  const newActual = document.getElementById('editActual').value;
  const newStatus = document.getElementById('editStatus').value;
  const newNote = document.getElementById('editNote').value;
  if (newDate !== a.plan_date) changes.push({field:'plan_date', old:a.plan_date, new:newDate});
  if (String(newTarget) !== String(a.target)) changes.push({field:'target', old:a.target, new:newTarget});
  if (String(newActual) !== String(a.actual||'')) changes.push({field:'actual', old:a.actual, new:newActual});
  if (newStatus !== a.status) changes.push({field:'status', old:a.status, new:newStatus});
  if (newNote !== a.note) changes.push({field:'note', old:a.note, new:newNote});

  a.plan_date=newDate; a.target=newTarget; a.actual=newActual; a.status=newStatus; a.note=newNote; a.updated_at=new Date().toISOString();

  if (GAS_URL) {
    await gasPost({ action:'update', table:'hdtm_activities', id: id, idField:'activity_id', data:a });
    for (const c of changes) {
      await gasPost({ action:'save', table:'hdtm_history', data:{
        activity_id:id, action:'EDITED', changed_by:CURRENT_USER, changed_at:new Date().toISOString(),
        field_name:c.field, old_value:String(c.old), new_value:String(c.new), reason
      }});
    }
  }
  closeModal(); loadTracking(TR_PAGE); loadDashboard();
  alert('✅ Đã lưu thay đổi');
}

function replaceActivity(id) {
  const old = findActivity(id); if(!old) return;
  document.getElementById('modalTitle').textContent = `Thay thế hoạt động — ${old.activity_id}`;
  document.getElementById('modalBody').innerHTML = `
    <div class="warning-box">⚠️ Hoạt động cũ sẽ chuyển trạng thái REPLACED. Hoạt động mới sẽ được tạo và liên kết Parent ID.</div>
    <div class="form-group" style="margin-bottom:12px"><label>Loại HĐTM mới</label>
      <select id="replType">${ACTIVITY_TYPES.map(t=>`<option value="${t.code}" ${t.code===old.type_code?'selected':''}>${t.name}</option>`).join('')}</select>
    </div>
    <div class="form-group" style="margin-bottom:12px"><label>Ngày triển khai mới</label><input type="date" id="replDate" value="${old.plan_date}"></div>
    <div class="form-group"><label>Lý do thay thế (bắt buộc)</label><input type="text" id="replReason" placeholder="VD: Đổi sang hoạt náo điểm nhấn"></div>
  `;
  document.getElementById('modalFooter').innerHTML = `
    <button class="btn btn-secondary" onclick="closeModal()">Hủy</button>
    <button class="btn btn-primary" onclick="confirmReplace('${id}')">🔁 Xác nhận thay thế</button>`;
  showModal();
}
async function confirmReplace(oldId) {
  const old = findActivity(oldId); if(!old) return;
  const reason = document.getElementById('replReason').value;
  if (!reason) { alert('⚠️ Vui lòng nhập lý do thay thế'); return; }
  const newType = document.getElementById('replType').value;
  const newDate = document.getElementById('replDate').value;
  const newId = 'ACT-' + Date.now().toString(36).toUpperCase();
  const now = new Date().toISOString();
  const t = ACTIVITY_TYPES.find(x=>x.code===newType);

  const newActivity = { ...old, activity_id:newId, parent_id:oldId, type_code:newType, type_name:t?t.name:'', plan_date:newDate,
    status:'REGISTERED', uplift_planned: t?t.uplift_benchmark:old.uplift_planned, actual:'', uplift_actual:'',
    registered_by:CURRENT_USER, registered_at:now, created_at:now, updated_at:now };
  old.status = 'REPLACED'; old.updated_at = now;

  if (GAS_URL) {
    await gasPost({ action:'update', table:'hdtm_activities', id:oldId, idField:'activity_id', data:old });
    await gasPost({ action:'save', table:'hdtm_activities', data:newActivity });
    await gasPost({ action:'save', table:'hdtm_history', data:{
      activity_id:oldId, action:'REPLACED', changed_by:CURRENT_USER, changed_at:now,
      field_name:'status', old_value:'REGISTERED', new_value:'REPLACED→'+newId, reason
    }});
    await gasPost({ action:'save', table:'hdtm_history', data:{
      activity_id:newId, action:'CREATED_FROM_REPLACE', changed_by:CURRENT_USER, changed_at:now,
      field_name:'parent_id', old_value:'', new_value:oldId, reason
    }});
  }
  ACTIVITIES.push(newActivity);
  closeModal(); loadTracking(TR_PAGE); loadDashboard();
  alert(`✅ Đã thay thế! Activity mới: ${newId}`);
}

function cancelActivity(id) {
  const a = findActivity(id); if(!a) return;
  document.getElementById('modalTitle').textContent = `Hủy hoạt động — ${a.activity_id}`;
  document.getElementById('modalBody').innerHTML = `
    <div class="warning-box danger">⚠️ Hoạt động sẽ chuyển trạng thái CANCELLED. Dữ liệu không bị xóa.</div>
    <div class="form-group"><label>Lý do hủy (bắt buộc)</label><input type="text" id="cancelReason" placeholder="VD: Cửa hàng ngừng hoạt động"></div>
  `;
  document.getElementById('modalFooter').innerHTML = `
    <button class="btn btn-secondary" onclick="closeModal()">Đóng</button>
    <button class="btn btn-primary" style="background:var(--red)" onclick="confirmCancel('${id}')">🗑️ Xác nhận hủy</button>`;
  showModal();
}
async function confirmCancel(id) {
  const reason = document.getElementById('cancelReason').value;
  if (!reason) { alert('⚠️ Vui lòng nhập lý do hủy'); return; }
  const a = findActivity(id); if(!a) return;
  const now = new Date().toISOString();
  a.status = 'CANCELLED'; a.updated_at = now;
  if (GAS_URL) {
    await gasPost({ action:'update', table:'hdtm_activities', id:id, idField:'activity_id', data:a });
    await gasPost({ action:'save', table:'hdtm_history', data:{
      activity_id:id, action:'CANCELLED', changed_by:CURRENT_USER, changed_at:now,
      field_name:'status', old_value:'REGISTERED', new_value:'CANCELLED', reason
    }});
  }
  closeModal(); loadTracking(TR_PAGE); loadDashboard();
  alert('✅ Đã hủy hoạt động');
}

async function viewHistory(id) {
  document.getElementById('modalTitle').textContent = `Lịch sử thay đổi — ${id}`;
  document.getElementById('modalBody').innerHTML = '<div class="loading-state">⏳ Đang tải...</div>';
  showModal();
  let history = [];
  if (GAS_URL) {
    const all = await listTable('hdtm_history');
    history = all.filter(h => h.activity_id === id).sort((a,b)=>(a.changed_at||'').localeCompare(b.changed_at||''));
  }
  if (!history.length) {
    document.getElementById('modalBody').innerHTML = '<div class="empty-state"><div class="ic">🕐</div>Chưa có lịch sử thay đổi (hoặc chưa cấu hình GAS)</div>';
    return;
  }
  document.getElementById('modalBody').innerHTML = `<div class="timeline">${history.map(h => `
    <div class="timeline-item">
      <div class="ti-head">${h.action}</div>
      <div class="ti-time">${h.changed_by} · ${h.changed_at?new Date(h.changed_at).toLocaleString('vi-VN'):''}</div>
      <div class="ti-detail">${h.field_name}: <b>${h.old_value||'—'}</b> → <b>${h.new_value||'—'}</b><br>Lý do: ${h.reason||'—'}</div>
    </div>`).join('')}</div>`;
  document.getElementById('modalFooter').innerHTML = `<button class="btn btn-secondary" onclick="closeModal()">Đóng</button>`;
}

function showModal(){ document.getElementById('modalOverlay').classList.add('show'); }
function closeModal(){ document.getElementById('modalOverlay').classList.remove('show'); }
document.getElementById('modalOverlay').addEventListener('click', e => { if(e.target.id==='modalOverlay') closeModal(); });

// ===== RECAP =====
async function loadRecap() {
  if (GAS_URL && ACTIVITIES.length===0) ACTIVITIES = await listTable('hdtm_activities');
  const month = document.getElementById('rcMonth').value;
  const week = document.getElementById('rcWeek').value;
  const mien = document.getElementById('rcMien').value;
  const qlkv = document.getElementById('rcQlkv').value;
  const gdv = document.getElementById('rcGdv').value;

  let filtered = ACTIVITIES.filter(a => a.status !== 'REPLACED');
  if (month) filtered = filtered.filter(a => (a.plan_date||'').startsWith(month));
  if (week) filtered = filtered.filter(a => a.week === week);
  if (mien) filtered = filtered.filter(a => a.mien === mien);
  if (qlkv) filtered = filtered.filter(a => a.qlkv === qlkv);
  if (gdv) filtered = filtered.filter(a => a.gdv === gdv);

  const rows = ACTIVITY_TYPES.map(t => {
    const items = filtered.filter(a => a.type_code === t.code);
    const chSet = new Set(items.map(a=>a.sap));
    const target = TARGETS.filter(tg=>tg.type_code===t.code).reduce((s,tg)=>s+(Number(tg.target_qty)||0),0) || items.length;
    const registered = items.length;
    const deployed = items.filter(a=>['IN_PROGRESS','COMPLETED'].includes(a.status)).length;
    const completed = items.filter(a=>a.status==='COMPLETED').length;
    const pct = pctOf(completed, target);
    const upliftAvg = avgNum(items.filter(a=>a.uplift_actual).map(a=>Number(a.uplift_actual)));
    return {name:t.name, ch:chSet.size, target, registered, deployed, completed, pct, upliftAvg};
  });
  document.getElementById('recapBody').innerHTML = rows.map(r => `
    <tr><td>${r.name}</td><td>${r.ch}</td><td>${r.target}</td><td>${r.registered}</td><td>${r.deployed}</td><td>${r.completed}</td>
    <td><span class="badge ${r.pct<70?'badge-cancelled':r.pct<100?'badge-planned':'badge-completed'}">${r.pct}%</span></td><td>${r.upliftAvg?'+'+r.upliftAvg.toFixed(1)+'%':'—'}</td></tr>
  `).join('');
}
function exportRecapExcel() {
  const table = document.querySelector('#view-recap table');
  let csv = [];
  table.querySelectorAll('tr').forEach(tr => {
    const row = [...tr.querySelectorAll('th,td')].map(c => `"${c.textContent.trim()}"`).join(',');
    csv.push(row);
  });
  const blob = new Blob(['\uFEFF'+csv.join('\n')], {type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download='Recap_HDTM.csv'; a.click();
}
function exportRecapPDF() { window.print(); }

// ===== CALENDAR =====
function calPrevMonth(){ CAL_MONTH--; if(CAL_MONTH<0){CAL_MONTH=11;CAL_YEAR--;} renderCalendar(); }
function calNextMonth(){ CAL_MONTH++; if(CAL_MONTH>11){CAL_MONTH=0;CAL_YEAR++;} renderCalendar(); }
function renderCalendar() {
  document.getElementById('calMonthLabel').textContent = `Tháng ${CAL_MONTH+1}/${CAL_YEAR}`;
  const firstDay = new Date(CAL_YEAR, CAL_MONTH, 1);
  const startOffset = firstDay.getDay(); // 0=CN
  const daysInMonth = new Date(CAL_YEAR, CAL_MONTH+1, 0).getDate();
  const dayLabels = ['CN','T2','T3','T4','T5','T6','T7'];
  let html = dayLabels.map(d=>`<div class="cal-day-label">${d}</div>`).join('');

  const monthStr = `${CAL_YEAR}-${String(CAL_MONTH+1).padStart(2,'0')}`;
  for (let i=0;i<startOffset;i++) html += `<div class="cal-cell other-month"></div>`;
  for (let d=1; d<=daysInMonth; d++) {
    const dateStr = `${monthStr}-${String(d).padStart(2,'0')}`;
    const acts = ACTIVITIES.filter(a => a.plan_date === dateStr && a.status !== 'CANCELLED' && a.status !== 'REPLACED').slice(0,4);
    html += `<div class="cal-cell"><div class="cal-date">${d}</div>${acts.map(a=>`<div class="cal-activity" onclick="viewActivity('${a.activity_id}')" title="${a.store_name}">${a.type_name||a.type_code} · ${a.sap}</div>`).join('')}</div>`;
  }
  document.getElementById('calGrid').innerHTML = html;
}

// ===== TARGET MANAGEMENT =====
async function loadTargetTable() {
  if (GAS_URL) TARGETS = await listTable('hdtm_targets');
  document.getElementById('targetBody').innerHTML = TARGETS.map((t,i) => `
    <tr><td>${t.month}</td><td>${t.week||'Cả tháng'}</td><td>${t.qlkv||'—'}</td><td>${t.gdv||'—'}</td>
    <td>${ACTIVITY_TYPES.find(x=>x.code===t.type_code)?.name||t.type_code}</td><td>${t.target_ch||''}</td><td>${t.target_qty}</td><td>${t.note||''}</td>
    <td><button class="icon-btn" onclick="alert('Chức năng sửa Target — liên hệ admin hoặc cập nhật trực tiếp trên Sheet')">✏️</button></td></tr>
  `).join('') || '<tr><td colspan="9" style="text-align:center;color:var(--text3)">Chưa có Target nào</td></tr>';
}
function openTargetModal() {
  document.getElementById('modalTitle').textContent = 'Thêm Target mới';
  document.getElementById('modalBody').innerHTML = `
    <div class="form-grid" style="grid-template-columns:1fr 1fr">
      <div class="form-group"><label>Tháng</label><input type="month" id="tgMonth"></div>
      <div class="form-group"><label>Tuần (bỏ trống = cả tháng)</label><input type="text" id="tgWeek" placeholder="W1"></div>
      <div class="form-group"><label>QLKV</label><input type="text" id="tgQlkv"></div>
      <div class="form-group"><label>GĐV</label><input type="text" id="tgGdv"></div>
      <div class="form-group"><label>Loại HĐTM</label><select id="tgType">${ACTIVITY_TYPES.map(t=>`<option value="${t.code}">${t.name}</option>`).join('')}</select></div>
      <div class="form-group"><label>Số lượng CH</label><input type="number" id="tgCh"></div>
      <div class="form-group"><label>Số lượt</label><input type="number" id="tgQty"></div>
      <div class="form-group"><label>Ghi chú</label><input type="text" id="tgNote"></div>
    </div>`;
  document.getElementById('modalFooter').innerHTML = `<button class="btn btn-secondary" onclick="closeModal()">Hủy</button><button class="btn btn-primary" onclick="saveTarget()">💾 Lưu</button>`;
  showModal();
}
async function saveTarget() {
  const data = {
    month: document.getElementById('tgMonth').value, week: document.getElementById('tgWeek').value,
    qlkv: document.getElementById('tgQlkv').value, gdv: document.getElementById('tgGdv').value,
    type_code: document.getElementById('tgType').value, target_ch: document.getElementById('tgCh').value,
    target_qty: document.getElementById('tgQty').value, note: document.getElementById('tgNote').value
  };
  if (GAS_URL) await gasPost({ action:'save', table:'hdtm_targets', data });
  TARGETS.push(data);
  closeModal(); loadTargetTable();
  alert('✅ Đã thêm Target');
}

// ===== MASTER DATA: STORE =====
function loadMasterStoreTable(){ renderMasterStore(); }
function renderMasterStore() {
  const search = (document.getElementById('msStoreSearch').value||'').toLowerCase();
  let filtered = ALL_STORES;
  if (search) filtered = filtered.filter(s => [s.sap,s.name,s.qlkv,s.gdv].some(v=>(v||'').toLowerCase().includes(search)));
  document.getElementById('msStoreCount').textContent = `${filtered.length} / ${ALL_STORES.length} cửa hàng`;
  document.getElementById('masterStoreBody').innerHTML = filtered.slice(0,150).map(s => `
    <tr><td>${s.sap}</td><td>${s.name}</td><td>${s.status}</td><td>${s.mien}</td><td>${s.tinh}</td><td>${s.huyen||'—'}</td><td>${s.qlkv}</td><td>${s.gdv}</td><td>${s.nhom_dt}</td></tr>
  `).join('');
}

// ===== MASTER DATA: TYPE =====
async function loadTypeMasterTable() {
  document.getElementById('typeMasterBody').innerHTML = ACTIVITY_TYPES.map(t => `
    <tr><td>${t.code}</td><td>${t.name}</td><td>${t.target_type==='weekly'?'Tuần':'Tháng'}</td><td>${t.days_per}</td><td>+${t.uplift_benchmark}%</td>
    <td><span style="display:inline-block;width:18px;height:18px;border-radius:4px;background:${t.color};vertical-align:middle"></span></td>
    <td>${String(t.active).toUpperCase()!=='FALSE'?'🟢 Hoạt động':'⚪ Ngừng'}</td>
    <td><button class="icon-btn" onclick="editType('${t.code}')">✏️</button></td></tr>
  `).join('');
}
function openTypeModal() {
  document.getElementById('modalTitle').textContent = 'Thêm loại HĐTM';
  document.getElementById('modalBody').innerHTML = typeFormHtml({});
  document.getElementById('modalFooter').innerHTML = `<button class="btn btn-secondary" onclick="closeModal()">Hủy</button><button class="btn btn-primary" onclick="saveNewType()">💾 Lưu</button>`;
  showModal();
}
function editType(code) {
  const t = ACTIVITY_TYPES.find(x=>x.code===code);
  document.getElementById('modalTitle').textContent = 'Sửa loại HĐTM';
  document.getElementById('modalBody').innerHTML = typeFormHtml(t);
  document.getElementById('modalFooter').innerHTML = `<button class="btn btn-secondary" onclick="closeModal()">Hủy</button><button class="btn btn-primary" onclick="saveEditType('${code}')">💾 Lưu</button>`;
  showModal();
}
function typeFormHtml(t) {
  return `<div class="form-grid" style="grid-template-columns:1fr 1fr">
    <div class="form-group"><label>Mã</label><input type="text" id="tyCode" value="${t.code||''}" ${t.code?'readonly':''}></div>
    <div class="form-group"><label>Tên HĐTM</label><input type="text" id="tyName" value="${t.name||''}"></div>
    <div class="form-group"><label>Chu kỳ target</label><select id="tyTargetType"><option value="weekly" ${t.target_type==='weekly'?'selected':''}>Tuần</option><option value="monthly" ${t.target_type==='monthly'?'selected':''}>Tháng</option></select></div>
    <div class="form-group"><label>Số ngày/lượt</label><input type="number" id="tyDays" value="${t.days_per||1}"></div>
    <div class="form-group"><label>Uplift benchmark (%)</label><input type="number" id="tyUplift" value="${t.uplift_benchmark||0}"></div>
    <div class="form-group"><label>Màu</label><input type="color" id="tyColor" value="${t.color||'#1a3c6e'}"></div>
  </div>`;
}
async function saveNewType() {
  const t = { code:document.getElementById('tyCode').value, name:document.getElementById('tyName').value,
    target_type:document.getElementById('tyTargetType').value, days_per:document.getElementById('tyDays').value,
    uplift_benchmark:document.getElementById('tyUplift').value, color:document.getElementById('tyColor').value, active:'TRUE' };
  if (GAS_URL) await gasPost({ action:'save', table:'hdtm_types', data:t });
  ACTIVITY_TYPES.push(t);
  closeModal(); loadTypeMasterTable(); renderTypeCards();
}
async function saveEditType(code) {
  const t = ACTIVITY_TYPES.find(x=>x.code===code);
  t.name=document.getElementById('tyName').value; t.target_type=document.getElementById('tyTargetType').value;
  t.days_per=document.getElementById('tyDays').value; t.uplift_benchmark=document.getElementById('tyUplift').value;
  t.color=document.getElementById('tyColor').value;
  if (GAS_URL) await gasPost({ action:'update', table:'hdtm_types', id:code, idField:'code', data:t });
  closeModal(); loadTypeMasterTable(); renderTypeCards();
}

// ===== MASTER DATA: RULE =====
async function loadRuleMasterTable() {
  document.getElementById('ruleMasterBody').innerHTML = RULES.map((r,i) => `
    <tr><td>${ACTIVITY_TYPES.find(t=>t.code===r.type_code)?.name||r.type_code}</td><td>${r.rule_name}</td><td>${r.rule_value}</td><td>${r.description}</td>
    <td><button class="icon-btn" onclick="alert('Sửa trực tiếp trên bảng — double-click để chỉnh (demo)')">✏️</button></td></tr>
  `).join('');
}
function openRuleModal() {
  document.getElementById('modalTitle').textContent = 'Thêm Rule';
  document.getElementById('modalBody').innerHTML = `
    <div class="form-group" style="margin-bottom:12px"><label>Loại HĐTM</label><select id="ruleType">${ACTIVITY_TYPES.map(t=>`<option value="${t.code}">${t.name}</option>`).join('')}</select></div>
    <div class="form-group" style="margin-bottom:12px"><label>Tên rule</label><input type="text" id="ruleName" placeholder="VD: Số ngày/lượt"></div>
    <div class="form-group" style="margin-bottom:12px"><label>Giá trị</label><input type="text" id="ruleValue"></div>
    <div class="form-group"><label>Mô tả</label><input type="text" id="ruleDesc"></div>`;
  document.getElementById('modalFooter').innerHTML = `<button class="btn btn-secondary" onclick="closeModal()">Hủy</button><button class="btn btn-primary" onclick="saveNewRule()">💾 Lưu</button>`;
  showModal();
}
async function saveNewRule() {
  const r = { type_code:document.getElementById('ruleType').value, rule_name:document.getElementById('ruleName').value,
    rule_value:document.getElementById('ruleValue').value, description:document.getElementById('ruleDesc').value };
  if (GAS_URL) await gasPost({ action:'save', table:'hdtm_rules', data:r });
  RULES.push(r);
  closeModal(); loadRuleMasterTable();
}

// ===== AUDIT LOG =====
async function loadAudit() {
  const actId = document.getElementById('auditActId').value.trim();
  let history = [];
  if (GAS_URL) history = await listTable('hdtm_history');
  if (actId) history = history.filter(h => h.activity_id.includes(actId));
  history.sort((a,b)=>(b.changed_at||'').localeCompare(a.changed_at||''));
  document.getElementById('auditBody').innerHTML = history.slice(0,200).map(h => `
    <tr><td>${h.activity_id}</td><td>${h.action}</td><td>${h.changed_by}</td><td>${h.changed_at?new Date(h.changed_at).toLocaleString('vi-VN'):''}</td>
    <td>${h.old_value||'—'}</td><td>${h.new_value||'—'}</td><td>${h.reason||'—'}</td></tr>
  `).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--text3)">Chưa có log nào</td></tr>';
}

// populate type filters for tracking (after master data loaded)
const _origLoadMasterData = loadMasterData;
loadMasterData = async function() {
  await _origLoadMasterData();
  const trType = document.getElementById('trType');
  if (trType && trType.children.length <= 1) {
    ACTIVITY_TYPES.forEach(t => trType.insertAdjacentHTML('beforeend', `<option value="${t.code}">${t.name}</option>`));
  }
  const trStatus = document.getElementById('trStatus');
  if (trStatus && trStatus.children.length <= 1) {
    Object.keys(STATUS_LABELS).forEach(s => trStatus.insertAdjacentHTML('beforeend', `<option value="${s}">${STATUS_LABELS[s]}</option>`));
  }
};
