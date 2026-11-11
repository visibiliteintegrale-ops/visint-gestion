// ---------- Utilitaires ----------
const $ = s => document.querySelector(s);
let ME = null, PARAMS = null, charts = {};

async function api(path, opts = {}) {
  const r = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (r.status === 401) { showLogin(); throw new Error('auth'); }
  if (!r.ok) {
    let d; try { d = await r.json(); } catch { d = {}; }
    throw new Error(d.detail || 'Erreur ' + r.status);
  }
  return r.status === 204 ? null : r.json();
}

const fmt = n => (n == null ? '' : Math.round(n).toLocaleString('fr-FR'));
const fcfa = n => fmt(n) + ' F';
const pct = n => (n == null ? '' : (n * 100).toFixed(1).replace('.', ',') + ' %');
const dfr = s => { if (!s) return ''; const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; };
const esc = s => (s == null ? '' : String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.add('hidden'), 2600);
}

function etatBadge(e) {
  const map = { 'Converti': 'b-ok', 'Actif': 'b-ok', 'En cours': 'b-info',
    'Inactif': 'b-warn', 'Perdu': 'b-bad', 'Code invalide': 'b-bad' };
  return `<span class="badge ${map[e] || 'b-info'}">${esc(e || '')}</span>`;
}

// ---------- Modale ----------
let modalSaveFn = null;
function openModal(title, bodyHtml, onSave) {
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = bodyHtml;
  modalSaveFn = onSave;
  $('#modal').classList.remove('hidden');
}
function closeModal() { $('#modal').classList.add('hidden'); modalSaveFn = null; }
$('#modalCancel').onclick = closeModal;
$('#modalSave').onclick = async () => { if (modalSaveFn) await modalSaveFn(); };
$('#modal').onclick = e => { if (e.target.id === 'modal') closeModal(); };

function field(label, id, value = '', type = 'text') {
  return `<div class="field"><label>${label}</label>
    <input id="${id}" type="${type}" value="${esc(value)}"></div>`;
}
function selectField(label, id, options, value = '') {
  const opts = ['<option value=""></option>'].concat(options.map(o =>
    `<option ${o === value ? 'selected' : ''}>${esc(o)}</option>`)).join('');
  return `<div class="field"><label>${label}</label><select id="${id}">${opts}</select></div>`;
}

// ---------- Auth ----------
function showLogin() { $('#login').classList.remove('hidden'); $('#appui').classList.add('hidden'); }
function showApp() { $('#login').classList.add('hidden'); $('#appui').classList.remove('hidden'); }

$('#loginForm').onsubmit = async e => {
  e.preventDefault();
  $('#loginErr').textContent = '';
  try {
    ME = await api('/api/login', { method: 'POST',
      body: { username: $('#lu').value, password: $('#lp').value } });
    await boot();
  } catch (err) { $('#loginErr').textContent = 'Identifiants invalides'; }
};

$('#logout').onclick = async () => {
  await api('/api/logout', { method: 'POST' }); ME = null; showLogin();
};

// ---------- Navigation ----------
document.querySelectorAll('.side nav a').forEach(a => {
  a.onclick = () => {
    document.querySelectorAll('.side nav a').forEach(x => x.classList.remove('active'));
    a.classList.add('active');
    render(a.dataset.view);
  };
});

async function boot() {
  showApp();
  $('#whoami').textContent = ME.username + ' (' + ME.role + ')';
  PARAMS = await api('/api/parametres');
  if (ME.role !== 'admin') {
    const p = document.querySelector('[data-view="parametres"]');
    // les non-admins voient les parametres en lecture seule
  }
  render('dashboard');
}

async function init() {
  try { ME = await api('/api/me'); await boot(); }
  catch { showLogin(); }
}
init();

// ---------- Routeur de vues ----------
async function render(view) {
  const el = $('#view');
  el.innerHTML = '<p class="muted">Chargement…</p>';
  try {
    if (view === 'dashboard') await viewDashboard(el);
    else if (view === 'prospects') await viewProspects(el);
    else if (view === 'ventes') await viewVentes(el);
    else if (view === 'clients') await viewClients(el);
    else if (view === 'annuel') await viewAnnuel(el);
    else if (view === 'parametres') await viewParametres(el);
  } catch (e) { el.innerHTML = '<p class="err">' + esc(e.message) + '</p>'; }
}

