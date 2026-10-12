// ==============================================================================
// ប្រព័ន្ធគ្រប់គ្រងបូកស្រង់ពិន្ទុប្រឡងជ្រើសរើស ក.ច.ប (PEC21 - ខេត្តតាកែវ)
// High-Performance Smooth Application Logic (Online & Offline Ready)
// ==============================================================================

const state = {
  token: localStorage.getItem('kb_token') || null,
  user: JSON.parse(localStorage.getItem('kb_user') || 'null'),
  districts: [],
  communes: [],
  candidates: [],
  stats: null,
  activeTab: 'dashboard',
  filters: {
    district: 'all',
    communeCode: 'all',
    roleCode: 'all',
    status: 'all',
    search: ''
  },
  tabReport: {
    district: '',
    communeCode: ''
  },
    resultReport: {
    district: '',
    communeCode: ''
  },
  codes: [],
  codeFilters: {
    status: 'all',
    search: ''
  }
};

// ==============================================================================
// INITIALIZATION & EVENT LISTENERS
// ==============================================================================
document.addEventListener('DOMContentLoaded', async () => {
  setupNetworkListener();
  setupTabNavigation();
  setupFilterEvents();

  // Load custom logo immediately from localStorage
  const savedLogo = localStorage.getItem('pec21_custom_logo');
  if (savedLogo) applySystemLogo(savedLogo);

  // Initialize report footer dates, institution lines & page numbers from localStorage
  initReportDates();
  initInstLines();
  initLogoPosition();
  initPageNumber();

  const cTable = document.getElementById('codesTable');
  if (cTable) cTable.addEventListener('paste', handleCodesTablePaste);
  const cBody = document.getElementById('codesTableBody');
  if (cBody) cBody.addEventListener('paste', handleCodesTablePaste);

  const candTable = document.getElementById('candidatesTable');
  if (candTable) candTable.addEventListener('paste', handleCandidatesTablePaste);
  const candBody = document.getElementById('candidatesTableBody');
  if (candBody) candBody.addEventListener('paste', handleCandidatesTablePaste);


  if (state.token && state.user) {
    applyUserSession(state.user);
    await loadInitialData();
  } else {
    showLoginModal();
  }
});

// Network Status (Online / Offline / LAN)
function setupNetworkListener() {
  const updateStatus = () => {
    const isOnline = navigator.onLine;
    const badge = document.getElementById('connStatus');
    const text = document.getElementById('connStatusText');
    if (isOnline) {
      badge.className = 'badge badge-passed';
      badge.innerHTML = `<span style="display:inline-block; width:8px; height:8px; border-radius:50%; background-color:#10B981;"></span> Online / LAN`;
    } else {
      badge.className = 'badge badge-failed';
      badge.innerHTML = `<span style="display:inline-block; width:8px; height:8px; border-radius:50%; background-color:#EF4444;"></span> Offline (Local)`;
    }
  };

  window.addEventListener('online', updateStatus);
  window.addEventListener('offline', updateStatus);
  updateStatus();
}

// Tab Navigation
function setupTabNavigation() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const tab = item.getAttribute('data-tab');
      switchTab(tab);
    });
  });
}

function switchTab(tabId) {
  state.activeTab = tabId;

  // 1. Instant Tab Bar Highlight
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.getAttribute('data-tab') === tabId);
  });

  // 2. Instant Tab Pane Switching
  document.querySelectorAll('.tab-pane').forEach(el => {
    el.classList.toggle('active', el.id === `pane-${tabId}`);
  });

  // 3. Fast non-blocking UI rendering from memory
  window.requestAnimationFrame(() => {
    try {
      if (tabId === 'dashboard') {
        renderDashboard();
      } else if (tabId === 'codes') {
        renderCodesTable();
      } else if (tabId === 'entry') {
        renderCandidatesTable();
      } else if (tabId === 'tabulation') {
        document.body.classList.remove('print-portrait');
        document.body.classList.add('print-landscape');
        setPrintOrientation('landscape');
        renderTabulationSheet();
      } else if (tabId === 'results') {
        document.body.classList.remove('print-landscape');
        document.body.classList.add('print-portrait');
        setPrintOrientation('portrait');
        renderResultsSheet();
      } else if (tabId === 'roster') {
        renderRoster();
      } else if (tabId === 'users') {
        loadUsersList();
      }
    } catch (e) {
      console.error('Error switching tab content:', e);
    }
  });
}

// ==============================================================================
// GLOBAL DATA & DOM SANITIZER (លុបបំបាត់សារខូច Vercel/Render Pause/UUID គ្រប់ទីកន្លែង)
// ==============================================================================
function isCorruptedText(val) {
  if (!val || typeof val !== 'string') return false;
  const lower = val.toLowerCase();
  return lower.includes('pause') || 
         lower.includes('deploy') || 
         lower.includes('uuid') || 
         lower.includes('urn:') || 
         lower.includes('http') ||
         lower.includes('pts4d') ||
         lower.includes('9m455') ||
         lower.includes('vercel');
}

function sanitizeText(val) {
  if (!val || typeof val !== 'string') return '';
  if (isCorruptedText(val)) return '';
  return val.trim();
}

function sanitizeCandidate(c) {
  if (!c || typeof c !== 'object') return c;
  ['notes', 'name', 'status', 'dob', 'gender', 'roleCode', 'communeCode'].forEach(key => {
    if (typeof c[key] === 'string' && isCorruptedText(c[key])) {
      c[key] = (key === 'status') ? 'ធ្លាក់' : '';
    }
  });
  return c;
}

function purgeAllCorruptedDOMElements() {
  // 1. Sanitize all candidates in memory
  if (Array.isArray(state.candidates)) {
    state.candidates.forEach(sanitizeCandidate);
  }

  // 2. Clear all keys in localStorage that contain corrupted text
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k) {
        const val = localStorage.getItem(k);
        if (isCorruptedText(k) || isCorruptedText(val)) {
          localStorage.removeItem(k);
        }
      }
    }
  } catch(e) {}

  // 3. Scan and scrub all text nodes inside document
  const roots = [
    document.getElementById('tabulationPaper'),
    document.getElementById('resultsPaper'),
    document.getElementById('tabulationTableContainer'),
    document.getElementById('resultsTableContainer'),
    document.getElementById('toastContainer')
  ];
  roots.forEach(root => {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) {
      if (walker.currentNode && isCorruptedText(walker.currentNode.nodeValue)) {
        nodes.push(walker.currentNode);
      }
    }
    nodes.forEach(n => {
      n.nodeValue = '';
      if (n.parentElement && n.parentElement.tagName !== 'TD' && n.parentElement.tagName !== 'TH') {
        n.parentElement.remove();
      }
    });
  });

  // 4. Purge all toast elements
  const toastCont = document.getElementById('toastContainer');
  if (toastCont) toastCont.innerHTML = '';
  document.querySelectorAll('.toast').forEach(t => t.remove());
}

// ==============================================================================
// API CALL HELPER
// ==============================================================================
async function api(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  if (state.token) {
    headers['Authorization'] = `Bearer ${state.token}`;
  }

  try {
    const res = await fetch(endpoint, { ...options, headers });
    const data = await res.json();
    if (data && Array.isArray(data.candidates)) {
      data.candidates = data.candidates.map(sanitizeCandidate);
    }
    if (res.status === 401) {
      handleLogout();
      throw new Error(data.message || 'សូមចូលប្រព័ន្ធជាថ្មី!');
    }
    return data;
  } catch (err) {
    console.error(`API Error on ${endpoint}:`, err);
    throw err;
  }
}

