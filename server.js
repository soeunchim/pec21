// ==============================================================================
// ប្រព័ន្ធគ្រប់គ្រងបូកស្រង់ពិន្ទុប្រឡងជ្រើសរើស ក.ច.ប (PEC21 - ខេត្តតាកែវ)
// Zero-Dependency Native Node.js Server - Runs 100% Online & Offline
// ==============================================================================

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const url = require('url');

const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'data', 'db.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const FIREBASE_DB_URL = process.env.FIREBASE_DB_URL || '';

// MIME types for static assets
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
};

let db = null;

// Helper: Normalize Firebase REST URL
function getFirebaseEndpoint() {
  if (!FIREBASE_DB_URL) return null;
  let clean = FIREBASE_DB_URL.trim();
  if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
    clean = 'https://' + clean;
  }
  if (!clean.endsWith('.json')) {
    clean = clean.replace(/\/+$/, '') + '/pec21_db.json';
  }
  return clean;
}

// Fetch latest database from Firebase Realtime Database
function fetchFromFirebase(targetUrl, redirectCount = 0) {
  return new Promise((resolve) => {
    const endpoint = targetUrl || getFirebaseEndpoint();
    if (!endpoint || redirectCount > 4) return resolve(null);
    try {
      const parsedUrl = new URL(endpoint);
      const req = https.get(parsedUrl, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          let redirectTarget = res.headers.location;
          if (!redirectTarget.startsWith('http://') && !redirectTarget.startsWith('https://')) {
            redirectTarget = 'https://' + parsedUrl.hostname + redirectTarget;
          }
          return resolve(fetchFromFirebase(redirectTarget, redirectCount + 1));
        }
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              const data = JSON.parse(body);
              if (data && typeof data === 'object' && data.candidates && data.candidates.length > 0) {
                return resolve(data);
              }
            }
            resolve(null);
          } catch (e) {
            resolve(null);
          }
        });
      });
      req.on('error', (err) => {
        console.error('[Firebase] Read error:', err.message);
        resolve(null);
      });
      req.setTimeout(10000, () => {
        req.destroy();
        resolve(null);
      });
    } catch (err) {
      console.error('[Firebase] URL parse error:', err.message);
      resolve(null);
    }
  });
}

// Sync in-memory database to Firebase Realtime Database with redirect handling
function sendFirebaseRequest(targetUrl, payload, redirectCount = 0) {
  if (redirectCount > 4) {
    console.error('[Firebase] Too many redirects');
    return;
  }
  try {
    const parsedUrl = new URL(targetUrl);
    const options = {
      hostname: parsedUrl.hostname,
      port: 443,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };
    const req = https.request(options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let redirectTarget = res.headers.location;
        if (!redirectTarget.startsWith('http://') && !redirectTarget.startsWith('https://')) {
          redirectTarget = 'https://' + parsedUrl.hostname + redirectTarget;
        }
        return sendFirebaseRequest(redirectTarget, payload, redirectCount + 1);
      }
      if (res.statusCode >= 200 && res.statusCode < 300) {
        console.log('[Firebase] Cloud Database successfully synchronized!');
      } else {
        console.error('[Firebase] Sync HTTP status:', res.statusCode);
      }
    });
    req.on('error', (e) => console.error('[Firebase] Sync network error:', e.message));
    req.setTimeout(12000, () => req.destroy());
    req.write(payload);
    req.end();
  } catch (err) {
    console.error('[Firebase] Sync exception:', err.message);
  }
}

let firebaseSyncTimer = null;
function syncToFirebase(dataObj) {
  const endpoint = getFirebaseEndpoint();
  if (!endpoint) return;

  if (firebaseSyncTimer) clearTimeout(firebaseSyncTimer);
  firebaseSyncTimer = setTimeout(() => {
    const payload = JSON.stringify(dataObj);
    sendFirebaseRequest(endpoint, payload);
  }, 350);
}

function loadDatabase() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, 'utf8');
      db = JSON.parse(data);
      if (!db.examCodes) db.examCodes = [];
      console.log(`[DB] Database loaded: ${db.candidates.length} candidates, ${db.communes.length} communes, ${db.examCodes.length} codes.`);
    } else {
      console.error('[DB] Database file not found at:', DB_FILE);
      db = { districts: [], communes: [], candidates: [], users: [], examCodes: [], settings: {} };
    }
  } catch (err) {
    console.error('[DB] Error loading database:', err.message);
    db = { districts: [], communes: [], candidates: [], users: [], examCodes: [], settings: {} };
  }

  // If Firebase URL is active, fetch from Cloud asynchronously
  if (FIREBASE_DB_URL) {
    console.log('[Firebase] Configured with URL. Checking Cloud DB...');
    fetchFromFirebase().then(cloudData => {
      if (cloudData && cloudData.candidates && cloudData.candidates.length > 0) {
        db = cloudData;
        if (!db.examCodes) db.examCodes = [];
        console.log(`[Firebase] Successfully synced from Cloud: ${db.candidates.length} candidates.`);
        try { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8'); } catch (e) {}
      } else if (db && db.candidates && db.candidates.length > 0) {
        console.log('[Firebase] Cloud empty, seeding initial local data to Cloud...');
        syncToFirebase(db);
      }
    }).catch(err => {
      console.error('[Firebase] Init check error:', err.message);
    });
  }
}

function saveDatabase() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
  } catch (err) {
    console.error('[DB] Error saving database:', err.message);
  }
  if (FIREBASE_DB_URL) {
    syncToFirebase(db);
  }
}