function destroyCharts() { Object.values(charts).forEach(c => c && c.destroy()); charts = {}; }

// ---------- Tableau de bord ----------
async function viewDashboard(el) {
  destroyCharts();
  const [s, mois, cli] = await Promise.all([
    api('/api/dashboard/synthese'),
    api('/api/dashboard/mois'),
    api('/api/clients'),
  ]);
  el.innerHTML = `
    <h1>Tableau de bord</h1>
    <p class="subtitle">Pilotage mensuel — ${mois.mois_nom} ${mois.annee}</p>
    <div class="kpis">
      <div class="kpi"><div class="lbl">Prospects</div><div class="val">${fmt(s.nb_prospects)}</div></div>
      <div class="kpi g"><div class="lbl">Clients</div><div class="val">${fmt(s.nb_clients)}</div></div>
      <div class="kpi o"><div class="lbl">Taux conversion</div><div class="val">${pct(s.taux_conversion)}</div></div>
      <div class="kpi"><div class="lbl">CA du mois</div><div class="val">${fcfa(mois.total.realise)}</div></div>
      <div class="kpi g"><div class="lbl">CA total</div><div class="val">${fcfa(s.ca_total)}</div></div>
    </div>
    <div class="card" style="margin-bottom:22px">
      <h3>Objectifs du mois par service — réalisé ${fcfa(mois.total.realise)} / ${fcfa(mois.total.objectif)} (${pct(mois.total.taux)})</h3>
      <div class="tbl-wrap" style="box-shadow:none">
      <table><thead><tr><th>Service</th><th class="num">Objectif</th><th class="num">Réalisé</th><th class="num">Reste</th><th>% Atteint</th></tr></thead>
      <tbody>${mois.lignes.map(l => `<tr>
        <td>${esc(l.service)}</td><td class="num">${fcfa(l.objectif)}</td>
        <td class="num">${fcfa(l.realise)}</td><td class="num">${fcfa(l.reste)}</td>
        <td><div style="display:flex;align-items:center;gap:8px"><div class="progress"><div style="width:${Math.min(100, l.taux * 100)}%"></div></div><span>${pct(l.taux)}</span></div></td>
      </tr>`).join('')}
      <tr style="font-weight:800;background:#f1f5f9"><td>TOTAL</td>
        <td class="num">${fcfa(mois.total.objectif)}</td><td class="num">${fcfa(mois.total.realise)}</td>
        <td class="num">${fcfa(mois.total.reste)}</td><td>${pct(mois.total.taux)}</td></tr>
      </tbody></table></div>
    </div>
    <div class="grid2">
      <div class="card"><h3>Objectif vs Réalisé (mois)</h3><div class="chart-wrap"><canvas id="cMois"></canvas></div></div>
      <div class="card"><h3>Prospects par état</h3><div class="chart-wrap"><canvas id="cEtat"></canvas></div></div>
    </div>
    <div class="grid2">
      <div class="card"><h3>Clients par segment</h3><div class="chart-wrap"><canvas id="cSeg"></canvas></div></div>
      <div class="card"><h3>Clients par source</h3><div class="chart-wrap"><canvas id="cSrc"></canvas></div></div>
    </div>`;

  const C = ['#5D3A9B', '#00AEEF', '#F5A623', '#b91c1c', '#7C4DCC', '#00C2C7', '#6B6880'];
  charts.mois = new Chart($('#cMois'), { type: 'bar', data: {
    labels: mois.lignes.map(l => l.service),
    datasets: [
      { label: 'Objectif', data: mois.lignes.map(l => l.objectif), backgroundColor: '#C9D3DE' },
      { label: 'Réalisé', data: mois.lignes.map(l => l.realise), backgroundColor: '#5D3A9B' }],
  }, options: chartOpts(true) });
  charts.etat = new Chart($('#cEtat'), { type: 'doughnut', data: {
    labels: Object.keys(s.etats_prospects),
    datasets: [{ data: Object.values(s.etats_prospects), backgroundColor: ['#00AEEF', '#5D3A9B', '#b91c1c'] }],
  }, options: chartOpts(false) });
  charts.seg = new Chart($('#cSeg'), { type: 'doughnut', data: {
    labels: Object.keys(cli.segments),
    datasets: [{ data: Object.values(cli.segments), backgroundColor: ['#5D3A9B', '#00AEEF', '#b91c1c'] }],
  }, options: chartOpts(false) });
  charts.src = new Chart($('#cSrc'), { type: 'bar', data: {
    labels: cli.sources.map(x => x.source),
    datasets: [{ label: 'Clients', data: cli.sources.map(x => x.nombre), backgroundColor: C }],
  }, options: { ...chartOpts(false), indexAxis: 'y' } });
}