// Toast Notifications
function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span>${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</span>
    <span>${message}</span>
  `;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ==============================================================================
// AUTHENTICATION
// ==============================================================================
function showLoginModal() {
  document.getElementById('loginModal').classList.add('active');
  document.getElementById('loginError').style.display = 'none';
}

function hideLoginModal() {
  document.getElementById('loginModal').classList.remove('active');
}

async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errDiv = document.getElementById('loginError');

  try {
    const res = await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });

    if (res.success) {
      // Check if trainer account requires initial activation
      if (res.needsActivation) {
        showToast(res.message, 'info');
        openActivateAccountModal(res.username, password);
        return;
      }

      state.token = res.token;
      state.user = res.user;
      localStorage.setItem('kb_token', res.token);
      localStorage.setItem('kb_user', JSON.stringify(res.user));

      hideLoginModal();
      applyUserSession(res.user);
      await loadInitialData();
      showToast(`សូមស្វាគមន៍លោកគ្រូ/អ្នកគ្រូ ${res.user.fullName}!`, 'success');
    } else {
      errDiv.textContent = res.message || 'គណនី ឬពាក្យសម្ងាត់មិនត្រឹមត្រូវ!';
      errDiv.style.display = 'block';
    }
  } catch (err) {
    errDiv.textContent = err.message || 'មិនអាចភ្ជាប់ទៅកាន់ Server!';
    errDiv.style.display = 'block';
  }
}

// ==============================================================================
// FORM ACTIVATE ACCOUNT (ដំណើរការគណនីគ្រូប្រចាំក្រុងស្រុក)
// ==============================================================================
function openActivateAccountModal(prefillUsername = '', prefillDefaultPassword = 'pec21') {
  hideLoginModal();
  const modal = document.getElementById('activateModal');
  if (modal) modal.classList.add('active');

  const errDiv = document.getElementById('activateError');
  if (errDiv) errDiv.style.display = 'none';

  const uInput = document.getElementById('activateUsername');
  if (uInput) {
    uInput.value = prefillUsername || '';
    if (prefillUsername) {
      uInput.readOnly = true;
      uInput.style.backgroundColor = '#F1F5F9';
    } else {
      uInput.readOnly = false;
      uInput.style.backgroundColor = '';
    }
  }

  const pDef = document.getElementById('activateDefaultPassword');
  if (pDef) {
    pDef.value = prefillDefaultPassword || 'pec21';
    pDef.readOnly = true;
    pDef.style.backgroundColor = '#F1F5F9';
  }

  const p1 = document.getElementById('newActivatePassword');
  if (p1) p1.value = '';
  const p2 = document.getElementById('confirmActivatePassword');
  if (p2) p2.value = '';

  const nameInput = document.getElementById('activateFullName');
  if (nameInput) {
    setTimeout(() => nameInput.focus(), 150);
  }
}

function closeActivateModal() {
  const modal = document.getElementById('activateModal');
  if (modal) modal.classList.remove('active');
}

async function handleActivateAccount(e) {
  e.preventDefault();
  const username = document.getElementById('activateUsername').value.trim();
  const defaultPassword = document.getElementById('activateDefaultPassword').value;
  const fullName = document.getElementById('activateFullName').value.trim();
  const phone = document.getElementById('activatePhone').value.trim();
  const email = document.getElementById('activateEmail').value.trim();
  const newPassword = document.getElementById('newActivatePassword').value;
  const confirmPassword = document.getElementById('confirmActivatePassword').value;
  const errDiv = document.getElementById('activateError');

  if (newPassword !== confirmPassword) {
    errDiv.textContent = 'លេខសម្ងាត់ថ្មីទាំងពីរមិនដូចគ្នាទេ!';
    errDiv.style.display = 'block';
    return;
  }

  if (newPassword === 'pec21') {
    errDiv.textContent = 'សូមកុំប្រើប្រាស់លេខសម្ងាត់ចាស់ (pec21) ឡើយ! សូមកំណត់លេខសម្ងាត់ថ្មីផ្ទាល់ខ្លួន។';
    errDiv.style.display = 'block';
    return;
  }

  try {
    const res = await api('/api/activate', {
      method: 'POST',
      body: JSON.stringify({
        username,
        defaultPassword,
        fullName,
        phone,
        email,
        newPassword
      })
    });

    if (res.success) {
      closeActivateModal();
      state.token = res.token;
      state.user = res.user;
      localStorage.setItem('kb_token', res.token);
      localStorage.setItem('kb_user', JSON.stringify(res.user));

      applyUserSession(state.user);
      await loadInitialData();
      showToast(`🎉 គណនី ${res.user.username} ត្រូវបាន Activate ដំណើរការដោយជោគជ័យ! សូមស្វាគមន៍ ${res.user.fullName}!`, 'success');
    } else {
      errDiv.textContent = res.message || 'បរាជ័យក្នុងការ Activate គណនី!';
      errDiv.style.display = 'block';
    }
  } catch (err) {
    errDiv.textContent = err.message || 'មានបញ្ហាក្នុងការភ្ជាប់!';
    errDiv.style.display = 'block';
  }
}

function handleLogout() {
  state.token = null;
  state.user = null;
  localStorage.removeItem('kb_token');
  localStorage.removeItem('kb_user');
  location.reload();
}

document.getElementById('btnLogout').addEventListener('click', handleLogout);

function applyUserSession(user) {
  document.getElementById('userFullName').textContent = user.fullName;
  document.getElementById('userRoleBadge').textContent = user.role === 'Trainer' ? `គ្រូស្រុក: ${user.district}` : user.role;

  const isTrainer = user.role === 'Trainer';
  const isAdmin = user.role === 'SuperAdmin' || user.role === 'Admin';

  // Navigation tab visibility based on role
  const usersTab = document.getElementById('tabNavUsers');
  if (usersTab) usersTab.style.display = isAdmin ? 'inline-flex' : 'none';

  const tabResults = document.querySelector('[data-tab="results"]');
  if (tabResults) tabResults.style.display = isTrainer ? 'none' : 'inline-flex';

  const tabRoster = document.querySelector('[data-tab="roster"]');
  if (tabRoster) tabRoster.style.display = isTrainer ? 'none' : 'inline-flex';

  const tabTabulation = document.querySelector('[data-tab="tabulation"]');
  if (tabTabulation) tabTabulation.style.display = isTrainer ? 'none' : 'inline-flex';

  const tabCodes = document.querySelector('[data-tab="codes"]');
  if (tabCodes) tabCodes.style.display = isTrainer ? 'none' : 'inline-flex';

  const tabSettings = document.querySelector('[data-tab="settings"]');
  if (tabSettings) tabSettings.style.display = isTrainer ? 'none' : 'inline-flex';

  // Excel sheet bottom tabs for results & tabulation
  const sheetTabTabulation = document.getElementById('sheetTabTabulation');
  if (sheetTabTabulation) sheetTabTabulation.style.display = isTrainer ? 'none' : 'inline-flex';

  const sheetTabResults = document.getElementById('sheetTabResults');
  if (sheetTabResults) sheetTabResults.style.display = isTrainer ? 'none' : 'inline-flex';

  const sheetTabCode = document.getElementById('sheetTabCode');
  if (sheetTabCode) sheetTabCode.style.display = isTrainer ? 'none' : 'inline-flex';

  // Status Filter buttons in candidate list (A-ជាប់, B-បម្រុង, ធ្លាក់)
  const statusFilterButtons = document.getElementById('statusFilterButtons');
  if (statusFilterButtons) statusFilterButtons.style.display = isTrainer ? 'none' : 'flex';

  // Trainer district lock
  const distSelect = document.getElementById('filterDistrict');
  if (isTrainer && user.district !== 'all') {
    state.filters.district = user.district;
    state.tabReport.district = user.district;
    state.resultReport.district = user.district;
    if (distSelect) {
      distSelect.value = user.district;
      distSelect.disabled = true;
    }
    // Automatically switch to entry tab for Trainer
    switchTab('entry');
  } else {
    if (distSelect) distSelect.disabled = false;
  }
}

// ==============================================================================
// DATA LOADING
// ==============================================================================
async function loadInitialData() {
  try {
    const [distRes, commRes, candRes, statsRes, codesRes, settRes] = await Promise.all([
      api('/api/districts'),
      api('/api/communes'),
      api('/api/candidates'),
      api('/api/stats'),
      api('/api/codes'),
      api('/api/settings').catch(() => ({ settings: {} }))
    ]);

    state.districts = distRes.districts || [];
    state.communes = commRes.communes || [];
    state.candidates = candRes.candidates || [];
    state.stats = statsRes;
    state.codes = codesRes.codes || [];

    if (settRes && settRes.settings && settRes.settings.logo) {
      localStorage.setItem('pec21_custom_logo', settRes.settings.logo);
      applySystemLogo(settRes.settings.logo);
    } else {
      const cached = localStorage.getItem('pec21_custom_logo');
      applySystemLogo(cached || '');
    }

    populateDropdowns();
    populateCodesDatalist();
    renderDashboard();
    setRoleTab('a');
    renderCommuneSlicer();
    updateRoleCounts();
  } catch (err) {
    showToast('បរាជ័យក្នុងការទាញយកទិន្នន័យ!', 'error');
  }
}

function populateCodesDatalist() {
  const dl = document.getElementById('codesDatalist');
  if (!dl) return;
  dl.innerHTML = '';
  // Suggest unassigned codes so user only picks codes that haven't been used yet
  state.codes.forEach(k => {
    const isAssigned = state.candidates.some(c => c.candidateCode && c.candidateCode.toUpperCase() === k.code.toUpperCase());
    if (!isAssigned) {
      dl.innerHTML += `<option value="${k.code}">ពិន្ទុ QCM: ${k.qcmScore} (នៅទំនេរ)</option>`;
    }
  });
}

function populateDropdowns() {
  const isTrainer = state.user && state.user.role === 'Trainer';
  const trainerDist = isTrainer ? state.user.district : null;

  // 1. Entry District Filter
  const fDist = document.getElementById('filterDistrict');
  fDist.innerHTML = isTrainer ? '' : '<option value="all">-- គ្រប់ស្រុក/ក្រុង --</option>';
  state.districts.forEach(d => {
    if (!isTrainer || d.name === trainerDist) {
      fDist.innerHTML += `<option value="${d.name}">${d.name}</option>`;
    }
  });
  if (isTrainer) fDist.value = trainerDist;

  // 2. Report District Filters
  const rDist = document.getElementById('tabReportDistrict');
  const resDist = document.getElementById('resultReportDistrict');
  const rostDist = document.getElementById('rosterDistrict');

  let distOpts = isTrainer ? '' : '<option value="all">-- គ្រប់ស្រុក/ក្រុង --</option>';
  state.districts.forEach(d => {
    if (!isTrainer || d.name === trainerDist) {
      distOpts += `<option value="${d.name}">${d.name}</option>`;
    }
  });

  rDist.innerHTML = distOpts;
  resDist.innerHTML = distOpts;
  rostDist.innerHTML = isTrainer ? '' : '<option value="all">-- គ្រប់ស្រុក/ក្រុង --</option>';
  state.districts.forEach(d => {
    if (!isTrainer || d.name === trainerDist) {
      rostDist.innerHTML += `<option value="${d.name}">${d.name}</option>`;
    }
  });

  // Default selection for reports
  const defaultDist = isTrainer ? trainerDist : (state.districts[0] ? state.districts[0].name : '');
  rDist.value = defaultDist;
  resDist.value = defaultDist;
  state.tabReport.district = defaultDist;
  state.resultReport.district = defaultDist;

  updateCommuneDropdowns();
}

function updateCommuneDropdowns() {
  const curDist = document.getElementById('filterDistrict').value;
  const fComm = document.getElementById('filterCommune');
  fComm.innerHTML = '<option value="all">-- គ្រប់ឃុំ/សង្កាត់ --</option>';

  const filtered = (curDist && curDist !== 'all') ? state.communes.filter(k => k.district === curDist) : state.communes;
  filtered.forEach(k => {
    fComm.innerHTML += `<option value="${k.code}">${k.fullName || k.name}</option>`;
  });

  // Tabulation report communes
  const rDistVal = document.getElementById('tabReportDistrict').value;
  const tabComm = document.getElementById('tabReportCommune');
  tabComm.innerHTML = '<option value="all">-- គ្រប់ឃុំក្នុងស្រុកនេះ --</option>';
  state.communes.filter(k => k.district === rDistVal).forEach(k => {
    tabComm.innerHTML += `<option value="${k.code}">${k.fullName || k.name}</option>`;
  });

  // Results report communes
  const resDistVal = document.getElementById('resultReportDistrict').value;
  const resComm = document.getElementById('resultReportCommune');
  resComm.innerHTML = '<option value="all">-- គ្រប់ឃុំក្នុងស្រុកនេះ --</option>';
  state.communes.filter(k => k.district === resDistVal).forEach(k => {
    resComm.innerHTML += `<option value="${k.code}">${k.fullName || k.name}</option>`;
  });
}

function setupFilterEvents() {
  document.getElementById('filterDistrict').addEventListener('change', e => {
    renderCommuneSlicer();
    state.filters.district = e.target.value;
    updateCommuneDropdowns();
    renderCandidatesTable();
  });

  document.getElementById('filterCommune').addEventListener('change', e => {
    state.filters.communeCode = e.target.value;
    renderCandidatesTable();
  });

  document.getElementById('filterRole').addEventListener('change', e => {
    setRoleTab(e.target.value);
  });

  document.getElementById('searchInput').addEventListener('input', e => {
    state.filters.search = e.target.value.toLowerCase().trim();
    renderCandidatesTable();
  });

  // Code search input in Codes Tab
  const cSearch = document.getElementById('codeSearchInput');
  if (cSearch) {
    cSearch.addEventListener('input', e => {
      state.codeFilters.search = e.target.value.toLowerCase().trim();
      renderCodesTable();
    });
  }

  // Reports
  document.getElementById('tabReportDistrict').addEventListener('change', e => {
    state.tabReport.district = e.target.value;
    updateCommuneDropdowns();
    renderTabulationSheet();
  });

  document.getElementById('tabReportCommune').addEventListener('change', e => {
    state.tabReport.communeCode = e.target.value;
    renderTabulationSheet();
  });

  document.getElementById('resultReportDistrict').addEventListener('change', e => {
    state.resultReport.district = e.target.value;
    updateCommuneDropdowns();
    renderResultsSheet();
  });

  document.getElementById('resultReportCommune').addEventListener('change', e => {
    state.resultReport.communeCode = e.target.value;
    renderResultsSheet();
  });

  document.getElementById('rosterDistrict').addEventListener('change', renderRoster);
  document.getElementById('rosterSearch').addEventListener('input', renderRoster);
}

// ==============================================================================
// 1. DASHBOARD VIEW
// ==============================================================================
async function renderDashboard() {
  try {
    const res = await api('/api/stats');
    if (!res.success) return;
    const s = res.stats;

    document.getElementById('kpiTotal').textContent = s.total;
    document.getElementById('kpiFemale').textContent = s.female;
    document.getElementById('kpiPassed').textContent = s.passed;
    document.getElementById('kpiPassedFemale').textContent = s.passedFemale;
    document.getElementById('kpiReserve').textContent = s.reserve;
    document.getElementById('kpiFailed').textContent = s.failed;
    document.getElementById('kpiAbsent').textContent = s.absent;

    // District breakdown table
    const tbody = document.getElementById('districtStatsBody');
    tbody.innerHTML = '';
    res.byDistrict.forEach((d, idx) => {
      const passRate = d.total > 0 ? Math.round((d.passed / d.total) * 100) : 0;
      tbody.innerHTML += `
        <tr>
          <td style="text-align:center;">${idx + 1}</td>
          <td style="font-weight:600; color:var(--primary);">${d.name}</td>
          <td style="text-align:center; font-weight:700;">${d.total}</td>
          <td style="text-align:center;">${d.female}</td>
          <td style="text-align:center;"><span class="badge badge-passed">${d.passed}</span></td>
          <td style="text-align:center;"><span class="badge badge-reserve">${d.reserve}</span></td>
          <td style="text-align:center;"><span class="badge badge-failed">${d.failed}</span></td>
          <td style="text-align:center;"><span class="badge badge-absent">${d.absent}</span></td>
          <td style="text-align:center;">
            <div style="display:flex; align-items:center; gap:8px; justify-content:center;">
              <span style="font-weight:600; font-size:0.8rem;">${passRate}%</span>
              <div style="width:60px; height:6px; background:#E2E8F0; border-radius:3px; overflow:hidden;">
                <div style="width:${passRate}%; height:100%; background:#10B981;"></div>
              </div>
            </div>
          </td>
          <td style="text-align:center;">
            <button class="btn btn-secondary btn-sm" onclick="viewDistrictCandidates('${d.name}')">មើល</button>
          </td>
        </tr>
      `;
    });
  } catch (err) {
    console.error('Error rendering dashboard:', err);
  }
}

function viewDistrictCandidates(districtName) {
  state.filters.district = districtName;
  document.getElementById('filterDistrict').value = districtName;
  updateCommuneDropdowns();
  switchTab('entry');
}

// ==============================================================================
// 2. SCORE ENTRY & CANDIDATE LIST (EXCEL WORKBOOK STYLE)
// ==============================================================================
function setRoleTab(roleCode) {
  state.filters.roleCode = roleCode;
  const fRole = document.getElementById('filterRole');
  if (fRole) fRole.value = roleCode;

  // 1. Update Excel Sheet Tabs Bar
  document.querySelectorAll('.excel-sheet-tab').forEach(t => t.classList.remove('active'));
  if (roleCode === 'a') {
    const t = document.getElementById('sheetTabRoleA'); if (t) t.classList.add('active');
  } else if (roleCode === 'd') {
    const t = document.getElementById('sheetTabRoleD'); if (t) t.classList.add('active');
  } else if (roleCode === 'b') {
    const t = document.getElementById('sheetTabRoleB'); if (t) t.classList.add('active');
  } else if (roleCode === 'c') {
    const t = document.getElementById('sheetTabRoleC'); if (t) t.classList.add('active');
  } else {
    const t = document.getElementById('sheetTabRoleAll'); if (t) t.classList.add('active');
  }

  // 2. Update Legacy Role Buttons if present
  ['All', 'A', 'D', 'B', 'C'].forEach(k => {
    const btn = document.getElementById('btnRole' + k);
    if (btn) btn.classList.remove('active', 'btn-primary');
  });

  let activeId = 'btnRoleAll';
  let title = 'សន្លឹកកិច្ចការ៖ គ្រប់មុខតំណែង (ទូទៅ)';
  const isTrainer = state.user && state.user.role === 'Trainer';

  if (roleCode === 'a') {
    activeId = 'btnRoleA';
    title = isTrainer ? 'សន្លឹកកិច្ចការ៖ ប្រធាន ក.ច.ប (ស.បត្រ + ប.ពិ)' : 'សន្លឹកកិច្ចការ៖ ប្រធាន ក.ច.ប (QCM + ស.បត្រ + ប.ពិ)';
  } else if (roleCode === 'd') {
    activeId = 'btnRoleD';
    title = 'សន្លឹកកិច្ចការ៖ អនុប្រធាន ក.ច.ប (ស្មៀនឃុំ/សង្កាត់)';
  } else if (roleCode === 'b') {
    activeId = 'btnRoleB';
    title = isTrainer ? 'សន្លឹកកិច្ចការ៖ ជំនួយការអនុប្រធាន ក.ច.ប (ស.បត្រ + ប.ពិ)' : 'សន្លឹកកិច្ចការ៖ ជំនួយការអនុប្រធាន ក.ច.ប';
  } else if (roleCode === 'c') {
    activeId = 'btnRoleC';
    title = isTrainer ? 'សន្លឹកកិច្ចការ៖ ការីកុំព្យូទ័រ (ប.ពិ)' : 'សន្លឹកកិច្ចការ៖ ការីកុំព្យូទ័រ (QCM-PC + ប.ពិ)';
  }

  const actBtn = document.getElementById(activeId);
  if (actBtn) actBtn.classList.add('active');

  const titleEl = document.getElementById('roleSectionTitle');
  if (titleEl) titleEl.textContent = title;

  updateTableHeaderForRole(roleCode);
  renderCandidatesTable();
}

function updateTableHeaderForRole(roleCode) {
  const thead = document.getElementById('candidatesTableHeader');
  if (!thead) return;

  const isTrainer = state.user && state.user.role === 'Trainer';

  if (isTrainer) {
    // -----------------------------------------------------------------
    // គណនីគ្រូស្រុក៖ មិនបង្ហាញកូដ, មិនបង្ហាញ QCM/PC, មិនបង្ហាញលទ្ធផល
    // ជួរឈរ (សរុប) គឺបូកតែ ស.បត្រ + ប.ពិ ប៉ុណ្ណោះ
    // -----------------------------------------------------------------
    if (roleCode === 'a' || roleCode === 'b') {
      thead.innerHTML = `
        <tr>
          <th style="width:40px;">ល.រ</th>
          <th style="min-width:180px; width:180px;">ឈ្មោះ</th>
          <th style="text-align:center; width:45px;">ភេទ</th>
          <th style="width:110px;">ថ្ងៃខែឆ្នាំកំណើត</th>
          <th style="text-align:center; width:75px;">ស.បត្រ</th>
          <th style="text-align:center; width:75px;">ប.ពិ</th>
          <th style="text-align:center; width:80px; font-weight:700;">សរុប</th>
          <th style="width:70px;">កូដឃុំ</th>
          <th>ឈ្មោះឃុំ/សង្កាត់</th>
          <th>ស្រុក</th>
          <th style="text-align:center; width:85px;">សកម្មភាព</th>
        </tr>
      `;
    } else if (roleCode === 'c') {
      thead.innerHTML = `
        <tr>
          <th style="width:40px;">ល.រ</th>
          <th style="min-width:180px; width:180px;">ឈ្មោះ</th>
          <th style="text-align:center; width:45px;">ភេទ</th>
          <th style="width:110px;">ថ្ងៃខែឆ្នាំកំណើត</th>
          <th style="text-align:center; width:75px;">ប.ពិ</th>
          <th style="text-align:center; width:80px; font-weight:700;">សរុប</th>
          <th style="width:70px;">កូដឃុំ</th>
          <th>ឈ្មោះឃុំ/សង្កាត់</th>
          <th>ស្រុក</th>
          <th style="text-align:center; width:85px;">សកម្មភាព</th>
        </tr>
      `;
    } else if (roleCode === 'd') {
      thead.innerHTML = `
        <tr>
          <th style="width:40px;">ល.រ</th>
          <th style="min-width:180px; width:180px;">ឈ្មោះ</th>
          <th style="min-width:180px; width:180px;">គោត្តនាម និងនាម</th>
          <th style="text-align:center; width:45px;">ភេទ</th>
          <th style="width:110px;">ថ្ងៃខែឆ្នាំកំណើត</th>
          <th style="width:120px;">មុខតំណែង</th>
          <th style="width:70px;">កូដឃុំ</th>
          <th>ឈ្មោះឃុំ/សង្កាត់</th>
          <th>ស្រុក</th>
          <th style="text-align:center; width:85px;">សកម្មភាព</th>
        </tr>
      `;
    } else {
      thead.innerHTML = `
        <tr>
          <th style="width:40px;">ល.រ</th>
          <th style="min-width:180px; width:180px;">ឈ្មោះ</th>
          <th style="text-align:center; width:45px;">ភេទ</th>
          <th style="width:110px;">ថ្ងៃខែឆ្នាំកំណើត</th>
          <th style="text-align:center; width:75px;">ស.បត្រ</th>
          <th style="text-align:center; width:75px;">ប.ពិ</th>
          <th style="text-align:center; width:80px; font-weight:700;">សរុប</th>
          <th style="width:70px;">កូដឃុំ</th>
          <th>ឈ្មោះឃុំ/សង្កាត់</th>
          <th>ស្រុក</th>
          <th style="text-align:center; width:85px;">សកម្មភាព</th>
        </tr>
      `;
    }
  } else {
    // -----------------------------------------------------------------
    // គណនី Admin / PEC21៖ បង្ហាញគ្រប់ ១៥ ជួរឈរ (កូដ, QCM, PC, លទ្ធផល...)
    // -----------------------------------------------------------------
    if (roleCode === 'a' || roleCode === 'b') {
      thead.innerHTML = `
        <tr>
          <th style="width:40px;">ល.រ</th>
          <th style="width:100px;">កូដ</th>
          <th style="min-width:180px; width:180px;">ឈ្មោះ</th>
          <th style="text-align:center; width:45px;">ភេទ</th>
          <th style="width:110px;">ថ្ងៃខែឆ្នាំកំណើត</th>
          <th style="text-align:center; width:65px;">ស.បត្រ</th>
          <th style="text-align:center; width:65px;">ប.ពិ</th>
          <th style="text-align:center; width:90px;">ពិន្ទុ QCM</th>
          <th style="text-align:center; width:90px;" class="col-shaded-excel">QCM-PC</th>
          <th style="text-align:center; width:80px; font-weight:700;">សរុប</th>
          <th style="width:70px;">កូដឃុំ</th>
          <th>ឈ្មោះឃុំ/សង្កាត់</th>
          <th>ស្រុក</th>
          <th style="text-align:center; width:85px;">លទ្ធផល</th>
          <th style="text-align:center; width:90px;">សកម្មភាព</th>
        </tr>
      `;
    } else if (roleCode === 'c') {
      thead.innerHTML = `
        <tr>
          <th style="width:40px;">ល.រ</th>
          <th style="width:100px;">កូដ</th>
          <th style="min-width:180px; width:180px;">ឈ្មោះ</th>
          <th style="text-align:center; width:45px;">ភេទ</th>
          <th style="width:110px;">ថ្ងៃខែឆ្នាំកំណើត</th>
          <th style="text-align:center; width:65px;" class="col-shaded-excel">ស.បត្រ</th>
          <th style="text-align:center; width:65px;">ប.ពិ</th>
          <th style="text-align:center; width:90px;" class="col-shaded-excel">ពិន្ទុ QCM</th>
          <th style="text-align:center; width:90px;">QCM-PC</th>
          <th style="text-align:center; width:80px; font-weight:700;">សរុប</th>
          <th style="width:70px;">កូដឃុំ</th>
          <th>ឈ្មោះឃុំ/សង្កាត់</th>
          <th>ស្រុក</th>
          <th style="text-align:center; width:85px;">លទ្ធផល</th>
          <th style="text-align:center; width:90px;">សកម្មភាព</th>
        </tr>
      `;
    } else if (roleCode === 'd') {
      thead.innerHTML = `
        <tr>
          <th style="width:40px;">ល.រ</th>
          <th style="min-width:180px; width:180px;">ឈ្មោះ</th>
          <th style="min-width:180px; width:180px;">គោត្តនាម និងនាម</th>
          <th style="text-align:center; width:45px;">ភេទ</th>
          <th style="width:110px;">ថ្ងៃខែឆ្នាំកំណើត</th>
          <th style="width:120px;">មុខតំណែង</th>
          <th style="width:70px;">កូដឃុំ</th>
          <th>ឈ្មោះឃុំ/សង្កាត់</th>
          <th>ស្រុក</th>
          <th style="text-align:center; width:85px;">លទ្ធផល</th>
          <th style="text-align:center; width:90px;">សកម្មភាព</th>
        </tr>
      `;
    } else {
      thead.innerHTML = `
        <tr>
          <th style="width:40px;">ល.រ</th>
          <th style="width:100px;">កូដ</th>
          <th style="min-width:180px; width:180px;">ឈ្មោះ</th>
          <th style="text-align:center; width:45px;">ភេទ</th>
          <th style="width:110px;">ថ្ងៃខែឆ្នាំកំណើត</th>
          <th style="text-align:center; width:65px;">ស.បត្រ</th>
          <th style="text-align:center; width:65px;">ប.ពិ</th>
          <th style="text-align:center; width:90px;">ពិន្ទុ QCM</th>
          <th style="text-align:center; width:90px;">QCM-PC</th>
          <th style="text-align:center; width:80px; font-weight:700;">សរុប</th>
          <th style="width:70px;">កូដឃុំ</th>
          <th>ឈ្មោះឃុំ/សង្កាត់</th>
          <th>ស្រុក</th>
          <th style="text-align:center; width:85px;">លទ្ធផល</th>
          <th style="text-align:center; width:90px;">សកម្មភាព</th>
        </tr>
      `;
    }
  }
}

function filterByStatus(st) {
  state.filters.status = st;
  renderCandidatesTable();
}

// Excel Commune Slicer Functions
function renderCommuneSlicer() {
  const container = document.getElementById('communeSlicerGrid');
  if (!container) return;

  let communes = state.communes || [];
  if (state.filters.district && state.filters.district !== 'all') {
    communes = communes.filter(c => c.district === state.filters.district);
  }

  // Sort by numeric code
  communes = communes.slice().sort((a, b) => {
    return parseInt(a.code, 10) - parseInt(b.code, 10);
  });

  const curComm = state.filters.communeCode;
  const html = communes.map(c => {
    const isActive = curComm === c.code;
    return `<button type="button" class="excel-slicer-btn ${isActive ? 'active' : ''}" title="${c.name} (${c.code})" onclick="filterBySlicerCommune('${c.code}')">${c.code}</button>`;
  }).join('');

  container.innerHTML = html;

  const clearBtn = document.getElementById('slicerClearBtn');
  if (clearBtn) {
    clearBtn.style.color = (curComm && curComm !== 'all') ? '#C00000' : '#64748B';
    clearBtn.style.fontWeight = (curComm && curComm !== 'all') ? '800' : '600';
  }
}

function filterBySlicerCommune(code) {
  if (state.filters.communeCode === code) {
    state.filters.communeCode = 'all';
  } else {
    state.filters.communeCode = code;
  }
  const commSelect = document.getElementById('filterCommune');
  if (commSelect) commSelect.value = state.filters.communeCode;

  renderCandidatesTable();
  renderCommuneSlicer();
}

function clearCommuneSlicer() {
  state.filters.communeCode = 'all';
  const commSelect = document.getElementById('filterCommune');
  if (commSelect) commSelect.value = 'all';

  renderCandidatesTable();
  renderCommuneSlicer();
}

function updateRoleCounts() {
  const counts = { a: 0, d: 0, b: 0, c: 0 };
  state.candidates.forEach(c => {
    if (counts[c.roleCode] !== undefined) counts[c.roleCode]++;
  });

  const bA = document.getElementById('badgeCountRoleA'); if (bA) bA.textContent = counts.a;
  const bD = document.getElementById('badgeCountRoleD'); if (bD) bD.textContent = counts.d;
  const bB = document.getElementById('badgeCountRoleB'); if (bB) bB.textContent = counts.b;
  const bC = document.getElementById('badgeCountRoleC'); if (bC) bC.textContent = counts.c;
}

function getFilteredCandidatesList() {
  let list = state.candidates;

  // Filter District
  if (state.filters.district && state.filters.district !== 'all') {
    list = list.filter(c => c.district === state.filters.district);
  }
  // Filter Commune
  if (state.filters.communeCode && state.filters.communeCode !== 'all') {
    list = list.filter(c => c.communeCode === state.filters.communeCode);
  }
  // Filter Role
  if (state.filters.roleCode && state.filters.roleCode !== 'all') {
    list = list.filter(c => c.roleCode === state.filters.roleCode);
  }
  // Filter Status
  if (state.filters.status && state.filters.status !== 'all') {
    list = list.filter(c => c.status === state.filters.status);
  }
  // Search
  if (state.filters.search) {
    const q = state.filters.search.toLowerCase();
    list = list.filter(c =>
      (c.name && c.name.toLowerCase().includes(q)) ||
      (c.candidateCode && c.candidateCode.toLowerCase().includes(q)) ||
      (c.communeName && c.communeName.toLowerCase().includes(q))
    );
  }
  return list;
}

function handleCandidateCellKeydown(e, rowIndex, colName) {
  // Prevent negative sign or scientific notation on score/numeric fields
  if (['scoreDegree', 'scoreExp', 'scoreQcm', 'scorePc'].includes(colName)) {
    if (e.key === '-' || e.key === 'Subtract' || e.key === 'e' || e.key === 'E') {
      e.preventDefault();
      return;
    }
  }

  if (e.key === 'Enter' || e.key === 'ArrowDown') {
    e.preventDefault();
    const nextEl = document.querySelector(`#candidatesTableBody [data-col="${colName}"][data-index="${rowIndex + 1}"]`);
    if (nextEl) {
      nextEl.focus();
      if (nextEl.select) nextEl.select();
    }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    const prevEl = document.querySelector(`#candidatesTableBody [data-col="${colName}"][data-index="${rowIndex - 1}"]`);
    if (prevEl) {
      prevEl.focus();
      if (prevEl.select) prevEl.select();
    }
  }
}

