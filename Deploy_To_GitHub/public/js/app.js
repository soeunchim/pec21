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

  const cTable = document.getElementById('codesTable');
  if (cTable) cTable.addEventListener('paste', handleCodesTablePaste);
  const cBody = document.getElementById('codesTableBody');
  if (cBody) cBody.addEventListener('paste', handleCodesTablePaste);


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
        renderTabulationSheet();
      } else if (tabId === 'results') {
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
        openActivateAccountModal(res.username);
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
function openActivateAccountModal(prefillUsername = '') {
  hideLoginModal();
  const modal = document.getElementById('activateModal');
  if (modal) modal.classList.add('active');

  const errDiv = document.getElementById('activateError');
  if (errDiv) errDiv.style.display = 'none';

  const uInput = document.getElementById('activateUsername');
  if (uInput) {
    if (prefillUsername) {
      uInput.value = prefillUsername;
    }
  }

  const pDef = document.getElementById('activateDefaultPassword');
  if (pDef) pDef.value = 'pec21';

  const p1 = document.getElementById('newActivatePassword');
  if (p1) p1.value = '';
  const p2 = document.getElementById('confirmActivatePassword');
  if (p2) p2.value = '';
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
    const [distRes, commRes, candRes, statsRes, codesRes] = await Promise.all([
      api('/api/districts'),
      api('/api/communes'),
      api('/api/candidates'),
      api('/api/stats'),
      api('/api/codes')
    ]);

    state.districts = distRes.districts || [];
    state.communes = commRes.communes || [];
    state.candidates = candRes.candidates || [];
    state.stats = statsRes;
    state.codes = codesRes.codes || [];

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
          <th>ឈ្មោះ</th>
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
          <th>ឈ្មោះ</th>
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
          <th>ឈ្មោះ</th>
          <th>គោត្តនាម និងនាម</th>
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
          <th>ឈ្មោះ</th>
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
          <th>ឈ្មោះ</th>
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
          <th>ឈ្មោះ</th>
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
          <th>ឈ្មោះ</th>
          <th>គោត្តនាម និងនាម</th>
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
          <th>ឈ្មោះ</th>
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

function renderCandidatesTable() {
  const tbody = document.getElementById('candidatesTableBody');
  if (!tbody) return;

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
          <button class="btn btn-secondary btn-sm" title="លុប" style="color:var(--danger); padding:3px 7px;" onclick="deleteCandidate('${c.id}')">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      `
    ) : '-';

    if (isTrainer) {
      // =====================================================================
      // គណនីគ្រូស្រុក៖ មិនបង្ហាញកូដ, មិនបង្ហាញ QCM/PC, មិនបង្ហាញលទ្ធផល
      // ជួរឈរ (សរុប) = ស.បត្រ + ប.ពិ ប៉ុណ្ណោះ
      // =====================================================================
      if (currentRole === 'a' || currentRole === 'b') {
        // ប្រធាន និង ជំនួយការអនុ
        rows.push(`
          <tr id="row-${c.id}">
            <td style="text-align:center; font-weight:600; color:var(--gray-500);">${idx + 1}</td>
            <td style="font-weight:600; white-space:nowrap;">${c.name}</td>
            <td style="text-align:center; font-weight:600;">${c.gender}</td>
            <td style="text-align:center; font-family:monospace; font-size:0.9rem;" class="${isFlaggedDob ? 'cell-flagged-red' : ''}">${c.dob || '-'}</td>
            <td style="text-align:center;">
              <input type="number" class="score-input" min="0" max="5" style="width:55px; text-align:center;" value="${c.scoreDegree}" onchange="updateScore('${c.id}', 'scoreDegree', this.value)">
            </td>
            <td style="text-align:center;">
              <input type="number" class="score-input" min="0" max="15" style="width:55px; text-align:center;" value="${c.scoreExp}" onchange="updateScore('${c.id}', 'scoreExp', this.value)">
            </td>
            <td style="text-align:center; font-weight:700; font-size:1.05rem; color:var(--primary);">
              <span id="total-${c.id}">${trainerTotal}</span>
            </td>
            <td style="text-align:center; font-family:monospace; font-weight:600; color:var(--gray-600);">${c.communeCode || '-'}</td>
            <td style="white-space:nowrap;">${c.communeName || '-'}</td>
            <td style="white-space:nowrap; color:var(--gray-700);">${c.district || '-'}</td>
            <td style="text-align:center;">${actionButtons}</td>
          </tr>
        `);
      } else if (currentRole === 'c') {
        // ការីកុំព្យូទ័រ
        rows.push(`
          <tr id="row-${c.id}">
            <td style="text-align:center; font-weight:600; color:var(--gray-500);">${idx + 1}</td>
            <td style="font-weight:600; white-space:nowrap;">${c.name}</td>
            <td style="text-align:center; font-weight:600;">${c.gender}</td>
            <td style="text-align:center; font-family:monospace; font-size:0.9rem;" class="${isFlaggedDob ? 'cell-flagged-red' : ''}">${c.dob || '-'}</td>
            <td style="text-align:center;">
              <input type="number" class="score-input" min="0" max="15" style="width:55px; text-align:center;" value="${c.scoreExp}" onchange="updateScore('${c.id}', 'scoreExp', this.value)">
            </td>
            <td style="text-align:center; font-weight:700; font-size:1.05rem; color:var(--primary);">
              <span id="total-${c.id}">${exp}</span>
            </td>
            <td style="text-align:center; font-family:monospace; font-weight:600; color:var(--gray-600);">${c.communeCode || '-'}</td>
            <td style="white-space:nowrap;">${c.communeName || '-'}</td>
            <td style="white-space:nowrap; color:var(--gray-700);">${c.district || '-'}</td>
            <td style="text-align:center;">${actionButtons}</td>
          </tr>
        `);
      } else if (currentRole === 'd') {
        // អនុប្រធាន (ស្មៀន)
        rows.push(`
          <tr id="row-${c.id}">
            <td style="text-align:center; font-weight:600; color:var(--gray-500);">${idx + 1}</td>
            <td style="font-weight:600; white-space:nowrap;">${c.name}</td>
            <td style="white-space:nowrap; color:var(--gray-700);">${c.name} (ស្មៀនឃុំ)</td>
            <td style="text-align:center; font-weight:600;">${c.gender}</td>
            <td style="text-align:center; font-family:monospace; font-size:0.9rem;" class="${isFlaggedDob ? 'cell-flagged-red' : ''}">${c.dob || '-'}</td>
            <td style="white-space:nowrap; color:var(--primary); font-weight:600;">${c.role}</td>
            <td style="text-align:center; font-family:monospace; font-weight:600; color:var(--gray-600);">${c.communeCode || '-'}</td>
            <td style="white-space:nowrap;">${c.communeName || '-'}</td>
            <td style="white-space:nowrap; color:var(--gray-700);">${c.district || '-'}</td>
            <td style="text-align:center;">${actionButtons}</td>
          </tr>
        `);
      } else {
        // គ្រប់មុខតំណែង
        rows.push(`
          <tr id="row-${c.id}">
            <td style="text-align:center; font-weight:600; color:var(--gray-500);">${idx + 1}</td>
            <td style="font-weight:600; white-space:nowrap;">${c.name}</td>
            <td style="text-align:center; font-weight:600;">${c.gender}</td>
            <td style="text-align:center; font-family:monospace; font-size:0.9rem;" class="${isFlaggedDob ? 'cell-flagged-red' : ''}">${c.dob || '-'}</td>
            <td style="text-align:center;">
              ${(c.roleCode === 'd' || c.roleCode === 'c') ? '-' : `
                <input type="number" class="score-input" min="0" max="5" style="width:55px; text-align:center;" value="${c.scoreDegree}" onchange="updateScore('${c.id}', 'scoreDegree', this.value)">
              `}
            </td>
            <td style="text-align:center;">
              ${c.roleCode === 'd' ? '-' : `
                <input type="number" class="score-input" min="0" max="15" style="width:55px; text-align:center;" value="${c.scoreExp}" onchange="updateScore('${c.id}', 'scoreExp', this.value)">
              `}
            </td>
            <td style="text-align:center; font-weight:700; font-size:1.05rem; color:var(--primary);">
              <span id="total-${c.id}">${c.roleCode === 'd' ? '-' : (c.roleCode === 'c' ? exp : trainerTotal)}</span>
            </td>
            <td style="text-align:center; font-family:monospace; font-weight:600; color:var(--gray-600);">${c.communeCode || '-'}</td>
            <td style="white-space:nowrap;">${c.communeName || '-'}</td>
            <td style="white-space:nowrap; color:var(--gray-700);">${c.district || '-'}</td>
            <td style="text-align:center;">${actionButtons}</td>
          </tr>
        `);
      }
    } else {
      // =====================================================================
      // គណនី Admin / SuperAdmin / PEC21៖ បង្ហាញគ្រប់ ១៥ ជួរឈរពេញលេញ
      // =====================================================================
      let badgeClass = 'badge-passed';
      if (c.status === 'B-បម្រុង') badgeClass = 'badge-reserve';
      if (c.status === 'ធ្លាក់') badgeClass = 'badge-failed';
      if (c.status === 'អវត្តមាន') badgeClass = 'badge-absent';

      const resultCell = `
        <td style="text-align:center;">
          <span id="status-${c.id}" class="badge ${badgeClass}">${c.status}</span>
        </td>
      `;

      const codeCell = `
        <input type="text" class="score-input" list="codesDatalist" style="width:85px; text-transform:uppercase; font-family:monospace; font-weight:700; text-align:center;" value="${c.candidateCode || ''}" placeholder="កូដ..." onchange="updateCandidateCodeInline('${c.id}', this.value)">
      `;

      if (currentRole === 'a' || currentRole === 'b') {
        rows.push(`
          <tr id="row-${c.id}">
            <td style="text-align:center; font-weight:600; color:var(--gray-500);">${idx + 1}</td>
            <td style="text-align:center;">${codeCell}</td>
            <td style="font-weight:600; white-space:nowrap;">${c.name}</td>
            <td style="text-align:center; font-weight:600;">${c.gender}</td>
            <td style="text-align:center; font-family:monospace; font-size:0.9rem;" class="${isFlaggedDob ? 'cell-flagged-red' : ''}">${c.dob || '-'}</td>
            <td style="text-align:center;">
              <input type="number" class="score-input" min="0" max="5" style="width:55px; text-align:center;" value="${c.scoreDegree}" onchange="updateScore('${c.id}', 'scoreDegree', this.value)">
            </td>
            <td style="text-align:center;">
              <input type="number" class="score-input" min="0" max="15" style="width:55px; text-align:center;" value="${c.scoreExp}" onchange="updateScore('${c.id}', 'scoreExp', this.value)">
            </td>
            <td style="text-align:center;">
              <input type="text" id="qcm-input-${c.id}" class="score-input" style="width:70px; text-align:center; font-weight:600;" value="${c.scoreQcm}" onchange="updateScore('${c.id}', 'scoreQcm', this.value)">
            </td>
            <td class="col-shaded-excel"></td>
            <td style="text-align:center; font-weight:700; font-size:1.05rem; color:var(--primary);">
              <span id="total-${c.id}">${c.scoreTotal}</span>
            </td>
            <td style="text-align:center; font-family:monospace; font-weight:600; color:var(--gray-600);">${c.communeCode || '-'}</td>
            <td style="white-space:nowrap;">${c.communeName || '-'}</td>
            <td style="white-space:nowrap; color:var(--gray-700);">${c.district || '-'}</td>
            ${resultCell}
            <td style="text-align:center;">${actionButtons}</td>
          </tr>
        `);
      } else if (currentRole === 'd') {
        rows.push(`
          <tr id="row-${c.id}">
            <td style="text-align:center; font-weight:600; color:var(--gray-500);">${idx + 1}</td>
            <td style="font-weight:600; white-space:nowrap;">${c.name}</td>
            <td style="white-space:nowrap; color:var(--gray-700);">${c.name} (ស្មៀនឃុំ)</td>
            <td style="text-align:center; font-weight:600;">${c.gender}</td>
            <td style="text-align:center; font-family:monospace; font-size:0.9rem;" class="${isFlaggedDob ? 'cell-flagged-red' : ''}">${c.dob || '-'}</td>
            <td style="white-space:nowrap; color:var(--primary); font-weight:600;">${c.role}</td>
            <td style="text-align:center; font-family:monospace; font-weight:600; color:var(--gray-600);">${c.communeCode || '-'}</td>
            <td style="white-space:nowrap;">${c.communeName || '-'}</td>
            <td style="white-space:nowrap; color:var(--gray-700);">${c.district || '-'}</td>
            ${resultCell}
            <td style="text-align:center;">${actionButtons}</td>
          </tr>
        `);
      } else if (currentRole === 'c') {
        rows.push(`
          <tr id="row-${c.id}">
            <td style="text-align:center; font-weight:600; color:var(--gray-500);">${idx + 1}</td>
            <td style="text-align:center;">${codeCell}</td>
            <td style="font-weight:600; white-space:nowrap;">${c.name}</td>
            <td style="text-align:center; font-weight:600;">${c.gender}</td>
            <td style="text-align:center; font-family:monospace; font-size:0.9rem;" class="${isFlaggedDob ? 'cell-flagged-red' : ''}">${c.dob || '-'}</td>
            <td class="col-shaded-excel"></td>
            <td style="text-align:center;">
              <input type="number" class="score-input" min="0" max="15" style="width:55px; text-align:center;" value="${c.scoreExp}" onchange="updateScore('${c.id}', 'scoreExp', this.value)">
            </td>
            <td class="col-shaded-excel"></td>
            <td style="text-align:center;">
              <input type="text" class="score-input" style="width:70px; text-align:center; font-weight:600;" value="${c.scorePc}" onchange="updateScore('${c.id}', 'scorePc', this.value)">
            </td>
            <td style="text-align:center; font-weight:700; font-size:1.05rem; color:var(--primary);">
              <span id="total-${c.id}">${c.scoreTotal}</span>
            </td>
            <td style="text-align:center; font-family:monospace; font-weight:600; color:var(--gray-600);">${c.communeCode || '-'}</td>
            <td style="white-space:nowrap;">${c.communeName || '-'}</td>
            <td style="white-space:nowrap; color:var(--gray-700);">${c.district || '-'}</td>
            ${resultCell}
            <td style="text-align:center;">${actionButtons}</td>
          </tr>
        `);
      } else {
        rows.push(`
          <tr id="row-${c.id}">
            <td style="text-align:center; font-weight:600; color:var(--gray-500);">${idx + 1}</td>
            <td style="text-align:center;">${codeCell}</td>
            <td style="font-weight:600; white-space:nowrap;">${c.name}</td>
            <td style="text-align:center; font-weight:600;">${c.gender}</td>
            <td style="text-align:center; font-family:monospace; font-size:0.9rem;" class="${isFlaggedDob ? 'cell-flagged-red' : ''}">${c.dob || '-'}</td>
            ${(isClerk || isPc) ? '<td class="col-shaded-excel"></td>' : `
              <td style="text-align:center;">
                <input type="number" class="score-input" min="0" max="5" style="width:55px; text-align:center;" value="${c.scoreDegree}" onchange="updateScore('${c.id}', 'scoreDegree', this.value)">
              </td>
            `}
            ${isClerk ? '<td class="col-shaded-excel"></td>' : `
              <td style="text-align:center;">
                <input type="number" class="score-input" min="0" max="15" style="width:55px; text-align:center;" value="${c.scoreExp}" onchange="updateScore('${c.id}', 'scoreExp', this.value)">
              </td>
            `}
            ${(isClerk || isPc) ? '<td class="col-shaded-excel"></td>' : `
              <td style="text-align:center;">
                <input type="text" id="qcm-input-${c.id}" class="score-input" style="width:70px; text-align:center; font-weight:600;" value="${c.scoreQcm}" onchange="updateScore('${c.id}', 'scoreQcm', this.value)">
              </td>
            `}
            ${isPc ? `
              <td style="text-align:center;">
                <input type="text" class="score-input" style="width:70px; text-align:center; font-weight:600;" value="${c.scorePc}" onchange="updateScore('${c.id}', 'scorePc', this.value)">
              </td>
            ` : '<td class="col-shaded-excel"></td>'}
            <td style="text-align:center; font-weight:700; font-size:1.05rem; color:var(--primary);">
              <span id="total-${c.id}">${c.scoreTotal}</span>
            </td>
            <td style="text-align:center; font-family:monospace; font-weight:600; color:var(--gray-600);">${c.communeCode || '-'}</td>
            <td style="white-space:nowrap;">${c.communeName || '-'}</td>
            <td style="white-space:nowrap; color:var(--gray-700);">${c.district || '-'}</td>
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

async function updateScore(candId, field, value) {
  const cand = state.candidates.find(c => c.id === candId);
  if (!cand) return;

  const payload = {};
  payload[field] = value;

  try {
    const res = await api(`/api/candidates/${candId}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });

    if (res.success) {
      // Reload candidates and refresh view
      const candRes = await api('/api/candidates');
      state.candidates = candRes.candidates;

      // Update specific row badges
      const updated = state.candidates.find(c => c.id === candId);
      if (updated) {
        const isTrainer = state.user && state.user.role === 'Trainer';
        const deg = Number(updated.scoreDegree) || 0;
        const exp = Number(updated.scoreExp) || 0;
        const totEl = document.getElementById(`total-${candId}`);
        if (totEl) {
          totEl.textContent = isTrainer ? (updated.roleCode === 'c' ? exp : (deg + exp)) : updated.scoreTotal;
        }
        const rkEl = document.getElementById(`rank-${candId}`);
        if (rkEl) rkEl.textContent = updated.rank;
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
      showToast(`បានកែសម្រួលពិន្ទុ ${cand.name} រួចរាល់!`, 'success');
    }
  } catch (err) {
    showToast(err.message || 'បរាជ័យក្នុងការកែសម្រួលពិន្ទុ!', 'error');
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
// 3. OFFICIAL TABULATION REPORT (PRINT-READY)
// ==============================================================================
function renderTabulationSheet() {
  const districtName = state.tabReport.district || state.districts[0].name;
  const communeCode = state.tabReport.communeCode;

  document.getElementById('tabReportDistrictTitle').textContent = `ស្រុក${districtName} នៃខេត្តតាកែវ`;

  let communesInDist = state.communes.filter(k => k.district === districtName);
  if (communeCode && communeCode !== 'all') {
    communesInDist = communesInDist.filter(k => k.code === communeCode);
  }

  const container = document.getElementById('tabulationTableContainer');
  container.innerHTML = '';

  communesInDist.forEach(comm => {
    const commCands = state.candidates.filter(c => c.communeCode === comm.code);

    let html = `
      <div style="margin-bottom:25px; page-break-inside:avoid;">
        <div style="font-weight:700; font-size:0.95rem; margin-bottom:6px; color:var(--primary);">
          ${comm.fullName || comm.name}
        </div>
        <table class="paper-table">
          <thead>
            <tr>
              <th rowspan="2" style="width:35px;">ល.រ</th>
              <th rowspan="2">គោត្តនាម និងនាម</th>
              <th rowspan="2" style="width:40px;">ភេទ</th>
              <th rowspan="2" style="width:90px;">ថ្ងៃ ខែ ឆ្នាំកំណើត</th>
              <th colspan="4">ពិន្ទុ</th>
              <th rowspan="2" style="width:60px;">សរុបពិន្ទុ</th>
              <th rowspan="2" style="width:65px;">ចំណាត់ថ្នាក់</th>
              <th rowspan="2" style="width:75px;">លទ្ធផល</th>
            </tr>
            <tr>
              <th style="width:60px;">សញ្ញាបត្រ</th>
              <th style="width:65px;">បទពិសោធន៍</th>
              <th style="width:75px;">សរសេរ QCM</th>
              <th style="width:80px;">ធ្វើតេស្តកុំព្យូទ័រ</th>
            </tr>
          </thead>
          <tbody>
    `;

    // 1. ប្រធាន
    const prathanList = commCands.filter(c => c.roleCode === 'a');
    html += `
      <tr style="background:#F1F5F9; font-weight:700;">
        <td style="text-align:center;">I</td>
        <td colspan="10" style="text-align:left; padding-left:10px;">មុខតំណែងប្រធាន ក.ច.ប</td>
      </tr>
    `;
    if (prathanList.length === 0) {
      html += `<tr><td colspan="11" style="text-align:center; color:#94A3B8;">(គ្មានបេក្ខជន)</td></tr>`;
    } else {
      prathanList.forEach((c, idx) => {
        html += `
          <tr>
            <td>${idx + 1}</td>
            <td style="text-align:left; padding-left:8px; font-weight:600;">${c.name}</td>
            <td>${c.gender}</td>
            <td>${c.dob || '-'}</td>
            <td>${c.scoreDegree}</td>
            <td>${c.scoreExp}</td>
            <td>${c.scoreQcm}</td>
            <td>-</td>
            <td style="font-weight:700;">${c.scoreTotal}</td>
            <td>${c.rank}</td>
            <td style="font-weight:700;">${c.status}</td>
          </tr>
        `;
      });
    }

    // 2. ការីកុំព្យូទ័រ
    const pcList = commCands.filter(c => c.roleCode === 'c');
    html += `
      <tr style="background:#F1F5F9; font-weight:700;">
        <td style="text-align:center;">II</td>
        <td colspan="10" style="text-align:left; padding-left:10px;">មុខតំណែងសមាជិក ក.ច.ប ជាការីកុំព្យូទ័រ</td>
      </tr>
    `;
    if (pcList.length === 0) {
      html += `<tr><td colspan="11" style="text-align:center; color:#94A3B8;">(គ្មានបេក្ខជន)</td></tr>`;
    } else {
      pcList.forEach((c, idx) => {
        html += `
          <tr>
            <td>${idx + 1}</td>
            <td style="text-align:left; padding-left:8px; font-weight:600;">${c.name}</td>
            <td>${c.gender}</td>
            <td>${c.dob || '-'}</td>
            <td>-</td>
            <td>${c.scoreExp}</td>
            <td>-</td>
            <td>${c.scorePc}</td>
            <td style="font-weight:700;">${c.scoreTotal}</td>
            <td>${c.rank}</td>
            <td style="font-weight:700;">${c.status}</td>
          </tr>
        `;
      });
    }

    // 3. ជំនួយការអនុ
    const jumList = commCands.filter(c => c.roleCode === 'b');
    if (jumList.length > 0) {
      html += `
        <tr style="background:#F1F5F9; font-weight:700;">
          <td style="text-align:center;">III</td>
          <td colspan="10" style="text-align:left; padding-left:10px;">មុខតំណែងសមាជិក ក.ច.ប ដែលជួយការងារអនុប្រធាន ក.ច.ប</td>
        </tr>
      `;
      jumList.forEach((c, idx) => {
        html += `
          <tr>
            <td>${idx + 1}</td>
            <td style="text-align:left; padding-left:8px; font-weight:600;">${c.name}</td>
            <td>${c.gender}</td>
            <td>${c.dob || '-'}</td>
            <td>${c.scoreDegree}</td>
            <td>${c.scoreExp}</td>
            <td>${c.scoreQcm}</td>
            <td>-</td>
            <td style="font-weight:700;">${c.scoreTotal}</td>
            <td>${c.rank}</td>
            <td style="font-weight:700;">${c.status}</td>
          </tr>
        `;
      });
    }

    html += `
          </tbody>
        </table>
      </div>
    `;
    container.innerHTML += html;
  });
}

// ==============================================================================
// 4. OFFICIAL RESULTS REPORT
// ==============================================================================
function renderResultsSheet() {
  const districtName = state.resultReport.district || state.districts[0].name;
  const communeCode = state.resultReport.communeCode;

  document.getElementById('resultReportDistrictTitle').textContent = `ស្រុក${districtName} នៃខេត្តតាកែវ`;

  let communesInDist = state.communes.filter(k => k.district === districtName);
  if (communeCode && communeCode !== 'all') {
    communesInDist = communesInDist.filter(k => k.code === communeCode);
  }

  const container = document.getElementById('resultsTableContainer');
  container.innerHTML = '';

  communesInDist.forEach(comm => {
    const commCands = state.candidates.filter(c => c.communeCode === comm.code);

    let html = `
      <div style="margin-bottom:25px; page-break-inside:avoid;">
        <div style="font-weight:700; font-size:0.95rem; margin-bottom:6px; color:var(--primary);">
          ${comm.fullName || comm.name}
        </div>
        <table class="paper-table">
          <thead>
            <tr>
              <th style="width:40px;">ល.រ</th>
              <th>គោត្តនាម និងនាម</th>
              <th style="width:45px;">ភេទ</th>
              <th style="width:95px;">ថ្ងៃ ខែ ឆ្នាំកំណើត</th>
              <th style="width:65px;">សរុបពិន្ទុ</th>
              <th style="width:70px;">ចំណាត់ថ្នាក់</th>
              <th style="width:85px;">លទ្ធផល</th>
            </tr>
          </thead>
          <tbody>
    `;

    // ប្រធាន
    const prathanList = commCands.filter(c => c.roleCode === 'a');
    html += `
      <tr style="background:#F1F5F9; font-weight:700;">
        <td style="text-align:center;">I</td>
        <td colspan="6" style="text-align:left; padding-left:10px;">មុខតំណែងប្រធាន ក.ច.ប</td>
      </tr>
    `;
    prathanList.forEach((c, idx) => {
      html += `
        <tr>
          <td>${idx + 1}</td>
          <td style="text-align:left; padding-left:8px; font-weight:600;">${c.name}</td>
          <td>${c.gender}</td>
          <td>${c.dob || '-'}</td>
          <td style="font-weight:700;">${c.scoreTotal}</td>
          <td>${c.rank}</td>
          <td style="font-weight:700;">${c.status}</td>
        </tr>
      `;
    });

    // ការី
    const pcList = commCands.filter(c => c.roleCode === 'c');
    html += `
      <tr style="background:#F1F5F9; font-weight:700;">
        <td style="text-align:center;">II</td>
        <td colspan="6" style="text-align:left; padding-left:10px;">មុខតំណែងសមាជិក ក.ច.ប ជាការីកុំព្យូទ័រ</td>
      </tr>
    `;
    pcList.forEach((c, idx) => {
      html += `
        <tr>
          <td>${idx + 1}</td>
          <td style="text-align:left; padding-left:8px; font-weight:600;">${c.name}</td>
          <td>${c.gender}</td>
          <td>${c.dob || '-'}</td>
          <td style="font-weight:700;">${c.scoreTotal}</td>
          <td>${c.rank}</td>
          <td style="font-weight:700;">${c.status}</td>
        </tr>
      `;
    });

    // ជំនួយការអនុ
    const jumList = commCands.filter(c => c.roleCode === 'b');
    if (jumList.length > 0) {
      html += `
        <tr style="background:#F1F5F9; font-weight:700;">
          <td style="text-align:center;">III</td>
          <td colspan="6" style="text-align:left; padding-left:10px;">មុខតំណែងសមាជិក ក.ច.ប ដែលជួយការងារអនុប្រធាន ក.ច.ប</td>
        </tr>
      `;
      jumList.forEach((c, idx) => {
        html += `
          <tr>
            <td>${idx + 1}</td>
            <td style="text-align:left; padding-left:8px; font-weight:600;">${c.name}</td>
            <td>${c.gender}</td>
            <td>${c.dob || '-'}</td>
            <td style="font-weight:700;">${c.scoreTotal}</td>
            <td>${c.rank}</td>
            <td style="font-weight:700;">${c.status}</td>
          </tr>
        `;
      });
    }

    html += `
          </tbody>
        </table>
      </div>
    `;
    container.innerHTML += html;
  });
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
function downloadBackup() {
  window.open('/api/backup', '_blank');
  showToast('បានទាញយកឯកសារបម្រុងទុក!', 'success');
}

function exportExcelCsv() {
  window.open('/api/export-csv', '_blank');
  showToast('បានទាញយកឯកសារ CSV/Excel រួចរាល់!', 'success');
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