function chartOpts(money) {
  return { responsive: true, maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom' } },
    scales: money ? { y: { ticks: { callback: v => (v / 1000) + 'k' } } } : {} };
}

// ---------- Prospects ----------
let _prospects = [];
async function viewProspects(el) {
  _prospects = await api('/api/prospects');
  const srcOpts = ['Tous', ...PARAMS.sources.map(s => s.nom)];
  el.innerHTML = `
    <h1>Prospects</h1><p class="subtitle">${_prospects.length} prospects — suivi des arrivées et conversions</p>
    <div class="toolbar">
      <div class="filters">
        <input id="fp" placeholder="Rechercher un nom…">
        <select id="fe"><option value="">Tous les états</option><option>Converti</option><option>En cours</option><option>Perdu</option></select>
      </div>
      <button id="addP">+ Nouveau prospect</button>
    </div>
    <div class="tbl-wrap"><table><thead><tr>
      <th>N°</th><th>Source</th><th>Nom</th><th>Téléphone</th><th>Arrivée</th><th>Service</th>
      <th>Code parrain</th><th>Nom parrain</th><th>Code généré</th><th>Date achat</th>
      <th>État</th><th>Durée (j)</th><th>Action</th><th></th></tr></thead>
      <tbody id="pBody"></tbody></table></div>`;
  $('#addP').onclick = () => prospectModal();
  $('#fp').oninput = $('#fe').onchange = renderProspects;
  renderProspects();
}

function renderProspects() {
  const q = $('#fp').value.toLowerCase(), fe = $('#fe').value;
  const rows = _prospects.filter(p =>
    (!q || (p.nom || '').toLowerCase().includes(q)) && (!fe || p.etat === fe));
  $('#pBody').innerHTML = rows.map(p => `<tr>
    <td>${p.numero}</td><td>${esc(p.source)}</td><td><b>${esc(p.nom)}</b></td>
    <td>${esc(p.telephone)}</td><td>${dfr(p.date_arrivee)}</td><td>${esc(p.service)}</td>
    <td>${esc(p.code_parrain)}</td><td>${esc(p.nom_parrain)}</td><td class="muted">${esc(p.code_parrainage)}</td>
    <td>${dfr(p.date_achat)}</td><td>${etatBadge(p.etat)}</td><td class="num">${p.duree ?? ''}</td>
    <td>${esc(p.action)}</td>
    <td><button class="btn-sm btn-edit" onclick='editP(${p.id})'>✎</button>
        <button class="btn-sm btn-del" onclick='delP(${p.id})'>🗑</button></td></tr>`).join('')
    || '<tr><td colspan="14" class="muted" style="padding:20px">Aucun prospect</td></tr>';
}

function prospectModal(p) {
  const srcs = PARAMS.sources.map(s => s.nom);
  const servs = PARAMS.services.map(s => s.nom);
  const acts = PARAMS.actions.map(a => a.nom);
  openModal(p ? 'Modifier le prospect' : 'Nouveau prospect', `
    ${selectField('Source du prospect', 'p_source', srcs, p?.source || '')}
    ${field('Nom', 'p_nom', p?.nom || '')}
    ${field('Numéro de téléphone', 'p_tel', p?.telephone || '')}
    ${field("Date d'arrivée", 'p_date', p?.date_arrivee || '', 'date')}
    ${selectField('Service', 'p_serv', servs, p?.service || '')}
    ${field('Code parrain (optionnel)', 'p_parr', p?.code_parrain || '')}
    ${selectField('Action', 'p_act', acts, p?.action || '')}`,
    async () => {
      const body = { source: $('#p_source').value, nom: $('#p_nom').value.trim(),
        telephone: $('#p_tel').value, date_arrivee: $('#p_date').value || null,
        service: $('#p_serv').value, code_parrain: $('#p_parr').value, action: $('#p_act').value };
      if (!body.nom) return toast('Le nom est obligatoire');
      if (p) await api('/api/prospects/' + p.id, { method: 'PUT', body });
      else await api('/api/prospects', { method: 'POST', body });
      closeModal(); toast('Enregistré'); await viewProspects($('#view'));
    });
}
window.editP = id => prospectModal(_prospects.find(x => x.id === id));
window.delP = async id => {
  const p = _prospects.find(x => x.id === id);
  if (!confirm('Supprimer le prospect « ' + p.nom + ' » ?')) return;
  await api('/api/prospects/' + id, { method: 'DELETE' });
  toast('Supprimé'); await viewProspects($('#view'));
};