function renderCandidatesTable() {
  const tbody = document.getElementById('candidatesTableBody');
  if (!tbody) return;

  const list = getFilteredCandidatesList();

  const countEl = document.getElementById('filteredCountBadge');
  if (countEl) countEl.textContent = `សរុប: ${list.length} នាក់`;

  const isTrainer = state.user && state.user.role === 'Trainer';
  if (list.length === 0) {
    const colspan = isTrainer ? 11 : 15;
    tbody.innerHTML = `<tr><td colspan="${colspan}" style="text-align:center; padding:35px; color:var(--gray-400); font-weight:600;">មិនមានទិន្នន័យបេក្ខជនតាមលក្ខខណ្ឌជ្រើសរើសឡើយ</td></tr>`;
    return;
  }

  const currentRole = state.filters.roleCode;
  const rows = [];

  list.forEach((c, idx) => {
    const isClerk = c.roleCode === 'd';
    const isPc = c.roleCode === 'c';
    const canEdit = !isTrainer || c.district === state.user.district;

    const deg = Number(c.scoreDegree) || 0;
    const exp = Number(c.scoreExp) || 0;
    const trainerTotal = deg + exp;

    // Flag red DOB cell if 1998/1999 (exact Excel highlight pattern from screenshot)
    const isFlaggedDob = c.dob && (c.dob.includes('1998') || c.dob.includes('1999'));

    // Action buttons: Trainer can only Edit, cannot Delete!
    const actionButtons = canEdit ? (
      isTrainer ? `
        <div style="display:flex; justify-content:center; gap:5px;">
          <button class="btn btn-secondary btn-sm" title="កែប្រែ" onclick="openEditCandidateModal('${c.id}')" style="padding:3px 7px;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          </button>
        </div>
      ` : `
        <div style="display:flex; justify-content:center; gap:5px;">
          <button class="btn btn-secondary btn-sm" title="កែប្រែ" onclick="openEditCandidateModal('${c.id}')" style="padding:3px 7px;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          </button>
          <button class="btn btn-secondary btn-sm" title="ផ្ទេរជំនួស / រក្សាទុក" style="color:var(--primary); padding:3px 7px;" onclick="openSubstituteModal('${c.id}')">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
          </button>
          <button class="btn btn-secondary btn-sm" title="លុប" style="color:var(--danger); padding:3px 7px;" onclick="deleteCandidate('${c.id}')">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      `
    ) : '-';

    // Cell inputs for in-place Excel-like editing
    const nameCell = canEdit
      ? `<input type="text" class="excel-cell-input name-input" data-col="name" data-index="${idx}" data-id="${c.id}" value="${c.name || ''}" onchange="updateCandidateField('${c.id}', 'name', this.value)" onkeydown="handleCandidateCellKeydown(event, ${idx}, 'name')">`
      : `<span style="padding:4px 8px; font-weight:600; white-space:nowrap;">${c.name || ''}</span>`;

    const genderCell = canEdit
      ? `<select class="excel-cell-select gender-select" data-col="gender" data-index="${idx}" data-id="${c.id}" onchange="updateCandidateField('${c.id}', 'gender', this.value)" onkeydown="handleCandidateCellKeydown(event, ${idx}, 'gender')">
          <option value="ប" ${c.gender === 'ប' ? 'selected' : ''}>ប</option>
          <option value="ស" ${c.gender === 'ស' ? 'selected' : ''}>ស</option>
         </select>`
      : `<span style="font-weight:600;">${c.gender || ''}</span>`;

    const dobCell = canEdit
      ? `<input type="text" class="excel-cell-input dob-input ${isFlaggedDob ? 'cell-flagged-red' : ''}" data-col="dob" data-index="${idx}" data-id="${c.id}" value="${c.dob || ''}" onchange="updateCandidateField('${c.id}', 'dob', this.value)" onkeydown="handleCandidateCellKeydown(event, ${idx}, 'dob')" style="text-align:center; font-family:monospace;">`
      : `<span style="font-family:monospace;" class="${isFlaggedDob ? 'cell-flagged-red' : ''}">${c.dob || '-'}</span>`;

    const degCell = canEdit
      ? `<input type="number" class="excel-cell-input score-input" min="0" max="5" oninput="if(this.value < 0) this.value = 0; if(this.value > 5) this.value = 5;" data-col="scoreDegree" data-index="${idx}" data-id="${c.id}" value="${c.scoreDegree}" onchange="updateCandidateField('${c.id}', 'scoreDegree', this.value)" onkeydown="handleCandidateCellKeydown(event, ${idx}, 'scoreDegree')" style="text-align:center;">`
      : `<span>${c.scoreDegree}</span>`;

    const expCell = canEdit
      ? `<input type="number" class="excel-cell-input score-input" min="0" max="15" oninput="if(this.value < 0) this.value = 0; if(this.value > 15) this.value = 15;" data-col="scoreExp" data-index="${idx}" data-id="${c.id}" value="${c.scoreExp}" onchange="updateCandidateField('${c.id}', 'scoreExp', this.value)" onkeydown="handleCandidateCellKeydown(event, ${idx}, 'scoreExp')" style="text-align:center;">`
      : `<span>${c.scoreExp}</span>`;

    if (isTrainer) {
      // Trainer: No code, no QCM/PC, no final result
      if (currentRole === 'a' || currentRole === 'b') {
        rows.push(`
          <tr id="row-${c.id}">
            <td style="text-align:center; font-weight:600; color:var(--gray-500);">${idx + 1}</td>
            <td style="min-width:180px; width:180px;">${nameCell}</td>
            <td style="text-align:center;">${genderCell}</td>
            <td style="text-align:center;">${dobCell}</td>
            <td style="text-align:center;">${degCell}</td>
            <td style="text-align:center;">${expCell}</td>
            <td style="text-align:center; font-weight:700; font-size:1.05rem; color:var(--primary);">
              <span id="total-${c.id}">${trainerTotal}</span>
            </td>
            <td style="text-align:center; font-family:monospace; font-weight:600; color:var(--gray-600);">${c.communeCode || '-'}</td>
            <td style="white-space:nowrap; padding:4px 8px;">${c.communeName || '-'}</td>
            <td style="white-space:nowrap; color:var(--gray-700); padding:4px 8px;">${c.district || '-'}</td>
            <td style="text-align:center;">${actionButtons}</td>
          </tr>
        `);
      } else if (currentRole === 'c') {
        rows.push(`
          <tr id="row-${c.id}">
            <td style="text-align:center; font-weight:600; color:var(--gray-500);">${idx + 1}</td>
            <td style="min-width:180px; width:180px;">${nameCell}</td>
            <td style="text-align:center;">${genderCell}</td>
            <td style="text-align:center;">${dobCell}</td>
            <td style="text-align:center;">${expCell}</td>
            <td style="text-align:center; font-weight:700; font-size:1.05rem; color:var(--primary);">
              <span id="total-${c.id}">${exp}</span>
            </td>
            <td style="text-align:center; font-family:monospace; font-weight:600; color:var(--gray-600);">${c.communeCode || '-'}</td>
            <td style="white-space:nowrap; padding:4px 8px;">${c.communeName || '-'}</td>
            <td style="white-space:nowrap; color:var(--gray-700); padding:4px 8px;">${c.district || '-'}</td>
            <td style="text-align:center;">${actionButtons}</td>
          </tr>
        `);
      } else if (currentRole === 'd') {
        rows.push(`
          <tr id="row-${c.id}">
            <td style="text-align:center; font-weight:600; color:var(--gray-500);">${idx + 1}</td>
            <td style="min-width:180px; width:180px;">${nameCell}</td>
            <td style="white-space:nowrap; color:var(--gray-700); padding:4px 8px;">${c.name} (ស្មៀនឃុំ)</td>
            <td style="text-align:center;">${genderCell}</td>
            <td style="text-align:center;">${dobCell}</td>
            <td style="white-space:nowrap; color:var(--primary); font-weight:600; padding:4px 8px;">${c.role}</td>
            <td style="text-align:center; font-family:monospace; font-weight:600; color:var(--gray-600);">${c.communeCode || '-'}</td>
            <td style="white-space:nowrap; padding:4px 8px;">${c.communeName || '-'}</td>
            <td style="white-space:nowrap; color:var(--gray-700); padding:4px 8px;">${c.district || '-'}</td>
            <td style="text-align:center;">${actionButtons}</td>
          </tr>
        `);
      } else {
        rows.push(`
          <tr id="row-${c.id}">
            <td style="text-align:center; font-weight:600; color:var(--gray-500);">${idx + 1}</td>
            <td style="min-width:180px; width:180px;">${nameCell}</td>
            <td style="text-align:center;">${genderCell}</td>
            <td style="text-align:center;">${dobCell}</td>
            <td style="text-align:center;">
              ${(c.roleCode === 'd' || c.roleCode === 'c') ? '-' : degCell}
            </td>
            <td style="text-align:center;">
              ${c.roleCode === 'd' ? '-' : expCell}
            </td>
            <td style="text-align:center; font-weight:700; font-size:1.05rem; color:var(--primary);">
              <span id="total-${c.id}">${c.roleCode === 'd' ? '-' : (c.roleCode === 'c' ? exp : trainerTotal)}</span>
            </td>
            <td style="text-align:center; font-family:monospace; font-weight:600; color:var(--gray-600);">${c.communeCode || '-'}</td>
            <td style="white-space:nowrap; padding:4px 8px;">${c.communeName || '-'}</td>
            <td style="white-space:nowrap; color:var(--gray-700); padding:4px 8px;">${c.district || '-'}</td>
            <td style="text-align:center;">${actionButtons}</td>
          </tr>
        `);
      }
    } else {
      // Admin / SuperAdmin / PEC21
      let badgeClass = 'badge-passed';
      if (c.status === 'B-បម្រុង' || c.status === 'C-បម្រុងបន្ទាប់') badgeClass = 'badge-reserve';
      if (c.status === 'ធ្លាក់') badgeClass = 'badge-failed';
      if (c.status === 'អវត្តមាន') badgeClass = 'badge-absent';

      const resultCell = `
        <td style="text-align:center;">
          <span id="status-${c.id}" class="badge ${badgeClass}">${c.status}</span>
          ${c.isSubstituted ? `<div style="font-size:0.7rem; color:var(--primary); font-weight:700; margin-top:2px;">(ជំនួស)</div>` : ''}
        </td>
      `;

      const codeCell = `
        <input type="text" class="excel-cell-input score-input" list="codesDatalist" data-col="candidateCode" data-index="${idx}" data-id="${c.id}" style="width:85px; text-transform:uppercase; font-family:monospace; font-weight:700; text-align:center;" value="${c.candidateCode || ''}" placeholder="កូដ..." onchange="updateCandidateField('${c.id}', 'candidateCode', this.value)" onkeydown="handleCandidateCellKeydown(event, ${idx}, 'candidateCode')">
      `;

      const qcmCell = `
        <input type="text" id="qcm-input-${c.id}" class="excel-cell-input score-input" data-col="scoreQcm" data-index="${idx}" data-id="${c.id}" style="width:70px; text-align:center; font-weight:600;" value="${c.scoreQcm}" oninput="if(this.value !== 'អវត្តមាន' && Number(this.value) < 0) this.value = 0;" onchange="updateCandidateField('${c.id}', 'scoreQcm', this.value)" onkeydown="handleCandidateCellKeydown(event, ${idx}, 'scoreQcm')">
      `;

      const pcCell = `
        <input type="text" class="excel-cell-input score-input" data-col="scorePc" data-index="${idx}" data-id="${c.id}" style="width:70px; text-align:center; font-weight:600;" value="${c.scorePc}" oninput="if(this.value !== 'អវត្តមាន' && Number(this.value) < 0) this.value = 0;" onchange="updateCandidateField('${c.id}', 'scorePc', this.value)" onkeydown="handleCandidateCellKeydown(event, ${idx}, 'scorePc')">
      `;

      if (currentRole === 'a' || currentRole === 'b') {
        rows.push(`
          <tr id="row-${c.id}">
            <td style="text-align:center; font-weight:600; color:var(--gray-500);">${idx + 1}</td>
            <td style="text-align:center;">${codeCell}</td>
            <td style="min-width:180px; width:180px;">${nameCell}</td>
            <td style="text-align:center;">${genderCell}</td>
            <td style="text-align:center;">${dobCell}</td>
            <td style="text-align:center;">${degCell}</td>
            <td style="text-align:center;">${expCell}</td>
            <td style="text-align:center;">${qcmCell}</td>
            <td class="col-shaded-excel"></td>
            <td style="text-align:center; font-weight:700; font-size:1.05rem; color:var(--primary);">
              <span id="total-${c.id}">${c.scoreTotal}</span>
            </td>
            <td style="text-align:center; font-family:monospace; font-weight:600; color:var(--gray-600);">${c.communeCode || '-'}</td>
            <td style="white-space:nowrap; padding:4px 8px;">${c.communeName || '-'}</td>
            <td style="white-space:nowrap; color:var(--gray-700); padding:4px 8px;">${c.district || '-'}</td>
            ${resultCell}
            <td style="text-align:center;">${actionButtons}</td>
          </tr>
        `);
      } else if (currentRole === 'd') {
        rows.push(`
          <tr id="row-${c.id}">
            <td style="text-align:center; font-weight:600; color:var(--gray-500);">${idx + 1}</td>
            <td style="min-width:180px; width:180px;">${nameCell}</td>
            <td style="white-space:nowrap; color:var(--gray-700); padding:4px 8px;">${c.name} (ស្មៀនឃុំ)</td>
            <td style="text-align:center;">${genderCell}</td>
            <td style="text-align:center;">${dobCell}</td>
            <td style="white-space:nowrap; color:var(--primary); font-weight:600; padding:4px 8px;">${c.role}</td>
            <td style="text-align:center; font-family:monospace; font-weight:600; color:var(--gray-600);">${c.communeCode || '-'}</td>
            <td style="white-space:nowrap; padding:4px 8px;">${c.communeName || '-'}</td>
            <td style="white-space:nowrap; color:var(--gray-700); padding:4px 8px;">${c.district || '-'}</td>
            ${resultCell}
            <td style="text-align:center;">${actionButtons}</td>
          </tr>
        `);
      } else if (currentRole === 'c') {
        rows.push(`
          <tr id="row-${c.id}">
            <td style="text-align:center; font-weight:600; color:var(--gray-500);">${idx + 1}</td>
            <td style="text-align:center;">${codeCell}</td>
            <td style="min-width:180px; width:180px;">${nameCell}</td>
            <td style="text-align:center;">${genderCell}</td>
            <td style="text-align:center;">${dobCell}</td>
            <td class="col-shaded-excel"></td>
            <td style="text-align:center;">${expCell}</td>
            <td class="col-shaded-excel"></td>
            <td style="text-align:center;">${pcCell}</td>
            <td style="text-align:center; font-weight:700; font-size:1.05rem; color:var(--primary);">
              <span id="total-${c.id}">${c.scoreTotal}</span>
            </td>
            <td style="text-align:center; font-family:monospace; font-weight:600; color:var(--gray-600);">${c.communeCode || '-'}</td>
            <td style="white-space:nowrap; padding:4px 8px;">${c.communeName || '-'}</td>
            <td style="white-space:nowrap; color:var(--gray-700); padding:4px 8px;">${c.district || '-'}</td>
            ${resultCell}
            <td style="text-align:center;">${actionButtons}</td>
          </tr>
        `);
      } else {
        rows.push(`
          <tr id="row-${c.id}">
            <td style="text-align:center; font-weight:600; color:var(--gray-500);">${idx + 1}</td>
            <td style="text-align:center;">${codeCell}</td>
            <td style="min-width:180px; width:180px;">${nameCell}</td>
            <td style="text-align:center;">${genderCell}</td>
            <td style="text-align:center;">${dobCell}</td>
            ${(isClerk || isPc) ? '<td class="col-shaded-excel"></td>' : `
              <td style="text-align:center;">${degCell}</td>
            `}
            ${isClerk ? '<td class="col-shaded-excel"></td>' : `
              <td style="text-align:center;">${expCell}</td>
            `}
            ${(isClerk || isPc) ? '<td class="col-shaded-excel"></td>' : `
              <td style="text-align:center;">${qcmCell}</td>
            `}
            ${isPc ? `
              <td style="text-align:center;">${pcCell}</td>
            ` : '<td class="col-shaded-excel"></td>'}
            <td style="text-align:center; font-weight:700; font-size:1.05rem; color:var(--primary);">
              <span id="total-${c.id}">${c.scoreTotal}</span>
            </td>
            <td style="text-align:center; font-family:monospace; font-weight:600; color:var(--gray-600);">${c.communeCode || '-'}</td>
            <td style="white-space:nowrap; padding:4px 8px;">${c.communeName || '-'}</td>
            <td style="white-space:nowrap; color:var(--gray-700); padding:4px 8px;">${c.district || '-'}</td>
            ${resultCell}
            <td style="text-align:center;">${actionButtons}</td>
          </tr>
        `);
      }
    }
  });

  tbody.innerHTML = rows.join('');
  renderCommuneSlicer();
  updateRoleCounts();
}