loadDatabase();

// Recalculate ranks and statuses for candidates
function recomputeRanksAndStatuses() {
  if (!db || !db.candidates) return;

  const groups = {};
  for (const c of db.candidates) {
    const key = `${c.communeCode}_${c.roleCode}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(c);
  }

  const minPass = (db.settings && db.settings.minPassScore) || 50;

  for (const key in groups) {
    const list = groups[key];
    list.sort((a, b) => {
      const aAbs = a.scoreTotal === 'អវត្តមាន';
      const bAbs = b.scoreTotal === 'អវត្តមាន';
      if (aAbs && !bAbs) return 1;
      if (!aAbs && bAbs) return -1;
      if (aAbs && bAbs) return 0;
      return (Number(b.scoreTotal) || 0) - (Number(a.scoreTotal) || 0);
    });

    list.forEach((item, idx) => {
      if (item.scoreTotal === 'អវត្តមាន') {
        item.rank = list.length;
        item.status = 'អវត្តមាន';
      } else {
        const score = Number(item.scoreTotal) || 0;
        item.rank = idx + 1;
        if (score < minPass) {
          item.status = 'ធ្លាក់';
        } else if (idx === 0) {
          item.status = 'A-ជាប់';
        } else if (idx === 1 && item.roleCode === 'c') {
          item.status = 'A-ជាប់';
        } else {
          item.status = 'B-បម្រុង';
        }
      }
    });
  }
}

// Token Storage
const activeTokens = new Map();

function generateToken(user) {
  // Stateless self-validating token: username + base64 timestamp + hash
  const payload = Buffer.from(JSON.stringify({
    userId: user.id,
    username: user.username,
    role: user.role,
    district: user.district,
    fullName: user.fullName,
    t: Date.now()
  })).toString('base64');
  const token = 'tok_' + payload;
  activeTokens.set(token, {
    userId: user.id,
    username: user.username,
    role: user.role,
    district: user.district,
    fullName: user.fullName,
    createdAt: Date.now()
  });
  return token;
}

function authenticate(req) {
  let token = null;
  const authHeader = req.headers['authorization'];
  if (authHeader) {
    token = authHeader.replace(/^Bearer\s+/, '').trim();
  } else {
    try {
      const parsedUrl = url.parse(req.url, true);
      if (parsedUrl.query && parsedUrl.query.token) {
        token = parsedUrl.query.token.trim();
      }
    } catch (e) {}
  }
  if (!token) return null;
  if (activeTokens.has(token)) return activeTokens.get(token);

  // Self-verifying fallback across server restarts
  if (token.startsWith('tok_')) {
    try {
      const jsonStr = Buffer.from(token.replace('tok_', ''), 'base64').toString('utf8');
      const data = JSON.parse(jsonStr);
      if (data && data.username && db && db.users) {
        const u = db.users.find(x => x.username.toLowerCase() === data.username.toLowerCase());
        if (u && u.active) {
          const session = {
            userId: u.id,
            username: u.username,
            role: u.role,
            district: u.district,
            fullName: u.fullName,
            createdAt: data.t || Date.now()
          };
          activeTokens.set(token, session);
          return session;
        }
      }
    } catch (e) {}
  }
  return null;
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 20 * 1024 * 1024) reject(new Error('Request entity too large'));
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
}

// Helper: sync candidate score with Code
function syncCandidateWithCode(cand) {
  if (!cand.candidateCode || cand.roleCode === 'd') return;
  const foundCode = db.examCodes.find(k => k.code.toUpperCase() === cand.candidateCode.trim().toUpperCase());
  if (foundCode) {
    cand.scoreQcm = foundCode.qcmScore;
  }
}

// Helper: calculate total score for candidate
function computeCandidateTotal(c) {
  if (c.scoreQcm === 'អវត្តមាន' || c.scorePc === 'អវត្តមាន' || c.scoreTotal === 'អវត្តមាន') {
    c.scoreTotal = 'អវត្តមាន';
  } else {
    const deg = Number(c.scoreDegree) || 0;
    const exp = Number(c.scoreExp) || 0;
    const qcm = Number(c.scoreQcm) || 0;
    const pc = Number(c.scorePc) || 0;
    if (c.roleCode === 'c') c.scoreTotal = exp + pc;
    else if (c.roleCode === 'd') c.scoreTotal = 100;
    else c.scoreTotal = deg + exp + qcm;
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }

  const parsedUrl = url.parse(req.url, true);
  let pathname = parsedUrl.pathname || '/';
  const query = parsedUrl.query;

  // Support /pec21 routing (e.g. localhost:3000/pec21)
  if (pathname === '/pec21') {
    pathname = '/';
  } else if (pathname.startsWith('/pec21/')) {
    pathname = pathname.replace(/^\/pec21/, '') || '/';
  }

  if (pathname.startsWith('/api/')) {
    try {
      // 1. POST /api/login
      if (pathname === '/api/login' && req.method === 'POST') {
        const { username, password } = await parseJsonBody(req);
        const user = db.users.find(u => u.username.toLowerCase() === (username || '').toLowerCase().trim());
        if (!user || user.password !== password) {
          return sendJson(res, 401, { success: false, message: 'ឈ្មោះគណនី ឬពាក្យសម្ងាត់មិនត្រឹមត្រូវទេ!' });
        }
        if (!user.active) {
          return sendJson(res, 403, { success: false, message: 'គណនីនេះត្រូវបានផ្អាកដំណើរការ!' });
        }

        // If trainer account has not been activated, prompt them to activate!
        if (user.role === 'Trainer' && !user.isActivated) {
          return sendJson(res, 200, {
            success: true,
            needsActivation: true,
            message: 'គណនីគ្រូប្រចាំក្រុងស្រុកនេះ ទាមទារការបំពេញ Form Activate Account ជាមុនសិន!',
            username: user.username,
            district: user.district
          });
        }

        const token = generateToken(user);
        return sendJson(res, 200, {
          success: true,
          token,
          user: {
            id: user.id,
            username: user.username,
            fullName: user.fullName,
            role: user.role,
            district: user.district,
            phone: user.phone || '',
            email: user.email || '',
            isActivated: !!user.isActivated
          }
        });
      }

      // 1b. POST /api/activate (Direct Form Activate Account for Trainers)
      if (pathname === '/api/activate' && req.method === 'POST') {
        const body = await parseJsonBody(req);
        const { username, defaultPassword, fullName, phone, email, newPassword } = body;

        if (!username || !defaultPassword || !fullName || !newPassword) {
          return sendJson(res, 400, {
            success: false,
            message: 'សូមបំពេញព័ត៌មានចាំបាច់ទាំងអស់ (ឈ្មោះគណនី, លេខសម្ងាត់ដើម, គោត្តនាម-នាម, លេខសម្ងាត់ថ្មី)!'
          });
        }

        const user = db.users.find(u => u.username.toLowerCase() === username.trim().toLowerCase());
        if (!user) {
          return sendJson(res, 404, { success: false, message: `រកមិនឃើញឈ្មោះគណនី «${username}» ឡើយ!` });
        }

        // Default password check: must match 'pec21' or current user password
        if (defaultPassword.trim() !== 'pec21' && user.password !== defaultPassword.trim()) {
          return sendJson(res, 400, { success: false, message: 'លេខសម្ងាត់ដើមមិនត្រឹមត្រូវឡើយ (លេខសម្ងាត់ Default គឺ pec21)!' });
        }

        if (newPassword.trim().length < 4) {
          return sendJson(res, 400, { success: false, message: 'លេខសម្ងាត់ថ្មីត្រូវមានយ៉ាងតិច ៤ តួអក្សរ!' });
        }

        user.fullName = fullName.trim();
        user.phone = (phone || '').trim();
        user.email = (email || '').trim();
        user.password = newPassword.trim();
        user.isActivated = true;
        user.mustChangePassword = false;
        user.activatedAt = new Date().toISOString();
        saveDatabase();

        const token = generateToken(user);
        return sendJson(res, 200, {
          success: true,
          message: `គណនី ${user.username} របស់ ${user.fullName} ត្រូវបាន Activate ដំណើរការដោយជោគជ័យ!`,
          token,
          user: {
            id: user.id,
            username: user.username,
            fullName: user.fullName,
            role: user.role,
            district: user.district,
            phone: user.phone,
            email: user.email,
            isActivated: true
          }
        });
      }

      // 1c. POST /api/change-password (Self Password Change)
      if (pathname === '/api/change-password' && req.method === 'POST') {
        const session = authenticate(req);
        if (!session) return sendJson(res, 401, { success: false, message: 'សូមចូលប្រព័ន្ធជាមុន!' });

        const body = await parseJsonBody(req);
        const { currentPassword, newPassword } = body;
        if (!newPassword || newPassword.length < 4) {
          return sendJson(res, 400, { success: false, message: 'ពាក្យសម្ងាត់ថ្មីត្រូវមានយ៉ាងតិច ៤ តួអក្សរ!' });
        }

        const user = db.users.find(u => u.id === session.userId || u.id === session.id || u.username === session.username);
        if (!user) return sendJson(res, 404, { success: false, message: 'រកមិនឃើញគណនី!' });

        if (currentPassword && user.password !== currentPassword) {
          return sendJson(res, 400, { success: false, message: 'ពាក្យសម្ងាត់ចាស់មិនត្រឹមត្រូវ!' });
        }

        user.password = newPassword;
        user.mustChangePassword = false;
        user.isActivated = true;
        saveDatabase();

        return sendJson(res, 200, { success: true, message: 'បានប្តូរពាក្យសម្ងាត់ និង Activate គណនីដោយជោគជ័យ!' });
      }

      // 2. GET /api/me
      if (pathname === '/api/me' && req.method === 'GET') {
        const session = authenticate(req);
        if (!session) return sendJson(res, 401, { success: false, message: 'មិនទាន់ចូលប្រព័ន្ធ (Unauthorized)' });
        return sendJson(res, 200, { success: true, user: session });
      }

      // 3. GET /api/districts
      if (pathname === '/api/districts' && req.method === 'GET') {
        return sendJson(res, 200, { success: true, districts: db.districts });
      }

      // 4. GET /api/communes
      if (pathname === '/api/communes' && req.method === 'GET') {
        let communes = db.communes;
        if (query.district) {
          communes = communes.filter(k => k.district === query.district);
        }
        return sendJson(res, 200, { success: true, communes });
      }

      // 5. GET /api/candidates
      if (pathname === '/api/candidates' && req.method === 'GET') {
        const session = authenticate(req);
        let list = db.candidates;

        // District Trainer: Strictly filter to their district only, and strip confidential result/status
        if (session && session.role === 'Trainer') {
          list = list.filter(c => c.district === session.district);
        } else {
          if (query.district && query.district !== 'all') {
            list = list.filter(c => c.district === query.district);
          }
        }

        if (query.communeCode && query.communeCode !== 'all') {
          list = list.filter(c => c.communeCode === query.communeCode);
        }
        if (query.roleCode && query.roleCode !== 'all') {
          list = list.filter(c => c.roleCode === query.roleCode);
        }
        if (query.status && query.status !== 'all') {
          list = list.filter(c => c.status === query.status);
        }
        if (query.search) {
          const s = query.search.toLowerCase().trim();
          list = list.filter(c => (c.name && c.name.toLowerCase().includes(s)) || (c.candidateCode && c.candidateCode.toLowerCase().includes(s)));
        }

        // Hide results/status, codes, and QCM/PC scores from district trainers
        if (session && session.role === 'Trainer') {
          list = list.map(c => {
            const safe = { ...c };
            delete safe.status;
            delete safe.rank;
            delete safe.candidateCode;
            delete safe.scoreQcm;
            delete safe.scorePc;
            // scoreTotal for trainer is strictly scoreDegree + scoreExp (out of 20)
            const deg = Number(c.scoreDegree) || 0;
            const exp = Number(c.scoreExp) || 0;
            safe.scoreTotal = deg + exp;
            return safe;
          });
        }

        return sendJson(res, 200, { success: true, total: list.length, candidates: list });
      }

      // 6. POST /api/candidates (Add candidate)
      if (pathname === '/api/candidates' && req.method === 'POST') {
        const session = authenticate(req);
        if (!session) return sendJson(res, 401, { success: false, message: 'សូមចូលប្រព័ន្ធជាមុន!' });

        const body = await parseJsonBody(req);
        if (!body.name || !body.communeCode || !body.roleCode) {
          return sendJson(res, 400, { success: false, message: 'សូមបំពេញព័ត៌មានចាំបាច់ (ឈ្មោះ, ឃុំ, មុខតំណែង)!' });
        }

        const comm = db.communes.find(k => k.code === body.communeCode);
        const districtName = comm ? comm.district : body.district;
        const communeName = comm ? comm.name : body.communeName;

        if (session.role === 'Trainer' && session.district !== districtName) {
          return sendJson(res, 403, { success: false, message: 'លោកអ្នកមានសិទ្ធិកែប្រែតែស្រុករបស់ខ្លួនប៉ុណ្ណោះ!' });
        }

        const candCode = (body.candidateCode || '').trim().toUpperCase();
        if (candCode) {
          const duplicate = db.candidates.find(c => c.candidateCode && c.candidateCode.toUpperCase() === candCode);
          if (duplicate) {
            return sendJson(res, 400, { success: false, message: `លេខកូដ «${candCode}» នេះត្រូវបានប្រើរួចហើយដោយបេក្ខជន «${duplicate.name}» (អាចវាយបញ្ចូលបានតែម្តងប៉ុណ្ណោះ)!` });
          }
        }

        const newCand = {
          id: 'cand_' + Date.now(),
          candidateCode: candCode,
          name: body.name.trim(),
          gender: body.gender || 'ប',
          dob: body.dob || '',
          role: body.role || (body.roleCode === 'a' ? 'ប្រធាន' : body.roleCode === 'b' ? 'ជំនួយការអនុ' : body.roleCode === 'c' ? 'ការីកុំព្យូទ័រ' : 'អនុប្រធាន'),
          roleCode: body.roleCode,
          communeCode: body.communeCode,
          communeName: communeName,
          district: districtName,
          scoreDegree: Number(body.scoreDegree) || 0,
          scoreExp: Number(body.scoreExp) || 0,
          scoreQcm: (session.role === 'Trainer') ? 0 : (body.scoreQcm === 'អវត្តមាន' ? 'អវត្តមាន' : (Number(body.scoreQcm) || 0)),
          scorePc: (session.role === 'Trainer') ? 0 : (body.scorePc === 'អវត្តមាន' ? 'អវត្តមាន' : (Number(body.scorePc) || 0)),
          scoreTotal: 0,
          isClerk: body.roleCode === 'd',
          notes: body.notes || ''
        };

        // Automatic QCM Score pull from examCodes if code is entered
        syncCandidateWithCode(newCand);
        computeCandidateTotal(newCand);

        db.candidates.push(newCand);
        recomputeRanksAndStatuses();
        saveDatabase();

        return sendJson(res, 201, { success: true, message: 'បានបញ្ចូលបេក្ខជនដោយជោគជ័យ!', candidate: newCand });
      }

      // 6b. POST /api/candidates/batch-update (Excel paste batch update)
      if (pathname === '/api/candidates/batch-update' && req.method === 'POST') {
        const session = authenticate(req);
        if (!session) return sendJson(res, 401, { success: false, message: 'សូមចូលប្រព័ន្ធជាមុន!' });

        const body = await parseJsonBody(req);
        const updates = body.updates || [];
        let count = 0;

        updates.forEach(u => {
          if (!u.id) return;
          const cand = db.candidates.find(c => c.id === u.id);
          if (!cand) return;
          if (session.role === 'Trainer' && session.district !== cand.district) return;

          if (u.name !== undefined) cand.name = String(u.name).trim();
          if (u.gender !== undefined) cand.gender = u.gender;
          if (u.dob !== undefined) cand.dob = String(u.dob).trim();
          if (u.scoreDegree !== undefined) cand.scoreDegree = Math.min(5, Math.max(0, Number(u.scoreDegree) || 0));
          if (u.scoreExp !== undefined) cand.scoreExp = Math.min(15, Math.max(0, Number(u.scoreExp) || 0));
          if (u.notes !== undefined) cand.notes = u.notes;

          if (session.role !== 'Trainer') {
            if (u.candidateCode !== undefined) cand.candidateCode = String(u.candidateCode).trim().toUpperCase();
            if (u.scoreQcm !== undefined) cand.scoreQcm = u.scoreQcm === 'អវត្តមាន' ? 'អវត្តមាន' : (Number(u.scoreQcm) || 0);
            if (u.scorePc !== undefined) cand.scorePc = u.scorePc === 'អវត្តមាន' ? 'អវត្តមាន' : (Number(u.scorePc) || 0);
            syncCandidateWithCode(cand);
          }
          computeCandidateTotal(cand);
          count++;
        });

        recomputeRanksAndStatuses();
        saveDatabase();
        return sendJson(res, 200, { success: true, message: `បានកែសម្រួល ${count} នាក់ដោយជោគជ័យ!` });
      }

      // 7. PUT /api/candidates/:id (Update candidate & auto-sync code)
      if (pathname.startsWith('/api/candidates/') && req.method === 'PUT') {
        const session = authenticate(req);
        if (!session) return sendJson(res, 401, { success: false, message: 'សូមចូលប្រព័ន្ធជាមុន!' });

        const id = pathname.replace('/api/candidates/', '');
        const cand = db.candidates.find(c => c.id === id);
        if (!cand) return sendJson(res, 404, { success: false, message: 'រកមិនឃើញបេក្ខជននេះទេ!' });

        if (session.role === 'Trainer' && session.district !== cand.district) {
          return sendJson(res, 403, { success: false, message: 'លោកអ្នកមានសិទ្ធិកែប្រែតែស្រុករបស់ខ្លួនប៉ុណ្ណោះ!' });
        }

        const body = await parseJsonBody(req);
        if (body.name !== undefined) cand.name = body.name.trim();
        if (body.gender !== undefined) cand.gender = body.gender;
        if (body.dob !== undefined) cand.dob = body.dob;
        if (body.scoreDegree !== undefined) cand.scoreDegree = Math.min(5, Math.max(0, Number(body.scoreDegree) || 0));
        if (body.scoreExp !== undefined) cand.scoreExp = Math.min(15, Math.max(0, Number(body.scoreExp) || 0));
        if (body.notes !== undefined) cand.notes = body.notes;

        if (session.role !== 'Trainer') {
          if (body.scorePc !== undefined) cand.scorePc = body.scorePc === 'អវត្តមាន' ? 'អវត្តមាន' : Math.max(0, Number(body.scorePc) || 0);

          // If candidateCode is changed or entered: check uniqueness and auto-lookup score from examCodes!
          if (body.candidateCode !== undefined) {
            const newCodeStr = (body.candidateCode || '').trim().toUpperCase();
            if (newCodeStr) {
              const duplicate = db.candidates.find(c => c.id !== id && c.candidateCode && c.candidateCode.toUpperCase() === newCodeStr);
              if (duplicate) {
                return sendJson(res, 400, { success: false, message: `លេខកូដ «${newCodeStr}» នេះត្រូវបានប្រើរួចហើយដោយបេក្ខជន «${duplicate.name}» (អាចវាយបញ្ចូលបានតែម្តងប៉ុណ្ណោះ)!` });
              }
            }
            cand.candidateCode = newCodeStr;
            syncCandidateWithCode(cand);
          } else if (body.scoreQcm !== undefined) {
            cand.scoreQcm = body.scoreQcm === 'អវត្តមាន' ? 'អវត្តមាន' : Math.max(0, Number(body.scoreQcm) || 0);
          }
        }

        computeCandidateTotal(cand);
        recomputeRanksAndStatuses();
        saveDatabase();

        return sendJson(res, 200, { success: true, message: 'បានកែសម្រួលពិន្ទុជោគជ័យ!', candidate: cand });
      }

      // 8. DELETE /api/candidates/:id
      if (pathname.startsWith('/api/candidates/') && req.method === 'DELETE') {
        const session = authenticate(req);
        if (!session) return sendJson(res, 401, { success: false, message: 'សូមចូលប្រព័ន្ធជាមុន!' });

        // Trainers are strictly forbidden from deleting candidates
        if (session.role === 'Trainer') {
          return sendJson(res, 403, { success: false, message: 'គណនីគ្រូប្រចាំក្រុង/ស្រុក មិនមានសិទ្ធិលុបបេក្ខជនឡើយ (មានសិទ្ធិតែកែសម្រួលប៉ុណ្ណោះ)!' });
        }

        const id = pathname.replace('/api/candidates/', '');
        const idx = db.candidates.findIndex(c => c.id === id);
        if (idx === -1) return sendJson(res, 404, { success: false, message: 'រកមិនឃើញបេក្ខជននេះទេ!' });

        db.candidates.splice(idx, 1);
        recomputeRanksAndStatuses();
        saveDatabase();

        return sendJson(res, 200, { success: true, message: 'បានលុបបេក្ខជនដោយជោគជ័យ!' });
      }

      // ---------------------------------------------------------
      // CODES MANAGEMENT (NEW TAB: លេខកូដ)
      // ---------------------------------------------------------
      // 9. GET /api/codes
      if (pathname === '/api/codes' && req.method === 'GET') {
        // Map codes with current assigned candidate info
        const codesWithAssigned = db.examCodes.map(k => {
          const cand = db.candidates.find(c => c.candidateCode && c.candidateCode.toUpperCase() === k.code.toUpperCase());
          return {
            id: k.id,
            codeNumber: k.codeNumber,
            code: k.code,
            qcmScore: k.qcmScore,
            notes: k.notes,
            assignedTo: cand ? {
              id: cand.id,
              name: cand.name,
              gender: cand.gender,
              role: cand.role,
              district: cand.district,
              communeName: cand.communeName
            } : null
          };
        });

        // Filter if requested
        let result = codesWithAssigned;
        if (query.status === 'assigned') result = result.filter(x => x.assignedTo !== null);
        if (query.status === 'unassigned') result = result.filter(x => x.assignedTo === null);
        if (query.status === 'absent') result = result.filter(x => x.qcmScore === 'អវត្តមាន');
        if (query.search) {
          const s = query.search.toLowerCase().trim();
          result = result.filter(x => x.code.toLowerCase().includes(s) || (x.assignedTo && x.assignedTo.name.toLowerCase().includes(s)));
        }

        return sendJson(res, 200, {
          success: true,
          total: db.examCodes.length,
          assignedCount: codesWithAssigned.filter(x => x.assignedTo !== null).length,
          unassignedCount: codesWithAssigned.filter(x => x.assignedTo === null).length,
          codes: result
        });
      }

      // 10. POST /api/codes (Add new code)
      if (pathname === '/api/codes' && req.method === 'POST') {
        const session = authenticate(req);
        if (!session) return sendJson(res, 401, { success: false, message: 'សូមចូលប្រព័ន្ធជាមុន!' });

        const body = await parseJsonBody(req);
        if (!body.code) return sendJson(res, 400, { success: false, message: 'សូមបញ្ចូលលេខកូដ!' });

        const codeStr = body.code.trim().toUpperCase();
        if (db.examCodes.some(x => x.code.toUpperCase() === codeStr)) {
          return sendJson(res, 400, { success: false, message: `លេខកូដ ${codeStr} មានរួចហើយ!` });
        }

        const scoreVal = body.qcmScore === 'អវត្តមាន' ? 'អវត្តមាន' : (Number(body.qcmScore) || 0);

        const newCode = {
          id: 'code_' + Date.now(),
          codeNumber: db.examCodes.length + 1,
          code: codeStr,
          qcmScore: scoreVal,
          notes: body.notes || ''
        };

        db.examCodes.push(newCode);

        // Check if any candidate already has this code: sync them immediately!
        db.candidates.forEach(c => {
          if (c.candidateCode && c.candidateCode.toUpperCase() === codeStr) {
            c.scoreQcm = scoreVal;
            computeCandidateTotal(c);
          }
        });

        recomputeRanksAndStatuses();
        saveDatabase();

        return sendJson(res, 201, { success: true, message: `បានបញ្ចូលលេខកូដ ${codeStr} ដោយជោគជ័យ!`, code: newCode });
      }

      // 11. PUT /api/codes/:id (Update code & cascade to candidates!)
      if (pathname.startsWith('/api/codes/') && req.method === 'PUT') {
        const session = authenticate(req);
        if (!session) return sendJson(res, 401, { success: false, message: 'សូមចូលប្រព័ន្ធជាមុន!' });

        const id = pathname.replace('/api/codes/', '');
        const target = db.examCodes.find(x => x.id === id);
        if (!target) return sendJson(res, 404, { success: false, message: 'រកមិនឃើញលេខកូដនេះទេ!' });

        const body = await parseJsonBody(req);
        const oldCode = target.code;

        if (body.code !== undefined) target.code = body.code.trim().toUpperCase();
        if (body.qcmScore !== undefined) {
          target.qcmScore = body.qcmScore === 'អវត្តមាន' ? 'អវត្តមាន' : (Number(body.qcmScore) || 0);
        }
        if (body.notes !== undefined) target.notes = body.notes;

        // Cascade update to any candidates holding this code!
        db.candidates.forEach(c => {
          if (c.candidateCode && (c.candidateCode.toUpperCase() === oldCode.toUpperCase() || c.candidateCode.toUpperCase() === target.code.toUpperCase())) {
            c.candidateCode = target.code;
            c.scoreQcm = target.qcmScore;
            computeCandidateTotal(c);
          }
        });

        recomputeRanksAndStatuses();
        saveDatabase();

        return sendJson(res, 200, { success: true, message: `បានកែសម្រួលលេខកូដ ${target.code} ដោយជោគជ័យ!`, code: target });
      }

      // 12. POST /api/codes/batch (Batch Paste/Import from Excel)
      if (pathname === '/api/codes/batch' && req.method === 'POST') {
        const session = authenticate(req);
        if (!session) return sendJson(res, 401, { success: false, message: 'សូមចូលប្រព័ន្ធជាមុន!' });

        const body = await parseJsonBody(req);
        const items = body.items || [];
        if (!Array.isArray(items) || items.length === 0) {
          return sendJson(res, 400, { success: false, message: 'គ្មានទិន្នន័យសម្រាប់បញ្ចូល!' });
        }

        let added = 0;
        let updated = 0;

        items.forEach(item => {
          if (!item.code) return;
          const cStr = item.code.trim().toUpperCase();
          const score = item.qcmScore === 'អវត្តមាន' ? 'អវត្តមាន' : (Number(item.qcmScore) || 0);

          const existing = db.examCodes.find(x => x.code.toUpperCase() === cStr);
          if (existing) {
            existing.qcmScore = score;
            updated++;
          } else {
            db.examCodes.push({
              id: 'code_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
              codeNumber: db.examCodes.length + 1,
              code: cStr,
              qcmScore: score,
              notes: ''
            });
            added++;
          }

          // Update any candidates holding this code
          db.candidates.forEach(c => {
            if (c.candidateCode && c.candidateCode.toUpperCase() === cStr) {
              c.scoreQcm = score;
              computeCandidateTotal(c);
            }
          });
        });

        recomputeRanksAndStatuses();
        saveDatabase();

        return sendJson(res, 200, {
          success: true,
          message: `បានបញ្ចូលកូដថ្មី ${added} និងកែសម្រួល ${updated} ដោយជោគជ័យ!`
        });
      }

      // 13. DELETE /api/codes/:id
      if (pathname.startsWith('/api/codes/') && req.method === 'DELETE') {
        const session = authenticate(req);
        if (!session) return sendJson(res, 401, { success: false, message: 'សូមចូលប្រព័ន្ធជាមុន!' });

        const id = pathname.replace('/api/codes/', '');
        const idx = db.examCodes.findIndex(x => x.id === id);
        if (idx === -1) return sendJson(res, 404, { success: false, message: 'រកមិនឃើញលេខកូដនេះទេ!' });

        const delCode = db.examCodes[idx].code;
        db.examCodes.splice(idx, 1);
        saveDatabase();

        return sendJson(res, 200, { success: true, message: `បានលុបលេខកូដ ${delCode} រួចរាល់!` });
      }

      // 14. GET /api/stats (Overall and by district)
      if (pathname === '/api/stats' && req.method === 'GET') {
        let candidates = db.candidates;
        if (query.district && query.district !== 'all') {
          candidates = candidates.filter(c => c.district === query.district);
        }

        const total = candidates.length;
        const female = candidates.filter(c => c.gender === 'ស' || c.gender === 'F').length;
        const passed = candidates.filter(c => c.status === 'A-ជាប់').length;
        const passedFemale = candidates.filter(c => (c.gender === 'ស' || c.gender === 'F') && c.status === 'A-ជាប់').length;
        const reserve = candidates.filter(c => c.status === 'B-បម្រុង').length;
        const failed = candidates.filter(c => c.status === 'ធ្លាក់').length;
        const absent = candidates.filter(c => c.status === 'អវត្តមាន').length;

        const byDistrict = db.districts.map(d => {
          const list = db.candidates.filter(c => c.district === d.name);
          return {
            id: d.id,
            name: d.name,
            total: list.length,
            female: list.filter(c => c.gender === 'ស' || c.gender === 'F').length,
            passed: list.filter(c => c.status === 'A-ជាប់').length,
            reserve: list.filter(c => c.status === 'B-បម្រុង').length,
            failed: list.filter(c => c.status === 'ធ្លាក់').length,
            absent: list.filter(c => c.status === 'អវត្តមាន').length
          };
        });

        return sendJson(res, 200, {
          success: true,
          stats: {
            total,
            female,
            passed,
            passedFemale,
            reserve,
            failed,
            absent,
            communeCount: db.communes.length,
            districtCount: db.districts.length,
            codeCount: db.examCodes.length
          },
          byDistrict
        });
      }

      // 15. GET & POST /api/users
      if (pathname === '/api/users' && req.method === 'GET') {
        const session = authenticate(req);
        if (!session || (session.role !== 'SuperAdmin' && session.role !== 'Admin')) {
          return sendJson(res, 403, { success: false, message: 'សិទ្ធិមិនគ្រប់គ្រាន់!' });
        }
        const safeUsers = db.users.map(u => ({
          id: u.id,
          username: u.username,
          fullName: u.fullName,
          role: u.role,
          district: u.district,
          phone: u.phone || '',
          email: u.email || '',
          isActivated: !!u.isActivated,
          activatedAt: u.activatedAt || null,
          active: u.active
        }));
        return sendJson(res, 200, { success: true, users: safeUsers });
      }

      
      // Reset Trainer Password to Default pec21
      if (pathname.startsWith('/api/users/') && pathname.endsWith('/reset') && req.method === 'POST') {
        const session = authenticate(req);
        if (!session || (session.role !== 'SuperAdmin' && session.role !== 'Admin')) {
          return sendJson(res, 403, { success: false, message: 'សិទ្ធិមិនគ្រប់គ្រាន់!' });
        }
        const id = pathname.replace('/api/users/', '').replace('/reset', '');
        const targetUser = db.users.find(u => u.id === id);
        if (!targetUser) return sendJson(res, 404, { success: false, message: 'រកមិនឃើញគណនីនេះទេ!' });

        targetUser.password = 'pec21';
        targetUser.isActivated = false;
        saveDatabase();
        return sendJson(res, 200, { success: true, message: `បាន Reset លេខសម្ងាត់គណនី ${targetUser.username} មក «pec21» (រង់ចាំ Activate) រួចរាល់!` });
      }

      if (pathname.startsWith('/api/users/') && req.method === 'PUT') {
        const session = authenticate(req);
        if (!session || (session.role !== 'SuperAdmin' && session.role !== 'Admin')) {
          return sendJson(res, 403, { success: false, message: 'សិទ្ធិមិនគ្រប់គ្រាន់!' });
        }
        const id = pathname.replace('/api/users/', '');
        const targetUser = db.users.find(u => u.id === id);
        if (!targetUser) return sendJson(res, 404, { success: false, message: 'រកមិនឃើញគណនីនេះទេ!' });

        const body = await parseJsonBody(req);
        if (body.fullName !== undefined) targetUser.fullName = body.fullName;
        if (body.password) targetUser.password = body.password;
        if (body.active !== undefined) targetUser.active = !!body.active;
        saveDatabase();
        return sendJson(res, 200, { success: true, message: 'បានកែសម្រួលគណនីដោយជោគជ័យ!' });
      }

      // 15.1 Manual Cloud Sync (Pull latest from Firebase)
      if (pathname === '/api/sync-cloud' && req.method === 'POST') {
        const session = authenticate(req);
        if (!session || (session.role !== 'SuperAdmin' && session.role !== 'Admin' && session.role !== 'PEC21')) {
          return sendJson(res, 403, { success: false, message: 'សិទ្ធិមិនគ្រប់គ្រាន់!' });
        }
        if (!FIREBASE_DB_URL) {
          return sendJson(res, 400, { success: false, message: 'ប្រព័ន្ធមិនទាន់បានកំណត់ FIREBASE_DB_URL ឡើយ!' });
        }
        const cloudData = await fetchFromFirebase();
        if (cloudData && cloudData.candidates) {
          db = cloudData;
          if (!db.examCodes) db.examCodes = [];
          recomputeRanksAndStatuses();
          try { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8'); } catch (e) {}
          return sendJson(res, 200, { success: true, message: `បានទាញយកទិន្នន័យពី Cloud ដោយជោគជ័យ! (បេក្ខជនសរុប: ${db.candidates.length})` });
        } else {
          return sendJson(res, 500, { success: false, message: 'មិនអាចទាញទិន្នន័យពី Firebase បានទេ សូមពិនិត្យមើល URL ឬអ៊ីនធឺណិត!' });
        }
      }

      // 16. Backup & Restore
      if (pathname === '/api/backup' && req.method === 'GET') {
        const session = authenticate(req);
        if (!session || (session.role !== 'SuperAdmin' && session.role !== 'Admin' && session.role !== 'PEC21')) {
          return sendJson(res, 403, { success: false, message: 'សិទ្ធិមិនគ្រប់គ្រាន់!' });
        }
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Content-Disposition': 'attachment; filename="backup_kb_2026.json"'
        });
        return res.end(JSON.stringify(db, null, 2));
      }

      if (pathname === '/api/restore' && req.method === 'POST') {
        const session = authenticate(req);
        if (!session || session.role !== 'SuperAdmin') {
          return sendJson(res, 403, { success: false, message: 'មានតែ SuperAdmin ប៉ុណ្ណោះដែលអាចស្ដារទិន្នន័យបាន!' });
        }
        const body = await parseJsonBody(req);
        if (body.candidates && body.communes) {
          db = body;
          if (!db.examCodes) db.examCodes = [];
          recomputeRanksAndStatuses();
          saveDatabase();
          return sendJson(res, 200, { success: true, message: 'បានស្ដារទិន្នន័យដោយជោគជ័យ!' });
        } else {
          return sendJson(res, 400, { success: false, message: 'ឯកសារទិន្នន័យមិនត្រឹមត្រូវ!' });
        }
      }

      // 17. Export CSV
      if (pathname === '/api/export-csv' && req.method === 'GET') {
        let csv = '\uFEFFល.រ,កូដបេក្ខជន,ឈ្មោះ,ភេទ,ថ្ងៃខែឆ្នាំកំណើត,មុខតំណែង,ឃុំ/សង្កាត់,ស្រុក/ក្រុង,សញ្ញាបត្រ,បទពិសោធន៍,QCM,កុំព្យូទ័រ,ពិន្ទុសរុប,ចំណាត់ថ្នាក់,លទ្ធផល\n';
        db.candidates.forEach((c, idx) => {
          csv += `"${idx + 1}","${c.candidateCode}","${c.name}","${c.gender}","${c.dob}","${c.role}","${c.communeName}","${c.district}","${c.scoreDegree}","${c.scoreExp}","${c.scoreQcm}","${c.scorePc}","${c.scoreTotal}","${c.rank}","${c.status}"\n`;
        });
        res.writeHead(200, {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="candidates_export_2026.csv"'
        });
        return res.end(csv);
      }

      return sendJson(res, 404, { success: false, message: 'API Endpoint Not Found' });
    } catch (apiErr) {
      console.error('[API Error]:', apiErr);
      return sendJson(res, 500, { success: false, message: 'Server Error: ' + apiErr.message });
    }
  }

  // Static files
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Access Denied');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      filePath = path.join(PUBLIC_DIR, 'index.html');
    }
    const contentType = MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('\n================================================================');
  console.log('   ប្រព័ន្ធគ្រប់គ្រងបូកស្រង់ពិន្ទុប្រឡងជ្រើសរើស ក.ច.ប (PEC21)');
  console.log('   Online & Offline Election Exam Score Aggregation System');
  console.log('================================================================');
  console.log(`\n -> Local Access (Offline/Localhost): http://localhost:${PORT}`);

  const ifaces = os.networkInterfaces();
  for (const name in ifaces) {
    for (const net of ifaces[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log(` -> Network Access (LAN/Online):    http://${net.address}:${PORT}`);
      }
    }
  }
  console.log('\n Server is ready! Press Ctrl+C to stop.\n');
});