// ---------- Ventes ----------
let _ventes = [];
async function viewVentes(el) {
  const [v, parComm] = await Promise.all([api('/api/ventes'), api('/api/ventes/par-commercial')]);
  _ventes = v;
  const tot = v.reduce((a, x) => a + (x.montant || 0), 0);
  el.innerHTML = `
    <h1>Ventes</h1><p class="subtitle">${v.length} ventes — CA total ${fcfa(tot)}</p>
    <div class="kpis">
      ${parComm.map(c => `<div class="kpi"><div class="lbl">${esc(c.commercial)}</div><div class="val">${fcfa(c.total)}</div></div>`).join('')}
    </div>
    <div class="toolbar">
      <div class="filters">
        <input id="fv" placeholder="Rechercher un client…">
        <select id="fvs"><option value="">Tous les services</option>${PARAMS.services.map(s => `<option>${esc(s.nom)}</option>`).join('')}</select>
      </div>
      <button id="addV">+ Nouvelle vente</button>
    </div>
    <div class="tbl-wrap"><table><thead><tr>
      <th>Date</th><th>Service</th><th>Commercial</th><th>Client</th><th class="num">Montant</th><th></th>
    </tr></thead><tbody id="vBody"></tbody></table></div>`;
  $('#addV').onclick = () => venteModal();
  $('#fv').oninput = $('#fvs').onchange = renderVentes;
  renderVentes();
}
function renderVentes() {
  const q = $('#fv').value.toLowerCase(), fs = $('#fvs').value;
  const rows = _ventes.filter(v => (!q || (v.client || '').toLowerCase().includes(q)) && (!fs || v.service === fs));
  $('#vBody').innerHTML = rows.map(v => `<tr>
    <td>${dfr(v.date_achat)}</td><td>${esc(v.service)}</td><td>${esc(v.commercial)}</td>
    <td><b>${esc(v.client)}</b></td><td class="num">${fcfa(v.montant)}</td>
    <td><button class="btn-sm btn-edit" onclick='editV(${v.id})'>✎</button>
        <button class="btn-sm btn-del" onclick='delV(${v.id})'>🗑</button></td></tr>`).join('')
    || '<tr><td colspan="6" class="muted" style="padding:20px">Aucune vente</td></tr>';
}
function venteModal(v) {
  const servs = PARAMS.services.map(s => s.nom);
  const comms = PARAMS.commerciaux.map(c => c.nom);
  openModal(v ? 'Modifier la vente' : 'Nouvelle vente', `
    ${field("Date d'achat", 'v_date', v?.date_achat || new Date().toISOString().slice(0, 10), 'date')}
    ${selectField('Service', 'v_serv', servs, v?.service || '')}
    ${selectField('Commercial', 'v_comm', comms, v?.commercial || '')}
    ${field('Client', 'v_cli', v?.client || '')}
    ${field('Montant (FCFA)', 'v_mt', v?.montant || 0, 'number')}`,
    async () => {
      const body = { date_achat: $('#v_date').value || null, service: $('#v_serv').value,
        commercial: $('#v_comm').value, client: $('#v_cli').value.trim(),
        montant: parseFloat($('#v_mt').value) || 0 };
      if (!body.client) return toast('Le client est obligatoire');
      if (v) await api('/api/ventes/' + v.id, { method: 'PUT', body });
      else await api('/api/ventes', { method: 'POST', body });
      closeModal(); toast('Enregistré'); await viewVentes($('#view'));
    });
}
window.editV = id => venteModal(_ventes.find(x => x.id === id));
window.delV = async id => {
  if (!confirm('Supprimer cette vente ?')) return;
  await api('/api/ventes/' + id, { method: 'DELETE' });
  toast('Supprimé'); await viewVentes($('#view'));
};