async function updateCandidateField(candId, field, value) {
  if (field === 'candidateCode') {
    return updateCandidateCodeInline(candId, value);
  }

  const cand = state.candidates.find(c => c.id === candId);
  if (!cand) return;

  // Enforce positive values only
  if (field === 'scoreDegree') {
    value = Math.min(5, Math.max(0, Number(value) || 0));
  } else if (field === 'scoreExp') {
    value = Math.min(15, Math.max(0, Number(value) || 0));
  } else if (field === 'scoreQcm' || field === 'scorePc') {
    if (value !== 'អវត្តមាន') {
      value = Math.max(0, Number(value) || 0);
    }
  }

  const payload = {};
  payload[field] = value;

  try {
    const res = await api(`/api/candidates/${candId}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });

    if (res.success) {
      // Reload candidates to ensure formulas and ranks update
      const candRes = await api('/api/candidates');
      if (candRes.success) {
        state.candidates = candRes.candidates;
      }

      // Update specific row total & badges
      const updated = state.candidates.find(c => c.id === candId);
      if (updated) {
        const isTrainer = state.user && state.user.role === 'Trainer';
        const deg = Number(updated.scoreDegree) || 0;
        const exp = Number(updated.scoreExp) || 0;
        const totEl = document.getElementById(`total-${candId}`);
        if (totEl) {
          totEl.textContent = isTrainer ? (updated.roleCode === 'c' ? exp : (deg + exp)) : updated.scoreTotal;
        }
        const stBadge = document.getElementById(`status-${candId}`);
        if (stBadge) {
          stBadge.textContent = updated.status;
          let badgeClass = 'badge-passed';
          if (updated.status === 'B-បម្រុង') badgeClass = 'badge-reserve';
          if (updated.status === 'ធ្លាក់') badgeClass = 'badge-failed';
          if (updated.status === 'អវត្តមាន') badgeClass = 'badge-absent';
          stBadge.className = `badge ${badgeClass}`;
        }
      }
      showToast(`បានកែសម្រួលដោយជោគជ័យ!`, 'success');
    }
  } catch (err) {
    showToast(err.message || 'បរាជ័យក្នុងការកែសម្រួលទិន្នន័យ!', 'error');
  }
}

async function updateScore(candId, field, value) {
  return updateCandidateField(candId, field, value);
}

// ==============================================================================
// CANDIDATES TABLE EXCEL COPY & PASTE (ដូចក្នុង Microsoft Excel)
// ==============================================================================
async function copyCandidatesTableToClipboard() {
  const list = getFilteredCandidatesList();
  if (!list || list.length === 0) {
    showToast('ពុំមានទិន្នន័យបេក្ខជនសម្រាប់ចម្លងឡើយ!', 'error');
    return;
  }

  const isTrainer = state.user && state.user.role === 'Trainer';
  const headers = isTrainer
    ? ['ល.រ', 'គោត្តនាម និងនាម', 'ភេទ', 'ថ្ងៃខែឆ្នាំកំណើត', 'សញ្ញាបត្រ', 'បទពិសោធន៍', 'ពិន្ទុសរុប', 'កូដឃុំ', 'ឃុំ/សង្កាត់', 'ក្រុង/ស្រុក']
    : ['ល.រ', 'លេខកូដ', 'គោត្តនាម និងនាម', 'ភេទ', 'ថ្ងៃខែឆ្នាំកំណើត', 'សញ្ញាបត្រ', 'បទពិសោធន៍', 'ពិន្ទុ QCM', 'QCM-PC', 'ពិន្ទុសរុប', 'កូដឃុំ', 'ឃុំ/សង្កាត់', 'ក្រុង/ស្រុក', 'លទ្ធផល'];

  const rows = [headers.join('\t')];

  list.forEach((c, idx) => {
    const deg = Number(c.scoreDegree) || 0;
    const exp = Number(c.scoreExp) || 0;
    const trainerTotal = deg + exp;
    if (isTrainer) {
      const tot = c.roleCode === 'c' ? exp : (c.roleCode === 'd' ? '-' : trainerTotal);
      rows.push([
        idx + 1,
        c.name || '',
        c.gender || '',
        c.dob || '',
        c.scoreDegree !== undefined ? c.scoreDegree : '',
        c.scoreExp !== undefined ? c.scoreExp : '',
        tot,
        c.communeCode || '',
        c.communeName || '',
        c.district || ''
      ].join('\t'));
    } else {
      rows.push([
        idx + 1,
        c.candidateCode || '',
        c.name || '',
        c.gender || '',
        c.dob || '',
        c.scoreDegree !== undefined ? c.scoreDegree : '',
        c.scoreExp !== undefined ? c.scoreExp : '',
        c.scoreQcm !== undefined ? c.scoreQcm : '',
        c.scorePc !== undefined ? c.scorePc : '',
        c.scoreTotal !== undefined ? c.scoreTotal : '',
        c.communeCode || '',
        c.communeName || '',
        c.district || '',
        c.status || ''
      ].join('\t'));
    }
  });

  const tsv = rows.join('\r\n');
  try {
    await navigator.clipboard.writeText(tsv);
    showToast(`បានចម្លងទិន្នន័យបេក្ខជន ${list.length} នាក់ទៅ Clipboard រួចរាល់! អាចបិទភ្ជាប់ (Ctrl+V) ក្នុង Excel បាន។`, 'success');
  } catch (err) {
    const textarea = document.createElement('textarea');
    textarea.value = tsv;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    showToast(`បានចម្លងទិន្នន័យបេក្ខជន ${list.length} នាក់ទៅ Clipboard រួចរាល់!`, 'success');
  }
}

async function pasteCandidatesFromClipboardDirectly() {
  try {
    if (!navigator.clipboard || !navigator.clipboard.readText) {
      alert('សូមចុចលើក្រឡាតារាងបេក្ខជន រួចចុច Ctrl + V ដើម្បី Paste ពី Excel!');
      return;
    }
    const text = await navigator.clipboard.readText();
    if (!text || !text.trim()) {
      showToast('Clipboard គ្មានទិន្នន័យឡើយ! សូម Copy ពី Excel ជាមុន។', 'error');
      return;
    }
    const isTrainer = state.user && state.user.role === 'Trainer';
    await processPastedTextOnCandidatesTable(text, 0, isTrainer ? 'name' : 'candidateCode');
  } catch (err) {
    alert('Browser មិនអនុញ្ញាតអាន Clipboard ដោយស្វ័យប្រវត្តិ។ សូមចុចលើក្រឡាតារាងបេក្ខជន ហើយចុច Ctrl + V លើក្តារចុច!');
  }
}

async function handleCandidatesTablePaste(e) {
  const text = (e.clipboardData || window.clipboardData)?.getData('text');
  if (!text || !text.trim()) return;

  const rawLines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  if (rawLines.length === 0) return;

  const isMultiLine = rawLines.length > 1;
  const isMultiCol = rawLines[0].includes('\t') || rawLines[0].split(/[ ,\t]{2,}/).length >= 2;

  // If only a single plain value pasted inside a regular input, allow default typing behavior
  if (!isMultiLine && !isMultiCol) return;

  e.preventDefault();

  const target = e.target;
  const targetCol = target?.getAttribute('data-col') || 'name';
  const targetRowIdx = parseInt(target?.getAttribute('data-index') || '0', 10) || 0;

  await processPastedTextOnCandidatesTable(text, targetRowIdx, targetCol);
}

async function processPastedTextOnCandidatesTable(text, startRowIdx = 0, targetCol = 'name') {
  let rawLines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  if (rawLines.length === 0) return;

  // Filter out table headers if copied together
  const firstLine = rawLines[0].toLowerCase();
  if (firstLine.includes('ល.រ') || firstLine.includes('ឈ្មោះ') || firstLine.includes('កូដ') || firstLine.includes('ភេទ') || firstLine.includes('name') || firstLine.includes('gender')) {
    rawLines.shift();
  }
  if (rawLines.length === 0) return;

  const list = getFilteredCandidatesList();
  if (list.length === 0) {
    showToast('ពុំមានបញ្ជីបេក្ខជនសម្រាប់បិទភ្ជាប់ (Paste) ឡើយ!', 'error');
    return;
  }

  const updates = [];
  const isTrainer = state.user && state.user.role === 'Trainer';
  const hasTabsOrMultiCols = rawLines[0].includes('\t') || rawLines[0].split(/[ \t]{2,}/).length >= 2;

  rawLines.forEach((line, i) => {
    const rowIdx = startRowIdx + i;
    if (rowIdx >= list.length) return;
    const cand = list[rowIdx];
    if (isTrainer && cand.district !== state.user.district) return;

    const candUpdate = { id: cand.id };

    if (!hasTabsOrMultiCols) {
      // Single column paste directly down targetCol
      const val = line.trim();
      if (targetCol === 'gender') {
        candUpdate.gender = (val === 'ស' || val === 'F' || val === 'ស្រី') ? 'ស' : 'ប';
      } else if (targetCol === 'scoreDegree') {
        candUpdate.scoreDegree = Math.min(5, Math.max(0, Number(val) || 0));
      } else if (targetCol === 'scoreExp') {
        candUpdate.scoreExp = Math.min(15, Math.max(0, Number(val) || 0));
      } else if (targetCol === 'scoreQcm') {
        candUpdate.scoreQcm = val;
      } else if (targetCol === 'scorePc') {
        candUpdate.scorePc = val;
      } else if (targetCol === 'dob') {
        candUpdate.dob = val;
      } else if (targetCol === 'candidateCode') {
        candUpdate.candidateCode = val.toUpperCase();
      } else {
        candUpdate.name = val;
      }
    } else {
      // Multi-column paste
      let parts = line.split('\t');
      if (parts.length < 2) parts = line.split(/[ \t]{2,}/);

      // If first column is sequence number (1, 2, 3...) and more than 2 columns exist, remove the sequence number
      if (parts.length >= 3 && /^\d+$/.test(parts[0].trim()) && parts[1].trim() !== 'ប' && parts[1].trim() !== 'ស') {
        parts.shift();
      }

      // Column sequence mapping
      const colSequence = (targetCol === 'candidateCode') 
        ? ['candidateCode', 'name', 'gender', 'dob', 'scoreDegree', 'scoreExp', 'scoreQcm', 'scorePc']
        : (targetCol === 'dob')
        ? ['dob', 'scoreDegree', 'scoreExp']
        : (targetCol === 'scoreDegree')
        ? ['scoreDegree', 'scoreExp']
        : ['name', 'gender', 'dob', 'scoreDegree', 'scoreExp'];

      parts.forEach((partVal, pIdx) => {
        if (pIdx < colSequence.length) {
          const col = colSequence[pIdx];
          const val = partVal.trim();
          if (col === 'gender') {
            candUpdate.gender = (val === 'ស' || val === 'F' || val === 'ស្រី') ? 'ស' : 'ប';
          } else if (col === 'scoreDegree') {
            candUpdate.scoreDegree = Math.min(5, Math.max(0, Number(val) || 0));
          } else if (col === 'scoreExp') {
            candUpdate.scoreExp = Math.min(15, Math.max(0, Number(val) || 0));
          } else if (col === 'scoreQcm') {
            candUpdate.scoreQcm = val;
          } else if (col === 'scorePc') {
            candUpdate.scorePc = val;
          } else if (col === 'dob') {
            candUpdate.dob = val;
          } else if (col === 'candidateCode') {
            candUpdate.candidateCode = val.toUpperCase();
          } else if (col === 'name') {
            candUpdate.name = val;
          }
        }
      });
    }

    updates.push(candUpdate);
  });

  if (updates.length === 0) {
    showToast('ពុំមានទិន្នន័យសមស្របសម្រាប់បិទភ្ជាប់ (Paste) ឡើយ!', 'error');
    return;
  }

  showToast(`កំពុងដំណើរការបិទភ្ជាប់ទិន្នន័យ ${updates.length} ជួរពី Excel...`, 'info');

  try {
    const res = await api('/api/candidates/batch-update', {
      method: 'POST',
      body: JSON.stringify({ updates })
    });

    if (res.success) {
      showToast(`បានបិទភ្ជាប់ (Paste) ផ្ទាល់ពី Excel និងរក្សាទុកចំនួន ${updates.length} ជួរដោយជោគជ័យ!`, 'success');
      const candRes = await api('/api/candidates');
      if (candRes.success) {
        state.candidates = candRes.candidates;
        renderCandidatesTable();
      }
    } else {
      showToast(res.message || 'បរាជ័យក្នុងការបិទភ្ជាប់ទិន្នន័យ!', 'error');
    }
  } catch (err) {
    showToast(err.message || 'មានបញ្ហាក្នុងការរក្សាទុកទិន្នន័យ!', 'error');
  }
}

// Inline Candidate Code Update with instant QCM lookup & recalculation
async function updateCandidateCodeInline(candId, newCode) {
  const cand = state.candidates.find(c => c.id === candId);
  if (!cand) return;

  const codeVal = (newCode || '').trim().toUpperCase();

  // Validate unique code: a code can only be entered once
  if (codeVal) {
    const existingCand = state.candidates.find(c => c.id !== candId && c.candidateCode && c.candidateCode.toUpperCase() === codeVal);
    if (existingCand) {
      showToast(`លេខកូដ «${codeVal}» នេះត្រូវបានបញ្ចូលរួចហើយដោយបេក្ខជន «${existingCand.name}» (អាចបញ្ចូលបានតែម្តងប៉ុណ្ណោះ)!`, 'error');
      // Revert input field
      const row = document.getElementById(`row-${candId}`);
      if (row) {
        const input = row.querySelector('input[placeholder="កូដ..."]');
        if (input) input.value = cand.candidateCode || '';
      }
      return;
    }
  }

  // Instant optimistic update on UI if matching code is found in state.codes
  const foundCode = state.codes.find(k => k.code.toUpperCase() === codeVal);
  if (foundCode && cand.roleCode !== 'c' && cand.roleCode !== 'd') {
    const qcmInput = document.getElementById(`qcm-input-${candId}`);
    if (qcmInput) qcmInput.value = foundCode.qcmScore;
  }

  try {
    const res = await api(`/api/candidates/${candId}`, {
      method: 'PUT',
      body: JSON.stringify({ candidateCode: codeVal })
    });

    if (res.success) {
      // Reload both candidates and codes to keep assignment indicators updated
      const [candRes, codesRes] = await Promise.all([
        api('/api/candidates'),
        api('/api/codes')
      ]);
      state.candidates = candRes.candidates;
      state.codes = codesRes.codes || [];
      populateCodesDatalist();

      // Refresh row visuals
      const updated = state.candidates.find(c => c.id === candId);
      if (updated) {
        const qcmInput = document.getElementById(`qcm-input-${candId}`);
        if (qcmInput) qcmInput.value = updated.scoreQcm;
        document.getElementById(`total-${candId}`).textContent = updated.scoreTotal;
        document.getElementById(`rank-${candId}`).textContent = updated.rank;
        const stBadge = document.getElementById(`status-${candId}`);
        stBadge.textContent = updated.status;
        let badgeClass = 'badge-passed';
        if (updated.status === 'B-បម្រុង') badgeClass = 'badge-reserve';
        if (updated.status === 'ធ្លាក់') badgeClass = 'badge-failed';
        if (updated.status === 'អវត្តមាន') badgeClass = 'badge-absent';
        stBadge.className = `badge ${badgeClass}`;
      }
      showToast(`បានភ្ជាប់កូដ ${codeVal} និងទាញពិន្ទុ QCM ជូន ${cand.name} រួចរាល់!`, 'success');
    }
  } catch (err) {
    showToast(err.message || 'បរាជ័យក្នុងការភ្ជាប់កូដ!', 'error');
    const row = document.getElementById(`row-${candId}`);
    if (row) {
      const input = row.querySelector('input[placeholder="កូដ..."]');
      if (input) input.value = cand.candidateCode || '';
    }
  }
}

// Auto-fill QCM score when typing code in modal
function onCandCodeInput(val) {
  if (!val) return;
  const upper = val.trim().toUpperCase();
  const matched = state.codes.find(k => k.code.toUpperCase() === upper);
  if (matched) {
    const qcmEl = document.getElementById('candScoreQcm');
    if (qcmEl) {
      qcmEl.value = matched.qcmScore;
      qcmEl.style.backgroundColor = '#DCFCE7';
      setTimeout(() => { qcmEl.style.backgroundColor = ''; }, 1000);
    }
  }
}
// CANDIDATE MODAL (ADD / EDIT)
// ==============================================================================
function adjustCandidateModalForRole(isTrainer) {
  const groupCode = document.getElementById('groupCandCode');
  const groupQcm = document.getElementById('groupCandScoreQcm');
  const groupPc = document.getElementById('groupCandScorePc');
  const gridScores = document.getElementById('modalScoresGrid');
  const codeInput = document.getElementById('candCode');
  const qcmInput = document.getElementById('candScoreQcm');
  const pcInput = document.getElementById('candScorePc');

  if (isTrainer) {
    if (groupCode) groupCode.style.display = 'none';
    if (groupQcm) groupQcm.style.display = 'none';
    if (groupPc) groupPc.style.display = 'none';
    if (gridScores) gridScores.style.gridTemplateColumns = 'repeat(2, 1fr)';
    if (codeInput) { codeInput.disabled = true; codeInput.value = ''; }
    if (qcmInput) { qcmInput.disabled = true; qcmInput.value = '0'; }
    if (pcInput) { pcInput.disabled = true; pcInput.value = '0'; }
  } else {
    if (groupCode) groupCode.style.display = '';
    if (groupQcm) groupQcm.style.display = '';
    if (groupPc) groupPc.style.display = '';
    if (gridScores) gridScores.style.gridTemplateColumns = 'repeat(4, 1fr)';
    if (codeInput) { codeInput.disabled = false; codeInput.placeholder = 'ឧ. AB001'; }
    if (qcmInput) { qcmInput.disabled = false; qcmInput.placeholder = 'Auto ពីកូដ ឬវាយផ្ទាល់'; }
    if (pcInput) { pcInput.disabled = false; pcInput.placeholder = 'ពិន្ទុ ឬ អវត្តមាន'; }
  }
}

function openAddCandidateModal() {
  document.getElementById('candidateModalTitle').textContent = 'បន្ថែមបេក្ខជនថ្មី';
  document.getElementById('candId').value = '';
  document.getElementById('candidateForm').reset();

  const isTrainer = state.user && state.user.role === 'Trainer';
  adjustCandidateModalForRole(isTrainer);

  populateModalCommunes();
  document.getElementById('candidateModal').classList.add('active');
}

function openEditCandidateModal(candId) {
  const cand = state.candidates.find(c => c.id === candId);
  if (!cand) return;

  const isTrainer = state.user && state.user.role === 'Trainer';
  document.getElementById('candidateModalTitle').textContent = `កែសម្រួលបេក្ខជន: ${cand.name}`;
  document.getElementById('candId').value = cand.id;
  document.getElementById('candName').value = cand.name;
  document.getElementById('candGender').value = cand.gender;
  document.getElementById('candCode').value = cand.candidateCode || '';
  document.getElementById('candDob').value = cand.dob || '';
  document.getElementById('candRole').value = cand.roleCode;
  document.getElementById('candScoreDegree').value = cand.scoreDegree;
  document.getElementById('candScoreExp').value = cand.scoreExp;
  document.getElementById('candScoreQcm').value = cand.scoreQcm;
  document.getElementById('candScorePc').value = cand.scorePc;

  adjustCandidateModalForRole(isTrainer);

  populateModalCommunes(cand.district, cand.communeCode);
  document.getElementById('candidateModal').classList.add('active');
}

function closeCandidateModal() {
  document.getElementById('candidateModal').classList.remove('active');
}

function populateModalCommunes(selectedDist, selectedCommCode) {
  const isTrainer = state.user && state.user.role === 'Trainer';
  const distSelect = document.getElementById('candDistrict');
  distSelect.innerHTML = '';

  state.districts.forEach(d => {
    if (!isTrainer || d.name === state.user.district) {
      distSelect.innerHTML += `<option value="${d.name}">${d.name}</option>`;
    }
  });

  if (selectedDist) distSelect.value = selectedDist;
  else if (isTrainer) distSelect.value = state.user.district;

  if (isTrainer) {
    distSelect.disabled = true;
  } else {
    distSelect.disabled = false;
  }

  const updateModalCommunes = () => {
    const dVal = isTrainer ? state.user.district : distSelect.value;
    const commSelect = document.getElementById('candCommune');
    commSelect.innerHTML = '';
    state.communes.filter(k => k.district === dVal).forEach(k => {
      commSelect.innerHTML += `<option value="${k.code}">${k.fullName || k.name}</option>`;
    });
    if (selectedCommCode) commSelect.value = selectedCommCode;
  };

  distSelect.onchange = updateModalCommunes;
  updateModalCommunes();
}

async function saveCandidate(e) {
  e.preventDefault();
  const id = document.getElementById('candId').value;
  const isEdit = !!id;

  const roleCode = document.getElementById('candRole').value;
  let roleName = 'ប្រធាន';
  if (roleCode === 'b') roleName = 'ជំនួយការអនុ';
  if (roleCode === 'c') roleName = 'ការីកុំព្យូទ័រ';
  if (roleCode === 'd') roleName = 'អនុប្រធាន';

  const payload = {
    name: document.getElementById('candName').value,
    gender: document.getElementById('candGender').value,
    candidateCode: document.getElementById('candCode').value,
    dob: document.getElementById('candDob').value,
    roleCode: roleCode,
    role: roleName,
    district: document.getElementById('candDistrict').value,
    communeCode: document.getElementById('candCommune').value,
    scoreDegree: document.getElementById('candScoreDegree').value,
    scoreExp: document.getElementById('candScoreExp').value,
    scoreQcm: document.getElementById('candScoreQcm').value,
    scorePc: document.getElementById('candScorePc').value
  };

  if (payload.candidateCode) {
    const codeUpper = payload.candidateCode.trim().toUpperCase();
    const dup = state.candidates.find(c => c.id !== id && c.candidateCode && c.candidateCode.toUpperCase() === codeUpper);
    if (dup) {
      return showToast(`លេខកូដ «${codeUpper}» នេះត្រូវបានប្រើរួចហើយដោយបេក្ខជន «${dup.name}» (អាចបញ្ចូលបានតែម្តងប៉ុណ្ណោះ)!`, 'error');
    }
  }

  try {
    let res;
    if (isEdit) {
      res = await api(`/api/candidates/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
    } else {
      res = await api('/api/candidates', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    }

    if (res.success) {
      closeCandidateModal();
      showToast(res.message, 'success');
      const candRes = await api('/api/candidates');
      state.candidates = candRes.candidates;
      renderCandidatesTable();
    }
  } catch (err) {
    showToast(err.message || 'មានបញ្ហាក្នុងការរក្សាទុក!', 'error');
  }
}

async function deleteCandidate(candId) {
  if (state.user && state.user.role === 'Trainer') {
    return showToast('គណនីគ្រូប្រចាំក្រុង/ស្រុក មិនមានសិទ្ធិលុបបេក្ខជនឡើយ (មានសិទ្ធិតែកែសម្រួលប៉ុណ្ណោះ)!', 'error');
  }

  const cand = state.candidates.find(c => c.id === candId);
  if (!cand) return;

  if (!confirm(`តើលោកអ្នកពិតជាចង់លុបបេក្ខជន «${cand.name}» មែនទេ?`)) return;

  try {
    const res = await api(`/api/candidates/${candId}`, { method: 'DELETE' });
    if (res.success) {
      showToast(res.message, 'success');
      state.candidates = state.candidates.filter(c => c.id !== candId);
      renderCandidatesTable();
    }
  } catch (err) {
    showToast(err.message || 'មិនអាចលុបបាន!', 'error');
  }
}

// ==============================================================================
// 3. OFFICIAL TABULATION REPORT (PRINT-READY EXACT EXCEL REPLICA)
// ==============================================================================

// Helper: Convert number to Roman numerals (I, II, III, IV, V...)
function toRoman(num) {
  const romanMap = [
    [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']
  ];
  let n = parseInt(num, 10);
  if (isNaN(n) || n <= 0) return '';
  let result = '';
  for (const [val, sym] of romanMap) {
    while (n >= val) {
      result += sym;
      n -= val;
    }
  }
  return result;
}

// Helper: Convert English/Arabic digits to Khmer numerals (0 -> ០, 1 -> ១...)
function toKhmerNumber(val) {
  if (val === null || val === undefined || val === '') return '';
  const khmerDigits = ['០', '១', '២', '៣', '៤', '៥', '៦', '៧', '៨', '៩'];
  return String(val).replace(/[0-9]/g, d => khmerDigits[parseInt(d, 10)]);
}

// Khmer month dictionary for DOB formatting (e.g. 05-05-1966 -> ០៥-ឧសភា-១៩៦៦)
const KHMER_MONTHS_MAP = {
  '01': 'មករា', '1': 'មករា',
  '02': 'កុម្ភៈ', '2': 'កុម្ភៈ',
  '03': 'មីនា', '3': 'មីនា',
  '04': 'មេសា', '4': 'មេសា',
  '05': 'ឧសភា', '5': 'ឧសភា',
  '06': 'មិថុនា', '6': 'មិថុនា',
  '07': 'កក្កដា', '7': 'កក្កដា',
  '08': 'សីហា', '8': 'សីហា',
  '09': 'កញ្ញា', '9': 'កញ្ញា',
  '10': 'តុលា',
  '11': 'វិច្ឆិកា',
  '12': 'ធ្នូ'
};

function formatDobKhmer(dobStr) {
  if (!dobStr) return '';
  let parts = String(dobStr).trim().split(/[-/]/);
  if (parts.length === 3) {
    let d, m, y;
    if (parts[0].length === 4) {
      // YYYY-MM-DD
      y = parts[0];
      m = parts[1].padStart(2, '0');
      d = parts[2].padStart(2, '0');
    } else {
      // DD-MM-YYYY
      d = parts[0].padStart(2, '0');
      m = parts[1].padStart(2, '0');
      y = parts[2];
    }
    const monthName = KHMER_MONTHS_MAP[m] || m;
    return `${toKhmerNumber(d)}-${monthName}-${toKhmerNumber(y)}`;
  }
  return toKhmerNumber(dobStr);
}

// Render District Sheet Tabs (01 អង្គរបូរី, 02 បាទី...)
function renderTabDistrictSheetBar() {
  const container = document.getElementById('tabDistrictSheetBar');
  if (!container) return;

  const activeDist = state.tabReport.district || (state.districts[0] ? state.districts[0].name : '');

  let html = `
    <div class="excel-sheet-nav-arrows">
      <button class="excel-nav-btn" onclick="scrollTabDistrictSheetBar(-100)" title="រំកិលទៅឆ្វេង">◀</button>
      <button class="excel-nav-btn" onclick="scrollTabDistrictSheetBar(100)" title="រំកិលទៅស្តាំ">▶</button>
    </div>
  `;

  state.districts.forEach(dist => {
    const isActive = (dist.name === activeDist);
    html += `
      <div class="excel-sheet-tab ${isActive ? 'active' : ''}" onclick="setTabReportDistrict('${dist.name}')">
        <span>${dist.code} ${dist.name}</span>
        <span class="excel-sheet-tab-badge">${dist.communeCount} ឃុំ</span>
      </div>
    `;
  });

  container.innerHTML = html;
}

function scrollTabDistrictSheetBar(delta) {
  const container = document.getElementById('tabDistrictSheetBar');
  if (container) container.scrollBy({ left: delta, behavior: 'smooth' });
}

function setTabReportDistrict(distName) {
  state.tabReport.district = distName;
  const distSelect = document.getElementById('tabReportDistrict');
  if (distSelect) distSelect.value = distName;
  updateCommuneDropdowns();
  renderTabulationSheet();
}

// Reorganize / Sort List (ប៊ូតុង "រៀបចំបញ្ជី")
function reorganizeTabulationList() {
  const rolePriority = { 'a': 1, 'b': 2, 'c': 3, 'd': 4 };
  state.candidates.sort((a, b) => {
    if (a.communeCode !== b.communeCode) {
      return a.communeCode.localeCompare(b.communeCode);
    }
    const rA = rolePriority[a.roleCode] || 99;
    const rB = rolePriority[b.roleCode] || 99;
    if (rA !== rB) {
      return rA - rB;
    }
    const aAbs = a.scoreTotal === 'អវត្តមាន';
    const bAbs = b.scoreTotal === 'អវត្តមាន';
    if (aAbs && !bAbs) return 1;
    if (!aAbs && bAbs) return -1;
    if (aAbs && bAbs) return 0;
    return (Number(b.scoreTotal) || 0) - (Number(a.scoreTotal) || 0);
  });

  // Identify all communes that have Role B (សមាជិក ក.ច.ប ដែលជួយការងារអនុប្រធាន)
  const communesWithRoleB = new Set(
    state.candidates.filter(c => c.roleCode === 'b').map(c => c.communeCode)
  );

  const groups = {};
  state.candidates.forEach(c => {
    const key = `${c.communeCode}_${c.roleCode}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(c);
  });

  Object.entries(groups).forEach(([key, list]) => {
    const [commCode, roleCode] = key.split('_');
    const hasRoleB = communesWithRoleB.has(commCode);

    list.forEach((cand, idx) => {
      cand.rank = idx + 1;
      if (cand.manualStatus && cand.status) {
        return; // Preserve manual/substituted status
      }
      if (cand.scoreTotal === 'អវត្តមាន') {
        cand.status = 'អវត្តមាន';
      } else if (roleCode === 'c' && hasRoleB) {
        // Communes with Role B: Role C gets two (2) A-ជាប់
        if (idx === 0 || idx === 1) {
          cand.status = 'A-ជាប់';
        } else if (idx === 2) {
          cand.status = 'B-បម្រុង';
        } else if (idx === 3) {
          cand.status = 'C-បម្រុងបន្ទាប់';
        } else {
          cand.status = 'ធ្លាក់';
        }
      } else {
        if (idx === 0) {
          cand.status = 'A-ជាប់';
        } else if (idx === 1) {
          cand.status = 'B-បម្រុង';
        } else if (idx === 2) {
          cand.status = 'C-បម្រុងបន្ទាប់';
        } else {
          cand.status = 'ធ្លាក់';
        }
      }
    });
  });

  renderTabulationSheet();
  renderResultsSheet();
  renderCandidatesTable();
  showToast('បានរៀបចំ និងតម្រៀបបញ្ជីបេក្ខជនតាមពិន្ទុ និងមុខតំណែងរួចរាល់!', 'success');
}

// ==============================================================================
// STORAGE SANITIZER (ជម្រះចោលទិន្នន័យខូច ឬសារប្រព័ន្ធ Render/UUID ដែលធ្លាក់ចូល LocalStorage)
// ==============================================================================
function isCorruptedText(val) {
  if (!val || typeof val !== 'string') return false;
  const lower = val.toLowerCase();
  return lower.includes('pause') || lower.includes('deploy') || lower.includes('uuid') || lower.includes('urn:') || lower.includes('http');
}

function sanitizeText(val) {
  if (!val || typeof val !== 'string') return '';
  if (isCorruptedText(val)) return '';
  return val.trim();
}

function sanitizeCandidate(c) {
  if (!c || typeof c !== 'object') return c;
  ['notes', 'name', 'status', 'dob', 'gender', 'roleCode', 'communeCode'].forEach(key => {
    if (typeof c[key] === 'string' && isCorruptedText(c[key])) {
      c[key] = (key === 'status') ? 'ធ្លាក់' : '';
    }
  });
  return c;
}

function sanitizeAllCandidates() {
  if (Array.isArray(state.candidates)) {
    state.candidates.forEach(sanitizeCandidate);
  }
}

(function sanitizeStorage() {
  try {
    const pageVal = localStorage.getItem('pec21_report_page_num');
    if (isCorruptedText(pageVal) || (pageVal && pageVal.length > 8)) {
      localStorage.setItem('pec21_report_page_num', '-១-');
    }

    const lunarVal = localStorage.getItem('pec21_report_lunar_text');
    if (isCorruptedText(lunarVal)) {
      localStorage.setItem('pec21_report_lunar_text', 'ថ្ងៃចន្ទ ៣កើត ខែភទ្របទ ឆ្នាំមមី អដ្ឋស័ក ព.ស.២៥៧០');
    }

    const solarVal = localStorage.getItem('pec21_report_solar_text');
    if (isCorruptedText(solarVal)) {
      localStorage.setItem('pec21_report_solar_text', 'តាកែវ ថ្ងៃទី១៤ ខែកញ្ញា ឆ្នាំ២០២៦');
    }

    const instVal = localStorage.getItem('pec21_inst_lines');
    if (instVal && isCorruptedText(instVal)) {
      localStorage.removeItem('pec21_inst_lines');
    }
  } catch (e) {}
})();

// ==============================================================================
// REPORT FOOTER DATE MANAGEMENT (SYNC & PERSIST)
// ==============================================================================
function initReportDates() {
  const savedSolarIso = localStorage.getItem('pec21_report_solar_iso') || '2026-09-14';
  let savedSolarText = localStorage.getItem('pec21_report_solar_text');
  if (!savedSolarText || isCorruptedText(savedSolarText)) {
    savedSolarText = formatSolarKhmer(savedSolarIso);
    localStorage.setItem('pec21_report_solar_text', savedSolarText);
  }
  let savedLunar = localStorage.getItem('pec21_report_lunar_text');
  if (!savedLunar || isCorruptedText(savedLunar)) {
    savedLunar = 'ថ្ងៃចន្ទ ៣កើត ខែភទ្របទ ឆ្នាំមមី អដ្ឋស័ក ព.ស.២៥៧០';
    localStorage.setItem('pec21_report_lunar_text', savedLunar);
  }

  applySolarDate(savedSolarIso, savedSolarText);
  applyLunarDate(savedLunar);
}

function formatSolarKhmer(isoDateStr) {
  if (!isoDateStr) return '';
  const parts = isoDateStr.split('-');
  if (parts.length !== 3) return isoDateStr;
  const year = toKhmerNumber(parts[0]);
  const monthIdx = parseInt(parts[1], 10) - 1;
  const day = toKhmerNumber(parseInt(parts[2], 10));
  const khmerMonths = ['មករា', 'កុម្ភៈ', 'មីនា', 'មេសា', 'ឧសភា', 'មិថុនា', 'កក្កដា', 'សីហា', 'កញ្ញា', 'តុលា', 'វិច្ឆិកា', 'ធ្នូ'];
  const monthName = khmerMonths[monthIdx] || parts[1];
  return `តាកែវ ថ្ងៃទី${day} ខែ${monthName} ឆ្នាំ${year}`;
}

function handleSolarDateChange(isoVal) {
  if (!isoVal) return;
  const solarText = formatSolarKhmer(isoVal);
  localStorage.setItem('pec21_report_solar_iso', isoVal);
  localStorage.setItem('pec21_report_solar_text', solarText);
  applySolarDate(isoVal, solarText);
}

function handleLunarDateChange(lunarVal) {
  if (isCorruptedText(lunarVal)) return;
  localStorage.setItem('pec21_report_lunar_text', lunarVal);
  applyLunarDate(lunarVal);
}

function handleFooterDirectEdit(type, textVal) {
  if (isCorruptedText(textVal)) return;
  if (type === 'lunar') {
    handleLunarDateChange(textVal);
  } else if (type === 'solar') {
    localStorage.setItem('pec21_report_solar_text', textVal);
    document.querySelectorAll('.report-solar-date').forEach(el => el.innerText = textVal);
  }
}

function applySolarDate(isoVal, textVal) {
  const cleanText = isCorruptedText(textVal) ? 'តាកែវ ថ្ងៃទី១៤ ខែកញ្ញា ឆ្នាំ២០២៦' : textVal;
  const tSolar = document.getElementById('tabReportSolarDate');
  const rSolar = document.getElementById('resReportSolarDate');
  if (tSolar && isoVal) tSolar.value = isoVal;
  if (rSolar && isoVal) rSolar.value = isoVal;
  document.querySelectorAll('.report-solar-date').forEach(el => el.innerText = cleanText);
}

function applyLunarDate(lunarVal) {
  const cleanLunar = isCorruptedText(lunarVal) ? 'ថ្ងៃចន្ទ ៣កើត ខែភទ្របទ ឆ្នាំមមី អដ្ឋស័ក ព.ស.២៥៧០' : lunarVal;
  const tLunar = document.getElementById('tabReportLunarDate');
  const rLunar = document.getElementById('resReportLunarDate');
  if (tLunar) tLunar.value = cleanLunar;
  if (rLunar) rLunar.value = cleanLunar;
  document.querySelectorAll('.report-lunar-date').forEach(el => el.innerText = cleanLunar);
}

function applySavedReportDates() {
  const savedSolarIso = localStorage.getItem('pec21_report_solar_iso') || '2026-09-14';
  let savedSolarText = localStorage.getItem('pec21_report_solar_text');
  if (!savedSolarText || isCorruptedText(savedSolarText)) {
    savedSolarText = formatSolarKhmer(savedSolarIso);
    localStorage.setItem('pec21_report_solar_text', savedSolarText);
  }
  let savedLunar = localStorage.getItem('pec21_report_lunar_text');
  if (!savedLunar || isCorruptedText(savedLunar)) {
    savedLunar = 'ថ្ងៃចន្ទ ៣កើត ខែភទ្របទ ឆ្នាំមមី អដ្ឋស័ក ព.ស.២៥៧០';
    localStorage.setItem('pec21_report_lunar_text', savedLunar);
  }
  applySolarDate(savedSolarIso, savedSolarText);
  applyLunarDate(savedLunar);
}

// ==============================================================================
// PAGE NUMBER MANAGEMENT (-១- , -២- , ...)
// ==============================================================================
function handlePageNumberChange(pageVal) {
  let val = (pageVal || '-១-').trim();
  if (isCorruptedText(val) || val.length > 8) val = '-១-';
  localStorage.setItem('pec21_report_page_num', val);
  applyPageNumber(val);
}

function handlePageNumberDirectEdit(textVal) {
  let trimmed = (textVal || '').trim();
  if (isCorruptedText(trimmed) || trimmed.length > 8) trimmed = '-១-';
  localStorage.setItem('pec21_report_page_num', trimmed);
  applyPageNumber(trimmed);
}

function applyPageNumber(pageVal) {
  let val = (pageVal || '-១-').trim();
  if (isCorruptedText(val) || val.length > 8) val = '-១-';
  const tSelect = document.getElementById('tabReportPageSelect');
  const rSelect = document.getElementById('resReportPageSelect');
  if (tSelect) tSelect.value = val;
  if (rSelect) rSelect.value = val;
  document.querySelectorAll('.paper-page-number').forEach(el => {
    el.innerHTML = `<span class="page-num-display">${val}</span>`;
  });
}

function initPageNumber() {
  let saved = localStorage.getItem('pec21_report_page_num') || '-១-';
  if (isCorruptedText(saved) || saved.length > 8) {
    saved = '-១-';
    localStorage.setItem('pec21_report_page_num', '-១-');
  }
  applyPageNumber(saved);
}

// ==============================================================================
// INSTITUTION LINES & FONT SIZES UNDER LOGO MANAGEMENT (SYNC & PERSIST)
// ==============================================================================
const DEFAULT_INST_LINES = [
  'គណៈកម្មាធិការជាតិរៀបចំការបោះឆ្នោត',
  'គណៈកម្មការរៀបចំការបោះឆ្នោតខេត្តតាកែវ',
  'លេខាធិការដ្ឋានរៀបចំការបោះឆ្នោតខេត្តតាកែវ',
  'អនុគណៈកម្មការរៀបចំការប្រឡងជ្រើសរើស'
];
const DEFAULT_INST_SIZES = [9, 8.5, 8.5, 8];

function getSavedInstLines() {
  const saved = localStorage.getItem('pec21_inst_lines');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length === 4) return parsed;
    } catch (e) {}
  }
  return [...DEFAULT_INST_LINES];
}

function getSavedInstSizes() {
  const saved = localStorage.getItem('pec21_inst_font_sizes');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length === 4) return parsed;
    } catch (e) {}
  }
  return [...DEFAULT_INST_SIZES];
}

function applyInstLines(lines, sizes) {
  if (!lines) lines = getSavedInstLines();
  if (!sizes) sizes = getSavedInstSizes();

  lines.forEach((text, idx) => {
    const lineNum = idx + 1;
    const size = sizes[idx] !== undefined ? sizes[idx] : DEFAULT_INST_SIZES[idx];
    document.querySelectorAll(`.inst-line-${lineNum}`).forEach(el => {
      el.innerText = text;
      el.style.fontSize = `${size}pt`;
    });
    const mInput = document.getElementById(`modalInstLine${lineNum}`);
    if (mInput) mInput.value = text;
    const mSize = document.getElementById(`modalInstSize${lineNum}`);
    if (mSize) mSize.value = size;

    const sInput = document.getElementById(`settingsInstLine${lineNum}`);
    if (sInput) sInput.value = text;
    const sSize = document.getElementById(`settingsInstSize${lineNum}`);
    if (sSize) sSize.value = size;
  });
}

function initInstLines() {
  const lines = getSavedInstLines();
  const sizes = getSavedInstSizes();
  applyInstLines(lines, sizes);
}

function handleInstLineDirectEdit(lineNum, textVal) {
  const lines = getSavedInstLines();
  lines[lineNum - 1] = textVal.trim();
  localStorage.setItem('pec21_inst_lines', JSON.stringify(lines));
  applyInstLines(lines, null);
}

function adjustInstFontSizeAll(delta) {
  const sizes = getSavedInstSizes();
  const newSizes = sizes.map(s => Math.max(6, Math.min(20, Number((parseFloat(s) + delta).toFixed(1)))));
  localStorage.setItem('pec21_inst_font_sizes', JSON.stringify(newSizes));
  applyInstLines(null, newSizes);
  showToast(`បានកែទំហំអក្សរស្ថាប័ន (${delta > 0 ? '+' : ''}${delta}pt)`, 'info');
}

function openInstModal() {
  const lines = getSavedInstLines();
  const sizes = getSavedInstSizes();
  lines.forEach((text, idx) => {
    const input = document.getElementById(`modalInstLine${idx + 1}`);
    if (input) input.value = text;
    const sInput = document.getElementById(`modalInstSize${idx + 1}`);
    if (sInput) sInput.value = sizes[idx];
  });
  const modal = document.getElementById('instModal');
  if (modal) modal.classList.add('active');
}

function closeInstModal() {
  const modal = document.getElementById('instModal');
  if (modal) modal.classList.remove('active');
}

function handleSaveInstLines(e) {
  if (e) e.preventDefault();
  const lines = [
    document.getElementById('modalInstLine1').value.trim(),
    document.getElementById('modalInstLine2').value.trim(),
    document.getElementById('modalInstLine3').value.trim(),
    document.getElementById('modalInstLine4').value.trim()
  ];
  const sizes = [
    parseFloat(document.getElementById('modalInstSize1').value) || 9,
    parseFloat(document.getElementById('modalInstSize2').value) || 8.5,
    parseFloat(document.getElementById('modalInstSize3').value) || 8.5,
    parseFloat(document.getElementById('modalInstSize4').value) || 8
  ];
  localStorage.setItem('pec21_inst_lines', JSON.stringify(lines));
  localStorage.setItem('pec21_inst_font_sizes', JSON.stringify(sizes));
  applyInstLines(lines, sizes);
  closeInstModal();
  showToast('បានរក្សាទុកអក្សរ និងទំហំអក្សរនៅក្រោម Logo រួចរាល់!', 'success');
}

function saveSettingsInstLines() {
  const lines = [
    document.getElementById('settingsInstLine1').value.trim(),
    document.getElementById('settingsInstLine2').value.trim(),
    document.getElementById('settingsInstLine3').value.trim(),
    document.getElementById('settingsInstLine4').value.trim()
  ];
  const sizes = [
    parseFloat(document.getElementById('settingsInstSize1').value) || 9,
    parseFloat(document.getElementById('settingsInstSize2').value) || 8.5,
    parseFloat(document.getElementById('settingsInstSize3').value) || 8.5,
    parseFloat(document.getElementById('settingsInstSize4').value) || 8
  ];
  localStorage.setItem('pec21_inst_lines', JSON.stringify(lines));
  localStorage.setItem('pec21_inst_font_sizes', JSON.stringify(sizes));
  applyInstLines(lines, sizes);
  showToast('បានរក្សាទុកអក្សរ និងទំហំអក្សរនៅក្រោម Logo រួចរាល់!', 'success');
}

function resetInstLinesToDefault() {
  localStorage.removeItem('pec21_inst_lines');
  localStorage.removeItem('pec21_inst_font_sizes');
  applyInstLines(DEFAULT_INST_LINES, DEFAULT_INST_SIZES);
  showToast('បានកំណត់អក្សរ និងទំហំអក្សរស្ថាប័នទៅដូចដើមវិញ (Default)!', 'success');
}

// Render Continuous Official Tabulation Table
function renderTabulationSheet() {
  if (state.customLogo) applySystemLogo(state.customLogo);
  const districtName = state.tabReport.district || (state.districts[0] ? state.districts[0].name : 'អង្គរបូរី');
  const communeCode = state.tabReport.communeCode;

  // Title: Underlined district name
  const titleEl = document.getElementById('tabReportDistrictTitle');
  if (titleEl) {
    titleEl.textContent = `ស្រុក${districtName} នៃខេត្តតាកែវ`;
  }

  // Update sheet tabs bar
  renderTabDistrictSheetBar();

  let communesInDist = state.communes.filter(k => k.district === districtName);
  if (communeCode && communeCode !== 'all') {
    communesInDist = communesInDist.filter(k => k.code === communeCode);
  }

  const container = document.getElementById('tabulationTableContainer');
  if (!container) return;

  let tableHtml = `
    <table class="excel-official-table">
      <thead>
        <tr style="font-size:10pt;">
          <th rowspan="2" style="width:40px; font-size:10pt; white-space:nowrap;">ល.រ</th>
          <th rowspan="2" style="width:170px; font-size:10pt;">គោត្តនាម និងនាម</th>
          <th rowspan="2" style="width:45px; font-size:10pt; white-space:nowrap;">ភេទ</th>
          <th rowspan="2" class="col-dob" style="width:135px; min-width:130px; font-size:10pt; white-space:nowrap;">ថ្ងៃ ខែ ឆ្នាំកំណើត</th>
          <th colspan="4" style="font-size:10pt; white-space:nowrap;">ពិន្ទុ</th>
          <th rowspan="2" style="width:80px; font-size:10pt; white-space:nowrap;">សរុបពិន្ទុ</th>
          <th rowspan="2" style="width:85px; font-size:10pt; white-space:nowrap;">ចំណាត់ថ្នាក់</th>
          <th rowspan="2" style="width:70px; font-size:10pt; white-space:nowrap;">ផ្សេងៗ</th>
        </tr>
        <tr style="font-size:10pt;">
          <th style="width:65px; font-size:10pt; white-space:nowrap;">សញ្ញាបត្រ</th>
          <th style="width:90px; min-width:90px; font-size:10pt; white-space:nowrap;">បទពិសោធន៍</th>
          <th style="width:85px; font-size:10pt; white-space:nowrap;">សរសេរ QCM</th>
          <th style="width:105px; font-size:10pt; white-space:nowrap;">ធ្វើតេស្តកុំព្យូទ័រ</th>
        </tr>
      </thead>
      <tbody>
  `;

  if (communesInDist.length === 0) {
    tableHtml += `
      <tr>
        <td colspan="11" style="padding:20px; color:#64748B;">គ្មានទិន្នន័យឃុំសម្រាប់ស្រុកនេះទេ</td>
      </tr>
    `;
  }

  communesInDist.forEach((comm, commIdx) => {
    const commCands = state.candidates.filter(c => c.communeCode === comm.code);
    const roman = comm.romanOrder || toRoman(commIdx + 1);
    const cleanCommName = comm.name.replace(/^ឃុំ|^សង្កាត់/, '').trim();
    const commPrefix = districtName === 'ដូនកែវ' ? 'សង្កាត់' : 'ឃុំ';
    const commCodeKhmer = toKhmerNumber(comm.code);

    // 1. Commune Banner Row - Merged across all 11 columns with Times New Roman 12pt bold Roman numeral
    tableHtml += `
      <tr class="commune-banner-row">
        <td colspan="11"><span style="font-family:'Times New Roman', Times, serif; font-size:12pt; font-weight:bold; margin-right:6px;">${roman}-</span><span style="font-family:'Khmer OS Muol Light', 'Khmer OS Muol', 'Moul', serif; font-size:10pt;">${commPrefix}${cleanCommName} (${commCodeKhmer})</span></td>
      </tr>
    `;

    // 2. Role 1: មុខតំណែងប្រធាន ក.ច.ប
    const prathanList = commCands.filter(c => c.roleCode === 'a');
    if (prathanList.length > 0) {
      tableHtml += `
        <tr class="role-banner-row">
          <td colspan="11">មុខតំណែងប្រធាន ក.ច.ប</td>
        </tr>
      `;
      prathanList.forEach((c, idx) => {
        tableHtml += `
          <tr>
            <td>${toKhmerNumber(idx + 1)}</td>
            <td style="text-align:left; padding-left:8px;">${c.name}</td>
            <td>${c.gender || ''}</td>
            <td class="col-dob" style="white-space:nowrap;">${formatDobKhmer(c.dob)}</td>
            <td>${c.scoreDegree !== undefined && c.scoreDegree !== null && c.scoreDegree !== '' ? c.scoreDegree : ''}</td>
            <td>${c.scoreExp !== undefined && c.scoreExp !== null && c.scoreExp !== '' ? c.scoreExp : ''}</td>
            <td>${c.scoreQcm !== undefined && c.scoreQcm !== null && c.scoreQcm !== '' ? Number(c.scoreQcm).toFixed(2) : ''}</td>
            <td class="excel-x-cell"></td>
            <td>${c.scoreTotal !== undefined && c.scoreTotal !== null && c.scoreTotal !== '' ? Number(c.scoreTotal).toFixed(2) : ''}</td>
            <td>${c.status || ''}</td>
            <td>${sanitizeText(c.notes)}</td>
          </tr>
        `;
      });
    }

    // 3. Role 2: មុខតំណែងសមាជិក ក.ច.ប ដែលជួយការងារអនុប្រធាន ក.ច.ប
    const jumList = commCands.filter(c => c.roleCode === 'b');
    if (jumList.length > 0) {
      tableHtml += `
        <tr class="role-banner-row">
          <td colspan="11">មុខតំណែងសមាជិក ក.ច.ប ដែលជួយការងារអនុប្រធាន ក.ច.ប</td>
        </tr>
      `;
      jumList.forEach((c, idx) => {
        tableHtml += `
          <tr>
            <td>${toKhmerNumber(idx + 1)}</td>
            <td style="text-align:left; padding-left:8px;">${c.name}</td>
            <td>${c.gender || ''}</td>
            <td class="col-dob" style="white-space:nowrap;">${formatDobKhmer(c.dob)}</td>
            <td>${c.scoreDegree !== undefined && c.scoreDegree !== null && c.scoreDegree !== '' ? c.scoreDegree : ''}</td>
            <td>${c.scoreExp !== undefined && c.scoreExp !== null && c.scoreExp !== '' ? c.scoreExp : ''}</td>
            <td>${c.scoreQcm !== undefined && c.scoreQcm !== null && c.scoreQcm !== '' ? Number(c.scoreQcm).toFixed(2) : ''}</td>
            <td class="excel-x-cell"></td>
            <td>${c.scoreTotal !== undefined && c.scoreTotal !== null && c.scoreTotal !== '' ? Number(c.scoreTotal).toFixed(2) : ''}</td>
            <td>${c.status || ''}</td>
            <td>${sanitizeText(c.notes)}</td>
          </tr>
        `;
      });
    }

    // 4. Role 3: មុខតំណែងសមាជិក ក.ច.ប ការីកុំព្យូទ័រ
    const pcList = commCands.filter(c => c.roleCode === 'c');
    if (pcList.length > 0) {
      tableHtml += `
        <tr class="role-banner-row">
          <td colspan="11">មុខតំណែងសមាជិក ក.ច.ប ការីកុំព្យូទ័រ</td>
        </tr>
      `;
      pcList.forEach((c, idx) => {
        tableHtml += `
          <tr>
            <td>${toKhmerNumber(idx + 1)}</td>
            <td style="text-align:left; padding-left:8px;">${c.name}</td>
            <td>${c.gender || ''}</td>
            <td class="col-dob" style="white-space:nowrap;">${formatDobKhmer(c.dob)}</td>
            <td class="excel-x-cell"></td>
            <td>${c.scoreExp !== undefined && c.scoreExp !== null && c.scoreExp !== '' ? c.scoreExp : ''}</td>
            <td class="excel-x-cell"></td>
            <td>${c.scorePc !== undefined && c.scorePc !== null && c.scorePc !== '' ? Number(c.scorePc).toFixed(2) : ''}</td>
            <td>${c.scoreTotal !== undefined && c.scoreTotal !== null && c.scoreTotal !== '' ? Number(c.scoreTotal).toFixed(2) : ''}</td>
            <td>${c.status || ''}</td>
            <td>${sanitizeText(c.notes)}</td>
          </tr>
        `;
      });
    }
  });

  tableHtml += `
      </tbody>
    </table>
  `;

  // Dynamic summary line below table (គៀកជើងតារាងខាងឆ្វេង ស្មើនឹងជួរថ្ងៃខែឆ្នាំខាងស្តាំ)
  let allTabCands = [];
  communesInDist.forEach(comm => {
    const cands = state.candidates.filter(c => c.communeCode === comm.code);
    allTabCands.push(...cands);
  });
  const lastTabCand = allTabCands.length > 0 ? allTabCands[allTabCands.length - 1] : null;
  const lastTabCandName = lastTabCand ? lastTabCand.name : '';
  const totalTabCands = allTabCands.length;
  const femTabCount = allTabCands.filter(c => c.gender === 'ស្រី' || c.gender === 'ស').length;
  const femTabCountStr = String(femTabCount).padStart(2, '0');

  container.innerHTML = tableHtml;

  const tabStopEl = document.getElementById('tabStopListText');
  if (tabStopEl) {
    tabStopEl.innerText = `បញ្ឈប់បញ្ជីនេះត្រឹមឈ្មោះ: ${lastTabCandName} សរុប ${toKhmerNumber(totalTabCands)} នាក់ (ស្រី ${toKhmerNumber(femTabCountStr)} នាក់)`;
  }

  applySavedReportDates();
  initInstLines();
  initLogoPosition();
  initPageNumber();
  purgeAllCorruptedDOMElements();
}

// ==============================================================================
// 4. OFFICIAL RESULTS REPORT (PRINT-READY EXACT EXCEL REPLICA)
// ==============================================================================

// Render District Sheet Tabs for Results
function renderResDistrictSheetBar() {
  const container = document.getElementById('resDistrictSheetBar');
  if (!container) return;

  const activeDist = state.resultReport.district || (state.districts[0] ? state.districts[0].name : '');

  let html = `
    <div class="excel-sheet-nav-arrows">
      <button class="excel-nav-btn" onclick="scrollResDistrictSheetBar(-100)" title="រំកិលទៅឆ្វេង">◀</button>
      <button class="excel-nav-btn" onclick="scrollResDistrictSheetBar(100)" title="រំកិលទៅស្តាំ">▶</button>
    </div>
  `;

  state.districts.forEach(dist => {
    const isActive = (dist.name === activeDist);
    html += `
      <div class="excel-sheet-tab ${isActive ? 'active' : ''}" onclick="setResReportDistrict('${dist.name}')">
        <span>${dist.code} ${dist.name}</span>
        <span class="excel-sheet-tab-badge">${dist.communeCount} ឃុំ</span>
      </div>
    `;
  });

  container.innerHTML = html;
}

function scrollResDistrictSheetBar(delta) {
  const container = document.getElementById('resDistrictSheetBar');
  if (container) container.scrollBy({ left: delta, behavior: 'smooth' });
}

function setResReportDistrict(distName) {
  state.resultReport.district = distName;
  const distSelect = document.getElementById('resultReportDistrict');
  if (distSelect) distSelect.value = distName;
  updateCommuneDropdowns();
  renderResultsSheet();
}

function renderResultsSheet() {
  if (state.customLogo) applySystemLogo(state.customLogo);
  const districtName = state.resultReport.district || (state.districts[0] ? state.districts[0].name : 'អង្គរបូរី');
  const communeCode = state.resultReport.communeCode;

  const titleEl = document.getElementById('resultReportDistrictTitle');
  if (titleEl) {
    titleEl.textContent = `ស្រុក${districtName} នៃខេត្តតាកែវ`;
  }

  // Update sheet tabs bar
  renderResDistrictSheetBar();

  let communesInDist = state.communes.filter(k => k.district === districtName);
  if (communeCode && communeCode !== 'all') {
    communesInDist = communesInDist.filter(k => k.code === communeCode);
  }

  const container = document.getElementById('resultsTableContainer');
  if (!container) return;

  let tableHtml = `
    <table class="excel-official-table">
      <thead>
        <tr style="font-size:10pt;">
          <th style="width:45px; font-size:10pt;">ល.រ</th>
          <th style="width:200px; font-size:10pt;">គោត្តនាម និងនាម</th>
          <th style="width:45px; font-size:10pt;">ភេទ</th>
          <th class="col-dob" style="width:145px; min-width:135px; font-size:10pt; white-space:nowrap;">ថ្ងៃ ខែ ឆ្នាំកំណើត</th>
          <th style="width:90px; font-size:10pt;">សរុបពិន្ទុ</th>
          <th style="width:100px; font-size:10pt;">លទ្ធផល</th>
          <th style="width:100px; font-size:10pt;">ផ្សេងៗ</th>
        </tr>
      </thead>
      <tbody>
  `;

  if (communesInDist.length === 0) {
    tableHtml += `
      <tr>
        <td colspan="7" style="padding:20px; color:#64748B;">គ្មានទិន្នន័យឃុំសម្រាប់ស្រុកនេះទេ</td>
      </tr>
    `;
  }

  communesInDist.forEach((comm, commIdx) => {
    const commCands = state.candidates.filter(c => c.communeCode === comm.code);
    const roman = comm.romanOrder || toRoman(commIdx + 1);
    const cleanCommName = comm.name.replace(/^ឃុំ|^សង្កាត់/, '').trim();
    const commPrefix = districtName === 'ដូនកែវ' ? 'សង្កាត់' : 'ឃុំ';
    const commCodeKhmer = toKhmerNumber(comm.code);

    // 1. Commune Banner Row - Merged across all 7 columns with Times New Roman 12pt bold Roman numeral
    tableHtml += `
      <tr class="commune-banner-row">
        <td colspan="7"><span style="font-family:'Times New Roman', Times, serif; font-size:12pt; font-weight:bold; margin-right:6px;">${roman}-</span><span style="font-family:'Khmer OS Muol Light', 'Khmer OS Muol', 'Moul', serif; font-size:10pt;">${commPrefix}${cleanCommName} (${commCodeKhmer})</span></td>
      </tr>
    `;

    // 2. Role 1: មុខតំណែងប្រធាន ក.ច.ប
    const prathanList = commCands.filter(c => c.roleCode === 'a');
    if (prathanList.length > 0) {
      tableHtml += `
        <tr class="role-banner-row">
          <td colspan="7">មុខតំណែងប្រធាន ក.ច.ប</td>
        </tr>
      `;
      prathanList.forEach((c, idx) => {
        tableHtml += `
          <tr>
            <td>${toKhmerNumber(idx + 1)}</td>
            <td style="text-align:left; padding-left:8px;">${c.name}</td>
            <td>${c.gender || ''}</td>
            <td class="col-dob" style="white-space:nowrap;">${formatDobKhmer(c.dob)}</td>
            <td>${c.scoreTotal !== undefined && c.scoreTotal !== null && c.scoreTotal !== '' ? Number(c.scoreTotal).toFixed(2) : ''}</td>
            <td style="color:${c.status === 'A-ជាប់' ? '#047857' : (c.status === 'B-បម្រុង' || c.status === 'C-បម្រុងបន្ទាប់') ? '#0284C7' : '#DC2626'};">${c.status || ''}</td>
            <td>${sanitizeText(c.notes)}</td>
          </tr>
        `;
      });
    }

    // 3. Role 2: មុខតំណែងសមាជិក ក.ច.ប ដែលជួយការងារអនុប្រធាន ក.ច.ប
    const jumList = commCands.filter(c => c.roleCode === 'b');
    if (jumList.length > 0) {
      tableHtml += `
        <tr class="role-banner-row">
          <td colspan="7">មុខតំណែងសមាជិក ក.ច.ប ដែលជួយការងារអនុប្រធាន ក.ច.ប</td>
        </tr>
      `;
      jumList.forEach((c, idx) => {
        tableHtml += `
          <tr>
            <td>${toKhmerNumber(idx + 1)}</td>
            <td style="text-align:left; padding-left:8px;">${c.name}</td>
            <td>${c.gender || ''}</td>
            <td class="col-dob" style="white-space:nowrap;">${formatDobKhmer(c.dob)}</td>
            <td>${c.scoreTotal !== undefined && c.scoreTotal !== null && c.scoreTotal !== '' ? Number(c.scoreTotal).toFixed(2) : ''}</td>
            <td style="color:${c.status === 'A-ជាប់' ? '#047857' : (c.status === 'B-បម្រុង' || c.status === 'C-បម្រុងបន្ទាប់') ? '#0284C7' : '#DC2626'};">${c.status || ''}</td>
            <td>${sanitizeText(c.notes)}</td>
          </tr>
        `;
      });
    }

    // 4. Role 3: មុខតំណែងសមាជិក ក.ច.ប ការីកុំព្យូទ័រ
    const pcList = commCands.filter(c => c.roleCode === 'c');
    if (pcList.length > 0) {
      tableHtml += `
        <tr class="role-banner-row">
          <td colspan="7">មុខតំណែងសមាជិក ក.ច.ប ការីកុំព្យូទ័រ</td>
        </tr>
      `;
      pcList.forEach((c, idx) => {
        tableHtml += `
          <tr>
            <td>${toKhmerNumber(idx + 1)}</td>
            <td style="text-align:left; padding-left:8px;">${c.name}</td>
            <td>${c.gender || ''}</td>
            <td class="col-dob" style="white-space:nowrap;">${formatDobKhmer(c.dob)}</td>
            <td>${c.scoreTotal !== undefined && c.scoreTotal !== null && c.scoreTotal !== '' ? Number(c.scoreTotal).toFixed(2) : ''}</td>
            <td style="color:${c.status === 'A-ជាប់' ? '#047857' : (c.status === 'B-បម្រុង' || c.status === 'C-បម្រុងបន្ទាប់') ? '#0284C7' : '#DC2626'};">${c.status || ''}</td>
            <td>${sanitizeText(c.notes)}</td>
          </tr>
        `;
      });
    }
  });

  tableHtml += `
      </tbody>
    </table>
  `;

  // Dynamic summary line below table (គៀកជើងតារាងខាងឆ្វេង ស្មើនឹងជួរថ្ងៃខែឆ្នាំខាងស្តាំ)
  let allResCands = [];
  communesInDist.forEach(comm => {
    const cands = state.candidates.filter(c => c.communeCode === comm.code);
    allResCands.push(...cands);
  });
  const lastResCand = allResCands.length > 0 ? allResCands[allResCands.length - 1] : null;
  const lastResCandName = lastResCand ? lastResCand.name : '';
  const totalResCands = allResCands.length;
  const femResCount = allResCands.filter(c => c.gender === 'ស្រី' || c.gender === 'ស').length;
  const femResCountStr = String(femResCount).padStart(2, '0');

  container.innerHTML = tableHtml;

  const resStopEl = document.getElementById('resStopListText');
  if (resStopEl) {
    resStopEl.innerText = `បញ្ឈប់បញ្ជីនេះត្រឹមឈ្មោះ: ${lastResCandName} សរុប ${toKhmerNumber(totalResCands)} នាក់ (ស្រី ${toKhmerNumber(femResCountStr)} នាក់)`;
  }

  applySavedReportDates();
  initInstLines();
  initLogoPosition();
  initPageNumber();
  purgeAllCorruptedDOMElements();
}

// ==============================================================================
// 5. FINAL ROSTER (343 APPOINTED MEMBERS)
// ==============================================================================
function renderRoster() {
  const tbody = document.getElementById('rosterTableBody');
  tbody.innerHTML = '';

  const dFilter = document.getElementById('rosterDistrict').value;
  const sFilter = document.getElementById('rosterSearch').value.toLowerCase().trim();

  // All selected members
  let passedList = state.candidates.filter(c => c.status === 'A-ជាប់');

  if (dFilter && dFilter !== 'all') {
    passedList = passedList.filter(c => c.district === dFilter);
  }
  if (sFilter) {
    passedList = passedList.filter(c => c.name.toLowerCase().includes(sFilter));
  }

  // Sort by commune code
  passedList.sort((a, b) => {
    if (a.communeCode !== b.communeCode) return a.communeCode.localeCompare(b.communeCode);
    return a.roleCode.localeCompare(b.roleCode);
  });

  document.getElementById('rosterCountBadge').textContent = `សរុប: ${passedList.length} រូប`;

  const rows = [];
  passedList.forEach((c, idx) => {
    let roleTitle = 'ប្រធានក្រុមចុះឈ្មោះបោះឆ្នោត';
    if (c.roleCode === 'd') roleTitle = 'អនុប្រធានក្រុមចុះឈ្មោះបោះឆ្នោត (ស្មៀនឃុំ)';
    if (c.roleCode === 'c') roleTitle = 'សមាជិក ក.ច.ប ជាការីកុំព្យូទ័រ';
    if (c.roleCode === 'b') roleTitle = 'សមាជិក ក.ច.ប ដែលជួយការងារអនុប្រធាន';

    rows.push(`
      <tr>
        <td style="text-align:center; font-weight:600;">${idx + 1}</td>
        <td style="font-weight:600;">${c.name}</td>
        <td style="text-align:center;">${c.gender}</td>
        <td>${c.dob || '-'}</td>
        <td style="color:var(--primary); font-weight:600;">${roleTitle}</td>
        <td>${c.communeName}</td>
        <td>${c.district}</td>
        <td style="text-align:center;"><span class="badge badge-passed">A-ជាប់</span></td>
      </tr>
    `);
  });
  tbody.innerHTML = rows.join('');
}

// ==============================================================================
// 6. USER MANAGEMENT (SUPERADMIN & ADMIN)
// ==============================================================================
async function loadUsersList() {
  try {
    const res = await api('/api/users');
    if (!res.success) return;

    const tbody = document.getElementById('usersTableBody');
    tbody.innerHTML = '';
    res.users.forEach(u => {
      const isAct = !!u.isActivated;
      const statusBadge = isAct
        ? '<span class="badge badge-passed" style="font-weight:700;">✓ បាន Activate</span>'
        : '<span class="badge badge-reserve" style="background:#FEF3C7; color:#92400E; border:1px solid #FCD34D; font-weight:700;">⏳ រង់ចាំ Activate</span>';

      const resetBtn = (u.role === 'Trainer') ? `
        <button class="btn btn-secondary btn-sm" style="color:#D97706; padding:3px 7px; border-color:#FCD34D;" title="Reset លេខសម្ងាត់មក pec21" onclick="resetUserPassword('${u.id}', '${u.username}')">
          Reset
        </button>
      ` : '';

      tbody.innerHTML += `
        <tr>
          <td style="font-family:monospace; font-weight:700; color:var(--primary);">${u.username}</td>
          <td style="font-weight:600;">${u.fullName}</td>
          <td><span class="badge badge-role">${u.role}</span></td>
          <td style="font-weight:600;">${u.district === 'all' ? 'គ្រប់ស្រុក' : u.district}</td>
          <td style="font-family:monospace;">${u.phone || '-'}</td>
          <td style="font-size:0.85rem; color:var(--gray-600);">${u.email || '-'}</td>
          <td style="text-align:center;">${statusBadge}</td>
          <td style="text-align:center;">
            <div style="display:flex; justify-content:center; gap:5px;">
              <button class="btn btn-secondary btn-sm" onclick="openEditUserModal('${u.id}', '${u.username}', '${u.fullName}', ${u.active})" style="padding:3px 7px;">
                កែប្រែ
              </button>
              ${resetBtn}
            </div>
          </td>
        </tr>
      `;
    });
  } catch (err) {
    console.error('Error loading users:', err);
  }
}

async function resetUserPassword(userId, username) {
  if (!confirm(`តើលោកអ្នកចង់ Reset លេខសម្ងាត់គណនី «${username}» ត្រឡប់មក «pec21» (រង់ចាំ Activate ឡើងវិញ) មែនទេ?`)) return;

  try {
    const res = await api(`/api/users/${userId}/reset`, { method: 'POST' });
    if (res.success) {
      showToast(res.message, 'success');
      loadUsersList();
    }
  } catch (err) {
    showToast(err.message || 'បរាជ័យក្នុងការ Reset លេខសម្ងាត់!', 'error');
  }
}

function openEditUserModal(id, username, fullName, active) {
  document.getElementById('editUserId').value = id;
  document.getElementById('editUsername').value = username;
  document.getElementById('editFullName').value = fullName;
  document.getElementById('editPassword').value = '';
  document.getElementById('editActive').value = active ? 'true' : 'false';
  document.getElementById('userModal').classList.add('active');
}

function closeUserModal() {
  document.getElementById('userModal').classList.remove('active');
}

async function saveUserEdit(e) {
  e.preventDefault();
  const id = document.getElementById('editUserId').value;
  const fullName = document.getElementById('editFullName').value;
  const password = document.getElementById('editPassword').value;
  const active = document.getElementById('editActive').value === 'true';

  const payload = { fullName, active };
  if (password) payload.password = password;

  try {
    const res = await api(`/api/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    if (res.success) {
      closeUserModal();
      showToast(res.message, 'success');
      loadUsersList();
    }
  } catch (err) {
    showToast(err.message || 'មានបញ្ហាក្នុងការកែប្រែ!', 'error');
  }
}

// ==============================================================================
// 7. BACKUP & EXPORT
// ==============================================================================
async function downloadBackup() {
  try {
    showToast('កំពុងទាញយកឯកសារបម្រុងទុក...', 'info');
    const headers = {};
    if (state.token) headers['Authorization'] = `Bearer ${state.token}`;
    const tokenParam = state.token ? `?token=${encodeURIComponent(state.token)}` : '';
    const res = await fetch(`/api/backup${tokenParam}`, { headers });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return showToast(err.message || 'សិទ្ធិមិនគ្រប់គ្រាន់!', 'danger');
    }
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup_kb_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
    showToast('បានទាញយក Backup ដោយជោគជ័យ!', 'success');
  } catch (e) {
    showToast('កំហុសទាញយក: ' + e.message, 'danger');
  }
}

async function exportExcelCsv() {
  try {
    showToast('កំពុងទាញយកឯកសារ Excel/CSV...', 'info');
    const headers = {};
    if (state.token) headers['Authorization'] = `Bearer ${state.token}`;
    const tokenParam = state.token ? `?token=${encodeURIComponent(state.token)}` : '';
    const res = await fetch(`/api/export-csv${tokenParam}`, { headers });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return showToast(err.message || 'សិទ្ធិមិនគ្រប់គ្រាន់!', 'danger');
    }
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `candidates_export_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
    showToast('បានទាញយក CSV/Excel រួចរាល់!', 'success');
  } catch (e) {
    showToast('កំហុសទាញយក: ' + e.message, 'danger');
  }
}

async function restoreBackup() {
  const fileInput = document.getElementById('restoreFileInput');
  if (!fileInput.files || fileInput.files.length === 0) {
    return alert('សូមជ្រើសរើសឯកសារ JSON បម្រុងទុកជាមុន!');
  }

  const file = fileInput.files[0];
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!confirm('ការស្ដារទិន្នន័យនឹងជំនួសទិន្នន័យបច្ចុប្បន្នទាំងអស់។ តើលោកអ្នកប្រាកដទេ?')) return;

      const res = await api('/api/restore', {
        method: 'POST',
        body: JSON.stringify(data)
      });
      if (res.success) {
        showToast(res.message, 'success');
        setTimeout(() => location.reload(), 1000);
      }
    } catch (err) {
      showToast('ឯកសារ JSON មិនត្រឹមត្រូវ!', 'error');
    }
  };
  reader.readAsText(file);
}

async function syncFromCloudDirectly() {
  if (!confirm('តើលោកអ្នកពិតជាចង់ទាញយកទិន្នន័យថ្មីបំផុតពី Cloud (Firebase) មកកាន់ប្រព័ន្ធមែនទេ?')) return;
  try {
    showToast('កំពុងទាញយកទិន្នន័យពី Cloud...', 'info');
    const res = await api('/api/sync-cloud', { method: 'POST' });
    if (res.success) {
      showToast(res.message, 'success');
      await loadInitialData();
    } else {
      showToast(res.message || 'បរាជ័យក្នុងការទាញយក', 'danger');
    }
  } catch (err) {
    showToast('កំហុសតភ្ជាប់: ' + err.message, 'danger');
  }
}

// ==============================================================================
// SYSTEM LOGO & SETTINGS MANAGEMENT
// ==============================================================================
// ==============================================================================
// LOGO POSITIONING & INTERACTIVE DRAG-AND-DROP (រំកិលទីតាំង Logo)
// ==============================================================================
const DEFAULT_LOGO_POS = { x: 0, y: 0, size: 66 };
let isDraggingLogo = false;

function getSavedLogoPos() {
  const saved = localStorage.getItem('pec21_logo_pos');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      return {
        x: Number(parsed.x) || 0,
        y: Number(parsed.y) || 0,
        size: Number(parsed.size) || 66
      };
    } catch (e) {}
  }
  return { ...DEFAULT_LOGO_POS };
}

function applyLogoPos(pos) {
  if (!pos) pos = getSavedLogoPos();

  ['tabulationLogoContainer', 'resultsLogoContainer'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
      el.style.transition = isDraggingLogo ? 'none' : 'transform 0.12s ease-out';
      const img = el.querySelector('img');
      if (img) {
        img.style.width = `${pos.size}px`;
        img.style.height = `${pos.size}px`;
      }
      const svg = el.querySelector('svg');
      if (svg) {
        svg.setAttribute('width', pos.size);
        svg.setAttribute('height', pos.size);
      }
    }
  });

  ['modalLogoPosX', 'settingsLogoPosX'].forEach(id => {
    const el = document.getElementById(id);
    if (el && document.activeElement !== el) el.value = pos.x;
  });
  ['modalLogoPosY', 'settingsLogoPosY'].forEach(id => {
    const el = document.getElementById(id);
    if (el && document.activeElement !== el) el.value = pos.y;
  });
  ['modalLogoSize', 'settingsLogoSize'].forEach(id => {
    const el = document.getElementById(id);
    if (el && document.activeElement !== el) el.value = pos.size;
  });

  document.querySelectorAll('.logo-pos-display').forEach(lbl => {
    lbl.textContent = `X: ${pos.x > 0 ? '+' : ''}${pos.x}px, Y: ${pos.y > 0 ? '+' : ''}${pos.y}px (${pos.size}px)`;
  });
}

function nudgeLogoPos(dx, dy, dSize = 0) {
  const pos = getSavedLogoPos();
  pos.x += dx;
  pos.y += dy;
  if (dSize) pos.size = Math.max(30, Math.min(150, pos.size + dSize));
  localStorage.setItem('pec21_logo_pos', JSON.stringify(pos));
  applyLogoPos(pos);
}

function resetLogoPos() {
  localStorage.removeItem('pec21_logo_pos');
  applyLogoPos(DEFAULT_LOGO_POS);
  showToast('បានកំណត់ទីតាំង Logo ទៅកណ្តាលដើមវិញ (Default)!', 'success');
}

function handleManualLogoPosChange() {
  const mX = document.getElementById('modalLogoPosX');
  const mY = document.getElementById('modalLogoPosY');
  const mS = document.getElementById('modalLogoSize');
  const sX = document.getElementById('settingsLogoPosX');
  const sY = document.getElementById('settingsLogoPosY');
  const sS = document.getElementById('settingsLogoSize');

  const x = parseFloat((mX && mX.value) || (sX && sX.value) || 0);
  const y = parseFloat((mY && mY.value) || (sY && sY.value) || 0);
  const size = parseFloat((mS && mS.value) || (sS && sS.value) || 66);

  const pos = { x, y, size: Math.max(30, Math.min(150, size)) };
  localStorage.setItem('pec21_logo_pos', JSON.stringify(pos));
  applyLogoPos(pos);
}

function initLogoDrag() {
  ['tabulationLogoContainer', 'resultsLogoContainer'].forEach(id => {
    const el = document.getElementById(id);
    if (!el || el.dataset.dragInitialized) return;
    el.dataset.dragInitialized = 'true';

    let dragStartX = 0;
    let dragStartY = 0;
    let dragStartPosX = 0;
    let dragStartPosY = 0;

    const onMouseDown = (e) => {
      if (e.button !== 0) return;
      isDraggingLogo = true;
      el.style.cursor = 'grabbing';
      const curPos = getSavedLogoPos();
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      dragStartPosX = curPos.x;
      dragStartPosY = curPos.y;
      e.preventDefault();

      const onMouseMove = (ev) => {
        if (!isDraggingLogo) return;
        const deltaX = Math.round(ev.clientX - dragStartX);
        const deltaY = Math.round(ev.clientY - dragStartY);
        applyLogoPos({ x: dragStartPosX + deltaX, y: dragStartPosY + deltaY, size: curPos.size });
      };

      const onMouseUp = (ev) => {
        if (!isDraggingLogo) return;
        isDraggingLogo = false;
        el.style.cursor = 'grab';
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);

        const deltaX = Math.round(ev.clientX - dragStartX);
        const deltaY = Math.round(ev.clientY - dragStartY);
        const finalPos = { x: dragStartPosX + deltaX, y: dragStartPosY + deltaY, size: curPos.size };
        localStorage.setItem('pec21_logo_pos', JSON.stringify(finalPos));
        applyLogoPos(finalPos);
        showToast(`បានរំកិលទីតាំង Logo: X: ${finalPos.x}px, Y: ${finalPos.y}px`, 'info');
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    };

    el.addEventListener('mousedown', onMouseDown);
  });
}

function initLogoPosition() {
  const pos = getSavedLogoPos();
  applyLogoPos(pos);
  initLogoDrag();
}

// Clean Printing Modal Closer & Toast Remover
window.addEventListener('beforeprint', () => {
  const toastCont = document.getElementById('toastContainer');
  if (toastCont) toastCont.innerHTML = '';
  document.querySelectorAll('.toast').forEach(t => t.remove());
  if (typeof closeInstModal === 'function') closeInstModal();
  if (typeof closeUserModal === 'function') closeUserModal();
  if (typeof closeCandidateModal === 'function') closeCandidateModal();
  if (typeof closeSubstituteModal === 'function') closeSubstituteModal();
});

function getLogoHtml(logoSrc, size = 66) {
  if (logoSrc) {
    return `<img src="${logoSrc}" style="width:${size}px; height:${size}px; object-fit:contain; margin:0 auto; display:block; pointer-events:none;" alt="NEC Logo">`;
  }
  return `
    <svg width="${size}" height="${size}" viewBox="0 0 100 100" style="margin:0 auto; display:block; pointer-events:none;">
      <circle cx="50" cy="50" r="46" fill="#F8FAFC" stroke="#1E3A8A" stroke-width="2.5"/>
      <circle cx="50" cy="50" r="41" fill="none" stroke="#1E3A8A" stroke-width="1.2" stroke-dasharray="3,2"/>
      <circle cx="50" cy="50" r="33" fill="none" stroke="#1E3A8A" stroke-width="1.5"/>
      <path d="M50 22 L50 74 M32 38 L68 38 M32 38 L26 54 L38 54 Z M68 38 L62 54 L74 54 Z" fill="#93C5FD" stroke="#1E3A8A" stroke-width="2" stroke-linejoin="round"/>
      <circle cx="50" cy="74" r="3.5" fill="#1E3A8A"/>
    </svg>
  `;
}

const DEFAULT_NEC_SVG = `
  <svg width="66" height="66" viewBox="0 0 100 100" style="margin:0 auto; display:block;">
    <circle cx="50" cy="50" r="46" fill="#F8FAFC" stroke="#1E3A8A" stroke-width="2.5"/>
    <circle cx="50" cy="50" r="41" fill="none" stroke="#1E3A8A" stroke-width="1.2" stroke-dasharray="3,2"/>
    <circle cx="50" cy="50" r="33" fill="none" stroke="#1E3A8A" stroke-width="1.5"/>
    <path d="M50 22 L50 74 M32 38 L68 38 M32 38 L26 54 L38 54 Z M68 38 L62 54 L74 54 Z" fill="#93C5FD" stroke="#1E3A8A" stroke-width="2" stroke-linejoin="round"/>
    <circle cx="50" cy="74" r="3.5" fill="#1E3A8A"/>
  </svg>
`;

const DEFAULT_HEADER_SVG = `
  <svg viewBox="0 0 24 24">
    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
  </svg>
`;

function applySystemLogo(logoSrc) {
  state.customLogo = logoSrc || '';
  const pos = getSavedLogoPos();

  // 1. Header Brand Logo (រូបទី១)
  const headerLogoEl = document.getElementById('headerBrandLogo');
  if (headerLogoEl) {
    if (logoSrc) {
      headerLogoEl.innerHTML = `<img src="${logoSrc}" style="width:100%; height:100%; object-fit:contain; border-radius:50%; display:block;" alt="App Logo">`;
    } else {
      headerLogoEl.innerHTML = DEFAULT_HEADER_SVG;
    }
  }

  // 2. Tab 4: Tabulation Paper Logo (រូបទី២)
  const tabLogoEl = document.getElementById('tabulationLogoContainer');
  if (tabLogoEl) {
    tabLogoEl.innerHTML = getLogoHtml(logoSrc, pos.size);
  }

  // 3. Tab 5: Results Paper Logo
  const resLogoEl = document.getElementById('resultsLogoContainer');
  if (resLogoEl) {
    resLogoEl.innerHTML = getLogoHtml(logoSrc, pos.size);
  }

  applyLogoPos(pos);
  initLogoDrag();

  // 4. Tab 8: Settings Preview
  const previewEl = document.getElementById('settingsLogoPreview');
  const statusEl = document.getElementById('settingsLogoStatus');
  if (previewEl) {
    if (logoSrc) {
      previewEl.innerHTML = `<img src="${logoSrc}" style="width:100%; height:100%; object-fit:contain; border-radius:50%; display:block;" alt="Preview">`;
      if (statusEl) statusEl.innerHTML = `<span style="color:#2563EB;">✓ Logo ផ្ទាល់ខ្លួន (កំពុងប្រើ)</span>`;
    } else {
      previewEl.innerHTML = `
        <svg width="44" height="44" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="46" fill="#F8FAFC" stroke="#1E3A8A" stroke-width="2.5"/>
          <circle cx="50" cy="50" r="41" fill="none" stroke="#1E3A8A" stroke-width="1.2" stroke-dasharray="3,2"/>
          <circle cx="50" cy="50" r="33" fill="none" stroke="#1E3A8A" stroke-width="1.5"/>
          <path d="M50 22 L50 74 M32 38 L68 38 M32 38 L26 54 L38 54 Z M68 38 L62 54 L74 54 Z" fill="#93C5FD" stroke="#1E3A8A" stroke-width="2" stroke-linejoin="round"/>
          <circle cx="50" cy="74" r="3.5" fill="#1E3A8A"/>
        </svg>
      `;
      if (statusEl) statusEl.innerHTML = `Logo ដើម (គ.ជ.ប)`;
    }
  }
}

function handleLogoFileSelect(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  if (file.size > 10 * 1024 * 1024) {
    alert('ទំហំរូបភាពធំពេក (អតិបរមា 10MB)!');
    return;
  }

  const reader = new FileReader();
  reader.onload = (evt) => {
    const dataUrl = evt.target.result;
    state.pendingLogo = dataUrl;
    const previewEl = document.getElementById('settingsLogoPreview');
    if (previewEl) {
      previewEl.innerHTML = `<img src="${dataUrl}" style="width:100%; height:100%; object-fit:contain; border-radius:50%; display:block;" alt="Preview">`;
    }
    const statusEl = document.getElementById('settingsLogoStatus');
    if (statusEl) {
      statusEl.innerHTML = `<span style="color:#D97706;">⚠️ រូបថ្មី (មិនទាន់ Save)</span>`;
    }
  };
  reader.readAsDataURL(file);
}

async function saveCustomLogo() {
  const logoToSave = state.pendingLogo || state.customLogo;
  if (!logoToSave) {
    return alert('សូមជ្រើសរើសរូបភាព Logo ជាមុនសិន!');
  }

  try {
    showToast('កំពុងរក្សាទុក Logo...', 'info');
    localStorage.setItem('pec21_custom_logo', logoToSave);
    applySystemLogo(logoToSave);

    await api('/api/settings', {
      method: 'POST',
      body: JSON.stringify({ logo: logoToSave })
    }).catch(err => console.warn('Could not sync logo to server:', err));

    showToast('🎉 បានរក្សាទុក និងកំណត់ Logo ដោយជោគជ័យ!', 'success');
  } catch (err) {
    showToast('កំហុសរក្សាទុក: ' + err.message, 'danger');
  }
}

async function resetDefaultLogo() {
  if (!confirm('តើលោកអ្នកចង់ត្រឡប់ទៅប្រើរូបសញ្ញា Logo ដើម (គ.ជ.ប) វិញមែនទេ?')) return;
  try {
    localStorage.removeItem('pec21_custom_logo');
    state.pendingLogo = null;
    applySystemLogo(null);

    const fileInput = document.getElementById('logoFileInput');
    if (fileInput) fileInput.value = '';

    await api('/api/settings', {
      method: 'POST',
      body: JSON.stringify({ logo: '' })
    }).catch(err => console.warn('Could not sync to server:', err));

    showToast('បានត្រឡប់ទៅប្រើ Logo ដើម (គ.ជ.ប) រួចរាល់!', 'success');
  } catch (err) {
    showToast('កំហុស: ' + err.message, 'danger');
  }
}

// ------------------------------------------------------------------------------
// SYSTEM RESET (កំណត់ឡើងវិញ ដោយទទេស្អាត)
// ------------------------------------------------------------------------------
async function confirmResetSystem() {
  const isConfirmed = confirm(
    '⚠️ ការព្រមានសំខាន់បំផុត៖\n\n' +
    'តើលោកអ្នកពិតជាចង់កំណត់ប្រព័ន្ធឡើងវិញ ដោយលុបទិន្នន័យបេក្ខជន ពិន្ទុ និងលេខកូដទាំងអស់ឱ្យនៅទទេស្អាត (០ នាក់) មែនទេ?\n\n' +
    '(សកម្មភាពនេះមិនអាចត្រឡប់ក្រោយវិញបានឡើយ!)'
  );
  if (!isConfirmed) return;

  const doubleCheck = prompt('ដើម្បីបញ្ជាក់ការ Reset សូមវាយពាក្យ «RESET» ឬ «យល់ព្រម» ខាងក្រោម៖');
  if (!doubleCheck || (doubleCheck.trim().toUpperCase() !== 'RESET' && doubleCheck.trim() !== 'យល់ព្រម')) {
    return alert('ការ Reset ត្រូវបានលុបចោល!');
  }

  try {
    showToast('កំពុង Reset ប្រព័ន្ធ...', 'info');
    const res = await api('/api/reset', { method: 'POST' });
    if (res.success) {
      state.candidates = [];
      state.codes = [];
      renderDashboard();
      renderCandidatesTable();
      renderCodesTable();
      renderTabulationSheet();
      renderResultsSheet();
      updateRoleCounts();
      showToast(res.message || '🎉 បានកំណត់ប្រព័ន្ធឡើងវិញដោយទទេស្អាត (០ នាក់) រួចរាល់!', 'success');
    } else {
      showToast(res.message || 'បរាជ័យក្នុងការ Reset!', 'danger');
    }
  } catch (err) {
    showToast('កំហុស Reset: ' + err.message, 'danger');
  }
}

// ------------------------------------------------------------------------------
// CLEAR ALL CODES (លុបលេខកូដទាំងអស់)
// ------------------------------------------------------------------------------
async function confirmClearAllCodes() {
  if (!confirm('តើលោកអ្នកពិតជាចង់លុបលេខកូដសម្ងាត់ និងពិន្ទុ QCM ទាំងអស់ចេញពីប្រព័ន្ធមែនទេ?')) return;
  try {
    showToast('កំពុងលុបលេខកូដទាំងអស់...', 'info');
    const res = await api('/api/codes/clear-all', { method: 'POST' });
    if (res.success) {
      state.codes = [];
      state.candidates.forEach(c => {
        if (c.roleCode !== 'c' && c.roleCode !== 'd') {
          c.scoreQcm = 0;
          c.candidateCode = '';
        }
      });
      renderCodesTable();
      renderCandidatesTable();
      renderDashboard();
      populateCodesDatalist();
      showToast('🎉 បានលុបលេខកូដទាំងអស់រួចរាល់!', 'success');
    } else {
      showToast(res.message || 'បរាជ័យក្នុងការលុប!', 'danger');
    }
  } catch (err) {
    showToast('កំហុស: ' + err.message, 'danger');
  }
}

// ------------------------------------------------------------------------------
// CLEAR ALL CANDIDATES (លុបបេក្ខជនទាំងអស់)
// ------------------------------------------------------------------------------
async function confirmClearAllCandidates() {
  const currentRole = state.filters.roleCode;
  let promptMsg = '⚠️ តើលោកអ្នកពិតជាចង់លុបទិន្នន័យបេក្ខជនទាំងអស់មែនទេ?';
  if (currentRole && currentRole !== 'all') {
    const roleName = currentRole === 'a' ? 'ប្រធាន' : currentRole === 'b' ? 'ជំនួយការអនុ' : currentRole === 'c' ? 'ការីកុំព្យូទ័រ' : 'អនុប្រធាន';
    promptMsg = `⚠️ តើលោកអ្នកពិតជាចង់លុបទិន្នន័យបេក្ខជនទាំងអស់ (មុខតំណែង ${roleName}) មែនទេ?`;
  }

  if (!confirm(promptMsg)) return;

  try {
    showToast('កំពុងលុបទិន្នន័យបេក្ខជន...', 'info');
    const res = await api('/api/candidates/clear-all', {
      method: 'POST',
      body: JSON.stringify({ roleCode: 'all' })
    });
    if (res.success) {
      state.candidates = [];
      renderCandidatesTable();
      renderDashboard();
      updateRoleCounts();
      renderCommuneSlicer();
      populateCodesDatalist();
      showToast('🎉 បានលុបទិន្នន័យបេក្ខជនទាំងអស់រួចរាល់!', 'success');
    } else {
      showToast(res.message || 'បរាជ័យក្នុងការលុប!', 'danger');
    }
  } catch (err) {
    showToast('កំហុស: ' + err.message, 'danger');
  }
}

// ==============================================================================
// 8. CODES MANAGEMENT (TAB: លេខកូដ)
// ==============================================================================
async function loadCodes() {
  try {
    const res = await api('/api/codes');
    if (!res.success) return;
    state.codes = res.codes || [];
    renderCodesTable();
  } catch (err) {
    console.error('Error loading codes:', err);
  }
}

function filterCodesStatus(status) {
  state.codeFilters.status = status;
  renderCodesTable();
}

function renderCodesTable() {
  const tbody = document.getElementById('codesTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  let list = state.codes;

  // Filter status
  if (state.codeFilters.status === 'assigned') {
    list = list.filter(k => k.assignedTo !== null);
  } else if (state.codeFilters.status === 'unassigned') {
    list = list.filter(k => k.assignedTo === null);
  } else if (state.codeFilters.status === 'absent') {
    list = list.filter(k => k.qcmScore === 'អវត្តមាន');
  }

  // Filter search
  if (state.codeFilters.search) {
    const s = state.codeFilters.search.toLowerCase();
    list = list.filter(k => k.code.toLowerCase().includes(s) || (k.assignedTo && k.assignedTo.name.toLowerCase().includes(s)));
  }

  // Update KPIs
  const totalCodes = state.codes.length;
  const assigned = state.codes.filter(k => k.assignedTo !== null).length;
  const unassigned = state.codes.filter(k => k.assignedTo === null).length;
  const absent = state.codes.filter(k => k.qcmScore === 'អវត្តមាន').length;

  const kTotal = document.getElementById('codeKpiTotal');
  const kAssigned = document.getElementById('codeKpiAssigned');
  const kUnassigned = document.getElementById('codeKpiUnassigned');
  const kAbsent = document.getElementById('codeKpiAbsent');
  const kBadge = document.getElementById('filteredCodesCountBadge');

  if (kTotal) kTotal.textContent = totalCodes;
  if (kAssigned) kAssigned.textContent = assigned;
  if (kUnassigned) kUnassigned.textContent = unassigned;
  if (kAbsent) kAbsent.textContent = absent;
  if (kBadge) kBadge.textContent = `បង្ហាញ: ${list.length} / ${totalCodes} កូដ`;

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:30px; color:var(--gray-400);">មិនមានលេខកូដតាមលក្ខខណ្ឌស្វែងរកនេះឡើយ</td></tr>`;
    return;
  }

  const rows = [];
  list.forEach((k, idx) => {
    const isAbsent = k.qcmScore === 'អវត្តមាន';

    rows.push(`
      <tr id="code-row-${k.id}" data-row-index="${idx}" data-code-id="${k.id}">
        <td style="text-align:center; color:var(--gray-500); font-weight:600;">${idx + 1}</td>
        <td style="text-align:center;">
          <input type="text" class="score-input code-val-input" data-col="code" data-index="${idx}"
            style="width:110px; text-align:center; font-family:monospace; font-weight:700; font-size:1.05rem; color:var(--primary); letter-spacing:0.5px; text-transform:uppercase;"
            value="${k.code}" onchange="updateCodeValInline('${k.id}', this.value)" title="ចុចដើម្បីកែប្រែ ឬបិទភ្ជាប់ (Paste) លេខកូដ">
        </td>
        <td style="text-align:center;">
          <input type="text" class="score-input qcm-score-input" data-col="qcm" data-index="${idx}"
            style="width:90px; text-align:center; font-weight:700; font-size:1rem; color:${isAbsent ? 'var(--gray-500)' : '#059669'};"
            value="${k.qcmScore}" onchange="updateCodeScoreInline('${k.id}', this.value)" title="ចុចដើម្បីកែប្រែ ឬបិទភ្ជាប់ (Paste) ពិន្ទុ QCM">
        </td>
        <td style="text-align:center;">
          <div style="display:flex; justify-content:center; gap:6px;">
            <button class="btn btn-secondary btn-sm" title="កែប្រែ" onclick="openEditCodeById('${k.id}')" style="padding:4px 8px; border-radius:6px;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            </button>
            <button class="btn btn-secondary btn-sm" title="លុប" onclick="deleteCodeById('${k.id}')" style="padding:4px 8px; border-radius:6px; color:var(--danger); border-color:#FECACA;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </td>
      </tr>
    `);
  });
  tbody.innerHTML = rows.join('');
}

// Inline update Code name directly from Codes table
async function updateCodeValInline(codeId, newCode) {
  const codeStr = (newCode || '').trim().toUpperCase();
  if (!codeStr) return;
  try {
    const res = await api(`/api/codes/${codeId}`, {
      method: 'PUT',
      body: JSON.stringify({ code: codeStr })
    });
    if (res.success) {
      showToast(`បានកែប្រែលេខកូដ «${codeStr}» ដោយជោគជ័យ!`, 'success');
      const [candRes, codesRes] = await Promise.all([
        api('/api/candidates'),
        api('/api/codes')
      ]);
      state.candidates = candRes.candidates;
      state.codes = codesRes.codes || [];
      populateCodesDatalist();
      renderCodesTable();
      renderCandidatesTable();
    }
  } catch (err) {
    showToast(err.message || 'បរាជ័យក្នុងការកែប្រែលេខកូដ!', 'error');
  }
}

// Direct Copy & Paste for Codes Table (Excel Integration)
async function copyCodesTableToClipboard() {
  const list = state.codes;
  if (!list || list.length === 0) {
    showToast('គ្មានទិន្នន័យសម្រាប់ចម្លងឡើយ!', 'error');
    return;
  }
  const lines = list.map(k => `${k.code}	${k.qcmScore}`);
  const tsvData = lines.join('\n');
  try {
    await navigator.clipboard.writeText(tsvData);
    showToast(`បានចម្លងលេខកូដ និងពិន្ទុ ${list.length} ជួរទៅ Clipboard រួចរាល់! (អាចចុច Ctrl + V លើ Excel បាន)`, 'success');
  } catch (err) {
    // Fallback
    const ta = document.createElement('textarea');
    ta.value = tsvData;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast(`បានចម្លង ${list.length} ជួរទៅ Clipboard ដោយជោគជ័យ!`, 'success');
  }
}

async function pasteFromClipboardDirectly() {
  try {
    const text = await navigator.clipboard.readText();
    if (!text || !text.trim()) {
      showToast('Clipboard គ្មានទិន្នន័យឡើយ! សូម Copy ពី Excel ជាមុនសិន។', 'error');
      return;
    }
    await processPastedTextOnCodesTable(text, 0, 'code');
  } catch (err) {
    // Fallback to modal if browser clipboard permission prompt is denied
    openBatchCodeModal();
  }
}

async function handleCodesTablePaste(e) {
  const text = (e.clipboardData || window.clipboardData)?.getData('text');
  if (!text || !text.trim()) return;

  const rawLines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  if (rawLines.length === 0) return;

  const isMultiLine = rawLines.length > 1;
  const isMultiCol = rawLines[0].includes('\t') || rawLines[0].split(/[ ,\t]{2,}/).length >= 2;

  // If only a single plain value pasted inside a regular input, allow default typing behavior
  if (!isMultiLine && !isMultiCol) return;

  e.preventDefault();

  const target = e.target;
  const targetCol = target?.getAttribute('data-col') || (target?.classList.contains('qcm-score-input') ? 'qcm' : 'code');
  const targetRowIdx = parseInt(target?.getAttribute('data-index') || '0', 10) || 0;

  await processPastedTextOnCodesTable(text, targetRowIdx, targetCol);
}

async function processPastedTextOnCodesTable(text, startRowIdx = 0, targetCol = 'code') {
  const rawLines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  if (rawLines.length === 0) return;

  let list = state.codes;
  if (state.codeFilters.status === 'assigned') list = list.filter(k => k.assignedTo !== null);
  if (state.codeFilters.status === 'unassigned') list = list.filter(k => k.assignedTo === null);
  if (state.codeFilters.status === 'absent') list = list.filter(k => k.qcmScore === 'អវត្តមាន');
  if (state.codeFilters.search) {
    const s = state.codeFilters.search.toLowerCase();
    list = list.filter(k => k.code.toLowerCase().includes(s) || (k.assignedTo && k.assignedTo.name.toLowerCase().includes(s)));
  }

  const items = [];
  const hasTabsOrSpaces = rawLines[0].includes('\t') || rawLines[0].split(/[ \t]{2,}/).length >= 2;

  if (hasTabsOrSpaces) {
    // Multi-column paste: Code and QCM together
    for (const line of rawLines) {
      let parts = line.split('\t');
      if (parts.length < 2) parts = line.split(/[ \t]{2,}/);
      if (parts.length >= 2) {
        const c = parts[0].trim().toUpperCase();
        const s = parts[1].trim();
        if (c) items.push({ code: c, qcmScore: s });
      } else if (parts.length === 1 && parts[0].trim()) {
        items.push({ code: parts[0].trim().toUpperCase(), qcmScore: 0 });
      }
    }
  } else {
    // Single-column paste down the list
    if (targetCol === 'qcm') {
      // Pasted onto QCM score column
      rawLines.forEach((line, i) => {
        const rowIdx = startRowIdx + i;
        if (rowIdx < list.length) {
          items.push({
            code: list[rowIdx].code,
            qcmScore: line.trim()
          });
        }
      });
    } else {
      // Pasted onto Code column
      rawLines.forEach((line, i) => {
        const rowIdx = startRowIdx + i;
        const c = line.trim().toUpperCase();
        if (c) {
          const s = rowIdx < list.length ? list[rowIdx].qcmScore : 0;
          items.push({ code: c, qcmScore: s });
        }
      });
    }
  }

  if (items.length === 0) {
    showToast('ពុំមានទិន្នន័យសមស្របសម្រាប់បិទភ្ជាប់ (Paste) ឡើយ!', 'error');
    return;
  }

  showToast(`កំពុងដំណើរការបិទភ្ជាប់ទិន្នន័យ ${items.length} ជួរពី Excel...`, 'info');

  try {
    const res = await api('/api/codes/batch', {
      method: 'POST',
      body: JSON.stringify({ items })
    });

    if (res.success) {
      showToast(`បានបិទភ្ជាប់ (Paste) ផ្ទាល់ពី Excel និងរក្សាទុកចំនួន ${items.length} ជួរដោយជោគជ័យ!`, 'success');
      const [candRes, codesRes] = await Promise.all([
        api('/api/candidates'),
        api('/api/codes')
      ]);
      state.candidates = candRes.candidates;
      state.codes = codesRes.codes || [];
      populateCodesDatalist();
      renderCodesTable();
      renderCandidatesTable();
    } else {
      showToast(res.message || 'បរាជ័យក្នុងការបិទភ្ជាប់ទិន្នន័យ!', 'error');
    }
  } catch (err) {
    showToast(err.message || 'មានបញ្ហាក្នុងការរក្សាទុកទិន្នន័យ!', 'error');
  }
}

function openEditCodeById(codeId) {
  const k = state.codes.find(x => x.id === codeId);
  if (!k) return;
  document.getElementById('codeModalTitle').textContent = `កែប្រែលេខកូដ: ${k.code}`;
  document.getElementById('editCodeId').value = k.id;
  const cInput = document.getElementById('codeValInput');
  cInput.value = k.code;
  cInput.disabled = true;
  document.getElementById('codeQcmInput').value = k.qcmScore;
  document.getElementById('codeNotesInput').value = k.notes || '';
  document.getElementById('codeModal').classList.add('active');
}

async function deleteCodeById(codeId) {
  const k = state.codes.find(x => x.id === codeId);
  if (!k) return;
  if (!confirm(`តើលោកអ្នកពិតជាចង់លុបលេខកូដ «${k.code}» មែនទេ?`)) return;

  try {
    const res = await api(`/api/codes/${codeId}`, { method: 'DELETE' });
    if (res.success) {
      showToast(res.message, 'success');
      const codesRes = await api('/api/codes');
      state.codes = codesRes.codes || [];
      populateCodesDatalist();
      renderCodesTable();
    }
  } catch (err) {
    showToast(err.message || 'មិនអាចលុបលេខកូដបានទេ!', 'error');
  }
}

// Inline update QCM score directly from Codes table
async function updateCodeScoreInline(codeId, newScore) {
  try {
    const res = await api(`/api/codes/${codeId}`, {
      method: 'PUT',
      body: JSON.stringify({ qcmScore: newScore })
    });
    if (res.success) {
      showToast(res.message, 'success');
      // Reload candidates and codes to reflect cascaded recalculations
      const [candRes, codesRes] = await Promise.all([
        api('/api/candidates'),
        api('/api/codes')
      ]);
      state.candidates = candRes.candidates;
      state.codes = codesRes.codes || [];
      populateCodesDatalist();
      renderCodesTable();
    }
  } catch (err) {
    showToast(err.message || 'បរាជ័យក្នុងការកែប្រែពិន្ទុ!', 'error');
  }
}

// Add/Edit Code Modal
function openAddCodeModal() {
  document.getElementById('codeModalTitle').textContent = 'បន្ថែមលេខកូដថ្មី';
  document.getElementById('editCodeId').value = '';
  document.getElementById('codeValInput').value = '';
  document.getElementById('codeValInput').disabled = false;
  document.getElementById('codeQcmInput').value = '';
  document.getElementById('codeNotesInput').value = '';
  document.getElementById('codeModal').classList.add('active');
}

function closeCodeModal() {
  document.getElementById('codeModal').classList.remove('active');
}

async function saveCode(e) {
  e.preventDefault();
  const id = document.getElementById('editCodeId').value;
  const isEdit = !!id;
  const codeVal = document.getElementById('codeValInput').value.trim().toUpperCase();
  const qcmVal = document.getElementById('codeQcmInput').value.trim();
  const notesVal = document.getElementById('codeNotesInput').value.trim();

  try {
    let res;
    if (isEdit) {
      res = await api(`/api/codes/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ qcmScore: qcmVal, notes: notesVal })
      });
    } else {
      res = await api('/api/codes', {
        method: 'POST',
        body: JSON.stringify({ code: codeVal, qcmScore: qcmVal, notes: notesVal })
      });
    }

    if (res.success) {
      closeCodeModal();
      showToast(res.message, 'success');
      // Reload codes and candidates to reflect changes
      const [candRes, codesRes] = await Promise.all([
        api('/api/candidates'),
        api('/api/codes')
      ]);
      state.candidates = candRes.candidates;
      state.codes = codesRes.codes || [];
      populateCodesDatalist();
      renderCodesTable();
    }
  } catch (err) {
    showToast(err.message || 'មានបញ្ហាក្នុងការរក្សាទុកលេខកូដ!', 'error');
  }
}

// Batch Paste Codes from Excel Modal
function openBatchCodeModal() {
  document.getElementById('batchCodeTextarea').value = '';
  document.getElementById('batchCodeModal').classList.add('active');
}

function closeBatchCodeModal() {
  document.getElementById('batchCodeModal').classList.remove('active');
}

async function submitBatchCodes() {
  const text = document.getElementById('batchCodeTextarea').value;
  if (!text.trim()) {
    return alert('សូមបិទភ្ជាប់ (Paste) ទិន្នន័យពី Excel ជាមុន!');
  }

  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  const items = [];

  for (const line of lines) {
    // Split by tab or multiple spaces or comma
    const parts = line.split(/\t| {2,}|,/);
    if (parts.length >= 2) {
      const c = parts[0].trim().toUpperCase();
      const s = parts[1].trim();
      if (c) {
        items.push({ code: c, qcmScore: s });
      }
    } else if (parts.length === 1 && parts[0].trim()) {
      // Just code with 0 score
      items.push({ code: parts[0].trim().toUpperCase(), qcmScore: 0 });
    }
  }

  if (items.length === 0) {
    return alert('មិនមានទិន្នន័យលេខកូដត្រឹមត្រូវដើម្បីបញ្ចូលទេ!');
  }

  try {
    const res = await api('/api/codes/batch', {
      method: 'POST',
      body: JSON.stringify({ codes: items })
    });

    if (res.success) {
      closeBatchCodeModal();
      showToast(res.message, 'success');
      // Reload both candidates & codes
      const [candRes, codesRes] = await Promise.all([
        api('/api/candidates'),
        api('/api/codes')
      ]);
      state.candidates = candRes.candidates;
      state.codes = codesRes.codes || [];
      populateCodesDatalist();
      renderCodesTable();
    }
  } catch (err) {
    showToast(err.message || 'មានបញ្ហាក្នុងការបញ្ចូលទិន្នន័យជាដុំ!', 'error');
  }
}

// ==============================================================================
// SUBSTITUTE & RETENTION HANDLERS (ការផ្ទេរជំនួស ឬ រក្សាទុកបេក្ខជន)
// ==============================================================================
function openSubstituteModal(candId) {
  const cand = state.candidates.find(c => c.id === candId);
  if (!cand) return showToast('រកមិនឃើញបេក្ខជននេះទេ!', 'error');

  const modal = document.getElementById('substituteModal');
  if (!modal) return;

  document.getElementById('subCandId').value = cand.id;
  document.getElementById('subCandName').innerText = cand.name;
  document.getElementById('subCandGender').innerText = cand.gender || '-';
  document.getElementById('subCandDob').innerText = cand.dob ? formatDobKhmer(cand.dob) : '-';
  document.getElementById('subCandScore').innerText = cand.scoreTotal || '0';
  document.getElementById('subCandRole').innerText = cand.role || cand.roleCode;
  document.getElementById('subCandLocation').innerText = `${cand.communeName || ''} (${cand.district || ''})`;

  const badgeEl = document.getElementById('subCandStatusBadge');
  if (badgeEl) {
    let bClass = 'badge-passed';
    if (cand.status === 'B-បម្រុង' || cand.status === 'C-បម្រុងបន្ទាប់') bClass = 'badge-reserve';
    if (cand.status === 'ធ្លាក់') bClass = 'badge-failed';
    if (cand.status === 'អវត្តមាន') bClass = 'badge-absent';
    badgeEl.className = `badge ${bClass}`;
    badgeEl.innerText = cand.status || '-';
  }

  // Populate Target Districts
  const distSelect = document.getElementById('subTargetDistrict');
  if (distSelect) {
    distSelect.innerHTML = '<option value="">-- ជ្រើសរើសស្រុក --</option>';
    state.districts.forEach(d => {
      distSelect.innerHTML += `<option value="${d.name}">${d.name}</option>`;
    });
    distSelect.value = cand.district || '';
    onSubDistrictChange(cand.district || '');
  }

  // Populate Target Role
  const roleSelect = document.getElementById('subTargetRole');
  if (roleSelect) {
    roleSelect.value = cand.roleCode || 'c';
  }

  // Pre-fill notes
  document.getElementById('subNotes').value = cand.notes || `ជំនួសមកពី${cand.communeName || ''}`;

  // Default to transfer mode
  const transferRadio = document.getElementById('subModeTransfer');
  if (transferRadio) transferRadio.checked = true;
  toggleSubstituteMode('transfer');

  modal.style.display = 'flex';
}

function closeSubstituteModal() {
  const modal = document.getElementById('substituteModal');
  if (modal) modal.style.display = 'none';
}

function toggleSubstituteMode(mode) {
  const transferSec = document.getElementById('subTransferSection');
  const keepSec = document.getElementById('subKeepSection');
  const subTargetDistrict = document.getElementById('subTargetDistrict');
  const subTargetCommune = document.getElementById('subTargetCommune');

  if (mode === 'transfer') {
    if (transferSec) transferSec.style.display = 'block';
    if (keepSec) keepSec.style.display = 'none';
    if (subTargetDistrict) subTargetDistrict.required = true;
    if (subTargetCommune) subTargetCommune.required = true;
  } else {
    if (transferSec) transferSec.style.display = 'none';
    if (keepSec) keepSec.style.display = 'block';
    if (subTargetDistrict) subTargetDistrict.required = false;
    if (subTargetCommune) subTargetCommune.required = false;
  }
}

function onSubDistrictChange(distName) {
  const commSelect = document.getElementById('subTargetCommune');
  if (!commSelect) return;
  commSelect.innerHTML = '<option value="">-- ជ្រើសរើសឃុំ --</option>';

  const filteredCommunes = state.communes.filter(c => !distName || c.district === distName);
  filteredCommunes.forEach(c => {
    commSelect.innerHTML += `<option value="${c.code}">${c.name} (${c.code})</option>`;
  });
}

async function handleSubstituteSubmit(e) {
  e.preventDefault();
  const candId = document.getElementById('subCandId').value;
  if (!candId) return;

  const mode = document.querySelector('input[name="subMode"]:checked')?.value || 'transfer';
  const notes = document.getElementById('subNotes').value.trim();

  let payload = {};
  if (mode === 'keep') {
    const keepStatus = document.getElementById('subKeepStatus').value;
    payload = {
      keepOriginal: true,
      newStatus: keepStatus,
      notes: notes
    };
  } else {
    const targetDistrict = document.getElementById('subTargetDistrict').value;
    const targetCommuneCode = document.getElementById('subTargetCommune').value;
    const targetRoleCode = document.getElementById('subTargetRole').value;
    const newStatus = document.getElementById('subNewStatus').value;

    if (!targetCommuneCode) {
      return alert('សូមជ្រើសរើសឃុំ/សង្កាត់គោលដៅ!');
    }

    payload = {
      keepOriginal: false,
      targetDistrict,
      targetCommuneCode,
      targetRoleCode,
      newStatus,
      notes: notes
    };
  }

  const submitBtn = document.getElementById('subSubmitBtn');
  if (submitBtn) submitBtn.disabled = true;

  try {
    const res = await api(`/api/candidates/${candId}/substitute`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    if (res.success) {
      showToast(res.message, 'success');
      closeSubstituteModal();
      const candRes = await api('/api/candidates');
      if (candRes.success) {
        state.candidates = candRes.candidates;
        renderCandidatesTable();
        renderTabulationSheet();
        renderResultsSheet();
        updateDashboardKPIs();
      }
    } else {
      showToast(res.message || 'ប្រតិបត្តិការមិនបានសម្រេច!', 'error');
    }
  } catch (err) {
    showToast(err.message || 'មានបញ្ហាក្នុងការភ្ជាប់ទៅកាន់ប្រព័ន្ធ!', 'error');
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

// ==============================================================================
// OFFICIAL REPORT PRINT HANDLER (កំណត់ទម្រង់ក្រដាស A4 ផ្តេក ឬ បញ្ឈរ ស្វ័យប្រវត្តិ)
// ==============================================================================
function setPrintOrientation(orientation) {
  let styleEl = document.getElementById('printPageOrientationStyle');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'printPageOrientationStyle';
    document.head.appendChild(styleEl);
  }
  const isLandscape = orientation === 'landscape';
  styleEl.innerHTML = `
    @page {
      size: A4 ${isLandscape ? 'landscape' : 'portrait'};
      margin: ${isLandscape ? '10mm 8mm 14mm 8mm' : '12mm 10mm 15mm 10mm'};
      @bottom-center {
        content: "-" counter(page, khmer) "-";
        font-family: 'Khmer OS Siemreap', 'Siemreap', sans-serif;
        font-size: 9pt;
        font-weight: normal;
        color: #000000;
      }
    }
  `;
}

function printOfficialReport(orientation) {
  const target = orientation || (state.activeTab === 'results' ? 'portrait' : 'landscape');
  document.body.classList.remove('print-portrait', 'print-landscape');
  document.body.classList.add(target === 'portrait' ? 'print-portrait' : 'print-landscape');
  setPrintOrientation(target);

  // Clear any corrupted elements or toast notifications so they NEVER print
  purgeAllCorruptedDOMElements();

  if (typeof closeInstModal === 'function') closeInstModal();
  if (typeof closeUserModal === 'function') closeUserModal();
  if (typeof closeCandidateModal === 'function') closeCandidateModal();
  if (typeof closeSubstituteModal === 'function') closeSubstituteModal();

  setTimeout(() => {
    purgeAllCorruptedDOMElements();
    window.print();
  }, 60);
}

window.addEventListener('beforeprint', () => {
  purgeAllCorruptedDOMElements();
});