// ---------- Clients ----------
async function viewClients(el) {
  const d = await api('/api/clients');
  el.innerHTML = `
    <h1>Clients</h1><p class="subtitle">${d.clients.length} clients — base calculée automatiquement à partir des prospects convertis et des ventes</p>
    <div class="kpis">
      <div class="kpi g"><div class="lbl">Actifs</div><div class="val">${d.segments.Actif}</div></div>
      <div class="kpi o"><div class="lbl">Inactifs</div><div class="val">${d.segments.Inactif}</div></div>
      <div class="kpi r"><div class="lbl">Perdus</div><div class="val">${d.segments.Perdu}</div></div>
      <div class="kpi"><div class="lbl">Fidélisés</div><div class="val">${d.fidelises}</div></div>
      <div class="kpi"><div class="lbl">Taux fidélisation</div><div class="val">${pct(d.taux_fidelisation)}</div></div>
    </div>
    <div class="toolbar"><div class="filters">
      <input id="fc" placeholder="Rechercher un client…">
      <select id="fce"><option value="">Tous les états</option><option>Actif</option><option>Inactif</option><option>Perdu</option></select>
    </div></div>
    <div class="tbl-wrap"><table><thead><tr>
      <th>Rang</th><th>Nom du client</th><th>Arrivée</th><th>Téléphone</th><th>Code parrainage</th>
      <th class="num">Filleuls</th><th class="num">CA généré</th><th>Dernier achat</th><th>État</th><th>Source</th>
    </tr></thead><tbody id="cBody"></tbody></table></div>`;
  const draw = () => {
    const q = $('#fc').value.toLowerCase(), fe = $('#fce').value;
    const rows = d.clients.filter(c => (!q || (c.nom || '').toLowerCase().includes(q)) && (!fe || c.etat === fe));
    $('#cBody').innerHTML = rows.map(c => `<tr>
      <td>${c.rang}</td><td><b>${esc(c.nom)}</b></td><td>${dfr(c.date_arrivee)}</td>
      <td>${esc(c.telephone)}</td><td class="muted">${esc(c.code_parrainage)}</td>
      <td class="num">${c.nb_filleul}</td><td class="num"><b>${fcfa(c.ca_genere)}</b></td>
      <td>${dfr(c.dernier_achat)}</td><td>${etatBadge(c.etat)}</td><td>${esc(c.source)}</td></tr>`).join('')
      || '<tr><td colspan="10" class="muted" style="padding:20px">Aucun client</td></tr>';
  };
  $('#fc').oninput = $('#fce').onchange = draw; draw();
}

// ---------- Évolution annuelle ----------
async function viewAnnuel(el) {
  destroyCharts();
  const d = await api('/api/dashboard/annuel');
  el.innerHTML = `
    <h1>Évolution annuelle</h1>
    <p class="subtitle">Chiffre d'affaires mensuel — année ${d.annee}</p>
    <div class="kpis">
      <div class="kpi"><div class="lbl">Objectif annuel</div><div class="val">${fcfa(d.objectif_annuel)}</div></div>
      <div class="kpi g"><div class="lbl">CA cumulé</div><div class="val">${fcfa(d.ca_cumule)}</div></div>
      <div class="kpi o"><div class="lbl">Reste à réaliser</div><div class="val">${fcfa(d.reste_annuel)}</div></div>
      <div class="kpi"><div class="lbl">% Atteint</div><div class="val">${pct(d.taux_annuel)}</div></div>
    </div>
    <div class="card" style="margin-bottom:22px"><h3>Chiffre d'affaires par mois</h3>
      <div class="chart-wrap" style="height:320px"><canvas id="cAn"></canvas></div></div>
    <div class="tbl-wrap"><table><thead><tr>
      <th>Mois</th><th class="num">CA réalisé</th><th>Évolution m-1</th><th>% Objectif mensuel</th>
    </tr></thead><tbody>${d.mois.map(m => `<tr>
      <td>${esc(m.mois_nom)}</td><td class="num">${fcfa(m.ca)}</td>
      <td class="right" style="color:${m.evolution == null ? '' : m.evolution < 0 ? '#b91c1c' : '#15803d'}">
        ${m.evolution == null ? '' : (m.evolution >= 0 ? '+' : '') + pct(m.evolution)}</td>
      <td>${pct(m.taux_objectif)}</td></tr>`).join('')}</tbody></table></div>
    <p class="muted" style="margin-top:14px">Les mois antérieurs au démarrage du suivi peuvent être saisis dans Paramètres › Historique.</p>`;
  charts.an = new Chart($('#cAn'), { type: 'line', data: {
    labels: d.mois.map(m => m.mois_nom),
    datasets: [
      { label: 'CA réalisé', data: d.mois.map(m => m.ca), borderColor: '#5D3A9B',
        backgroundColor: 'rgba(93,58,155,.12)', fill: true, tension: .3 },
      { label: 'Objectif mensuel', data: d.mois.map(() => d.objectif_annuel / 12),
        borderColor: '#00AEEF', borderDash: [6, 4], pointRadius: 0 }],
  }, options: chartOpts(true) });
}

// ---------- Paramètres ----------
async function viewParametres(el) {
  PARAMS = await api('/api/parametres');
  const hist = await api('/api/parametres/historique');
  const admin = ME.role === 'admin';
  const P = PARAMS;
  const MOISN = ['', 'janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  el.innerHTML = `
    <h1>Paramètres</h1><p class="subtitle">${admin ? 'Configuration des référentiels et objectifs' : 'Consultation (modification réservée à l administrateur)'}</p>
    <div class="grid2">
      <div class="card"><h3>Services et objectifs mensuels</h3>
        <div class="tbl-wrap" style="box-shadow:none;max-height:none"><table><thead><tr><th>Service</th><th class="num">Objectif (FCFA)</th>${admin ? '<th></th>' : ''}</tr></thead>
        <tbody>${P.services.map(s => `<tr><td>${esc(s.nom)}</td><td class="num">${fcfa(s.objectif_mensuel)}</td>
          ${admin ? `<td><button class="btn-sm btn-edit" onclick='editServ(${s.id})'>✎</button>
            <button class="btn-sm btn-del" onclick='delServ(${s.id})'>🗑</button></td>` : ''}</tr>`).join('')}</tbody></table></div>
        ${admin ? '<button style="margin-top:12px" onclick="editServ(0)">+ Ajouter un service</button>' : ''}
      </div>
      <div class="card"><h3>Objectifs globaux</h3>
        ${cfgRow('Cycle de vente cible (jours)', 'cycle_vente', P.config.cycle_vente, admin)}
        ${cfgRow('Objectif CA annuel (FCFA)', 'objectif_annuel', P.config.objectif_annuel, admin)}
        <p class="muted" style="margin-top:8px">Objectif mensuel global = somme des objectifs par service = ${fcfa(P.services.reduce((a, s) => a + s.objectif_mensuel, 0))}.</p>
      </div>
    </div>
    <div class="grid2">
      ${listCard('Commerciaux', 'commerciaux', P.commerciaux, admin)}
      ${listCard('Sources de prospects', 'sources', P.sources, admin)}
    </div>
    <div class="grid2">
      ${listCard('Actions', 'actions', P.actions, admin)}
      <div class="card"><h3>Historique CA mensuel (${new Date().getFullYear()})</h3>
        <div class="tbl-wrap" style="box-shadow:none;max-height:none"><table><thead><tr><th>Mois</th><th class="num">CA (FCFA)</th>${admin ? '<th></th>' : ''}</tr></thead>
        <tbody>${hist.map(h => `<tr><td>${MOISN[h.mois]}</td>
          <td class="num">${fcfa(h.montant)}</td>${admin ? `<td><button class="btn-sm btn-edit" onclick='editHist(${h.mois},${h.montant})'>✎</button></td>` : ''}</tr>`).join('') || '<tr><td colspan="3" class="muted">Aucun</td></tr>'}</tbody></table></div>
        ${admin ? '<button style="margin-top:12px" onclick="editHist(0,0)">+ Saisir un mois</button>' : ''}
      </div>
    </div>
    ${admin ? '<div class="card" style="margin-top:4px"><h3>Utilisateurs</h3><div id="usersBox"></div></div>' : ''}`;
  if (admin) loadUsers();
}

function cfgRow(label, key, val, admin) {
  return `<div class="field"><label>${label}</label>
    <div style="display:flex;gap:8px"><input id="cfg_${key}" value="${esc(val || '')}" ${admin ? '' : 'disabled'}>
    ${admin ? `<button class="btn-sm" onclick="saveCfg('${key}')">OK</button>` : ''}</div></div>`;
}
window.saveCfg = async key => {
  await api('/api/parametres/config', { method: 'POST', body: { cle: key, valeur: $('#cfg_' + key).value } });
  toast('Enregistré'); PARAMS = await api('/api/parametres');
};
function listCard(title, kind, items, admin) {
  return `<div class="card"><h3>${title}</h3>
    <div class="pill-row">${items.map(i => `<span class="pill">${esc(i.nom)}
      ${admin ? `<button onclick='delListe("${kind}",${i.id})'>×</button>` : ''}</span>`).join('') || '<span class="muted">Aucun</span>'}</div>
    ${admin ? `<div style="display:flex;gap:8px;margin-top:12px"><input id="new_${kind}" placeholder="Ajouter...">
      <button class="btn-sm" onclick='addListe("${kind}")'>+</button></div>` : ''}</div>`;
}
window.addListe = async kind => {
  const v = $('#new_' + kind).value.trim(); if (!v) return;
  await api('/api/parametres/' + kind, { method: 'POST', body: { nom: v } });
  toast('Ajouté'); viewParametres($('#view'));
};
window.delListe = async (kind, id) => {
  await api('/api/parametres/' + kind + '/' + id, { method: 'DELETE' });
  toast('Supprimé'); viewParametres($('#view'));
};
window.editServ = id => {
  const s = id ? PARAMS.services.find(x => x.id === id) : null;
  openModal(s ? 'Modifier le service' : 'Nouveau service',
    field('Nom du service', 's_nom', s?.nom || '') + field('Objectif mensuel (FCFA)', 's_obj', s?.objectif_mensuel || 0, 'number'),
    async () => {
      await api('/api/parametres/services', { method: 'POST',
        body: { nom: $('#s_nom').value.trim(), objectif_mensuel: parseFloat($('#s_obj').value) || 0 } });
      closeModal(); toast('Enregistré'); viewParametres($('#view'));
    });
};
window.delServ = async id => {
  if (!confirm('Supprimer ce service ?')) return;
  await api('/api/parametres/services/' + id, { method: 'DELETE' });
  toast('Supprimé'); viewParametres($('#view'));
};
window.editHist = (mois, montant) => {
  openModal('Historique CA',
    field('Mois (1-12)', 'h_m', mois || '', 'number') + field('CA (FCFA)', 'h_v', montant || 0, 'number'),
    async () => {
      await api('/api/parametres/historique', { method: 'POST',
        body: { annee: new Date().getFullYear(), mois: parseInt($('#h_m').value), montant: parseFloat($('#h_v').value) || 0 } });
      closeModal(); toast('Enregistré'); viewParametres($('#view'));
    });
};
async function loadUsers() {
  const users = await api('/api/users');
  $('#usersBox').innerHTML = `
    <div class="tbl-wrap" style="box-shadow:none;max-height:none"><table><thead><tr><th>Identifiant</th><th>Rôle</th><th></th></tr></thead>
    <tbody>${users.map(u => `<tr><td>${esc(u.username)}</td><td>${esc(u.role)}</td>
      <td>${u.id === ME.id ? '<span class="muted">vous</span>' : `<button class="btn-sm btn-del" onclick='delUser(${u.id})'>🗑</button>`}</td></tr>`).join('')}</tbody></table></div>
    <button style="margin-top:12px" onclick="addUser()">+ Ajouter un utilisateur</button>`;
}
window.addUser = () => {
  openModal('Nouvel utilisateur',
    field('Identifiant', 'u_n') + field('Mot de passe', 'u_p', '', 'password') +
    selectField('Rôle', 'u_r', ['user', 'admin'], 'user'),
    async () => {
      try {
        await api('/api/users', { method: 'POST',
          body: { username: $('#u_n').value.trim(), password: $('#u_p').value, role: $('#u_r').value || 'user' } });
        closeModal(); toast('Créé'); loadUsers();
      } catch (e) { toast(e.message); }
    });
};
window.delUser = async id => {
  if (!confirm('Supprimer cet utilisateur ?')) return;
  await api('/api/users/' + id, { method: 'DELETE' }); toast('Supprimé'); loadUsers();
};
