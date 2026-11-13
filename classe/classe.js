// Rockin · Connecta't a la classe
// Mòdul compartit per les apps de Rockin (Teclat, Guitarra i baix, Bateria). Cada app el carrega amb
//   connectaClasse({ app, perfil, resum })
//     app:    'teclat' | 'guitarra' | 'bateria'
//     perfil: () => ({ id, nom }) del perfil que juga ara («Qui juga?»), o null
//     resum:  () => objecte amb el que ha aconseguit aquest perfil (vegeu el format a docs del portal)
//     lloc:   opcional, on va el botó: { left, bottom } en CSS
// L'alumne escriu el codi de la classe que li dona el docent, tria la seva banda i el seu nom.
// L'app envia al portal el resum i el temps de pràctica. Res més: ni enregistraments ni el que toca.

const API = /^(localhost|127\.0\.0\.1)$/.test(location.hostname)
  ? 'http://127.0.0.1:8099/classe/api.php'           // proves locals
  : 'https://portal.rockin.cat/classe/api.php';
const CLAU = 'rockin.classe.v1';
// Mentre les classes siguin de prova, el botó només surt a qui arriba amb l'enllaç de la classe
// (…/bateria/?classe=XXXX-XXXX) o ja s'hi ha connectat. Quan s'obri a tothom, posa-ho a true.
const OBERT = false;
const CADA = 60;            // segons entre enviaments
const INACTIU = 180;        // sense tocar res durant 3 minuts, el temps deixa de comptar

const llegeix = () => { try { return JSON.parse(localStorage.getItem(CLAU)) ?? { perfils: {} }; } catch { return { perfils: {} }; } };
const desa = (d) => { try { localStorage.setItem(CLAU, JSON.stringify(d)); } catch { /* sense lloc */ } };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// text/plain: així el navegador no fa la consulta prèvia de CORS
async function crida(dades, { keepalive = false } = {}) {
  const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(dades), keepalive });
  let j = {};
  try { j = await r.json(); } catch { /* */ }
  if (!r.ok) { const e = new Error(j.error || 'xarxa'); e.status = r.status; throw e; }
  return j;
}

const CSS = `
.rkc-pill{position:fixed;z-index:2147483000;left:12px;bottom:12px;display:flex;align-items:center;gap:8px;font:600 13px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif;
  background:#222;color:#fff;border:0;border-radius:999px;padding:8px 13px;box-shadow:0 2px 10px rgba(0,0,0,.25);cursor:pointer;max-width:calc(100vw - 24px)}
.rkc-pill:hover{background:#000}.rkc-pill i{width:9px;height:9px;border-radius:50%;background:#fdbe10;flex:none}
.rkc-pill.on i{background:#4cc38a}.rkc-pill span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rkc-dlg{border:0;border-radius:18px;padding:0;width:min(440px,calc(100vw - 24px));max-height:calc(100vh - 24px);box-shadow:0 10px 40px rgba(0,0,0,.35);
  font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;color:#222;background:#fff}
.rkc-dlg::backdrop{background:rgba(0,0,0,.55)}
.rkc-in{padding:20px 20px 18px}.rkc-in h2{font-size:20px;margin:0 0 4px;font-weight:800}.rkc-in p{margin:0 0 12px;color:#55524c}
.rkc-in label{display:block;font-weight:700;font-size:13px;margin:6px 0}
.rkc-in input{width:100%;box-sizing:border-box;font:700 22px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em;text-transform:uppercase;padding:12px;border:1.5px solid #ccc;border-radius:12px;text-align:center}
.rkc-in input:focus{outline:0;border-color:#222;box-shadow:0 0 0 3px rgba(253,190,16,.6)}
.rkc-tria{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px;margin:6px 0 4px;max-height:46vh;overflow:auto}
.rkc-tria button{font:inherit;font-weight:700;padding:12px 10px;border-radius:12px;border:1.5px solid #ddd;background:#f6f4ef;color:#222;cursor:pointer;text-align:center}
.rkc-tria button:hover{border-color:#222;background:#fff3c4}
.rkc-bt{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:14px}
.rkc-bt button{font:inherit;font-weight:700;padding:9px 16px;border-radius:999px;border:1.5px solid #222;background:#fff;color:#222;cursor:pointer}
.rkc-bt button.pri{background:#222;color:#fff}.rkc-err{color:#b3261e;font-weight:600;min-height:1.4em;margin:8px 0 0}
.rkc-qui{background:#f6f4ef;border-radius:12px;padding:10px 12px;margin:0 0 12px}.rkc-qui b{display:block;font-size:17px}
.rkc-nota{font-size:12.5px;color:#86827a;margin:12px 0 0}
`;

export function connectaClasse({ app, perfil, resum, lloc = null }) {
  if (typeof document === 'undefined') return;
  const st = document.createElement('style');
  st.textContent = CSS;
  document.head.append(st);
  const pill = document.createElement('button');
  pill.type = 'button';
  pill.className = 'rkc-pill';
  pill.hidden = true;
  if (lloc) Object.assign(pill.style, lloc);   // cada app el pot moure perquè no tapi res
  document.body.append(pill);
  const dlg = document.createElement('dialog');
  dlg.className = 'rkc-dlg';
  document.body.append(dlg);
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });

  // Codi de classe que arriba a l'enllaç: es recorda mentre la pestanya és oberta
  let codiURL = '';
  try {
    const q = new URLSearchParams(location.search).get('classe');
    if (q) sessionStorage.setItem('rockin.classe.codi', q.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8));
    codiURL = sessionStorage.getItem('rockin.classe.codi') || '';
  } catch { /* */ }
  const bonic = (c) => (c.length > 4 ? c.slice(0, 4) + '-' + c.slice(4) : c);
  let jaProposat = false;

  const clauPerfil = () => { const p = perfil(); return p ? `${app}|${p.id}` : null; };
  const enllac = () => { const k = clauPerfil(); return k ? llegeix().perfils[k] ?? null : null; };

  function pinta() {
    const p = perfil();
    if (!p) { pill.hidden = true; return; }
    const e = enllac();
    if (!e && !OBERT && !codiURL) { pill.hidden = true; return; }
    pill.hidden = false;
    // amb l'enllaç de la classe, la primera vegada que hi ha qui juga, ja obrim el pas del codi
    if (!e && codiURL && !jaProposat && !dlg.open) { jaProposat = true; setTimeout(() => { if (!enllac() && !dlg.open) pasCodi(bonic(codiURL)); }, 600); }
    pill.classList.toggle('on', !!e);
    pill.innerHTML = e ? `<i></i><span>Classe · ${esc(e.etiqueta)}</span>` : '<i></i><span>Connecta’t a la classe</span>';
    pill.title = e ? `Connectat a ${e.classe}` : 'Envia el teu progrés al teu docent';
  }

  // ---- Diàlegs ---------------------------------------------------------------------------
  const obre = (html) => { dlg.innerHTML = `<div class="rkc-in">${html}</div>`; if (!dlg.open) dlg.showModal(); };
  const tanca = () => dlg.close();

  function pasConnectat(e) {
    obre(`<h2>Connectat a la classe</h2>
      <div class="rkc-qui"><b>${esc(e.etiqueta)}</b>${esc(e.classe)}${e.banda ? ' · ' + esc(e.banda) : ''}</div>
      <p>El teu docent veu què has aconseguit en aquesta app i quanta estona hi practiques.</p>
      <div class="rkc-bt"><button type="button" data-a="fora">Desconnecta</button><button type="button" class="pri" data-a="ok">D’acord</button></div>`);
    dlg.querySelector('[data-a=ok]').onclick = tanca;
    dlg.querySelector('[data-a=fora]').onclick = async () => {
      const d = llegeix(); const k = clauPerfil();
      const tk = d.perfils[k]?.token;
      delete d.perfils[k]; desa(d);
      if (tk) crida({ accio: 'sortir', token: tk }).catch(() => {});
      tanca(); pinta();
    };
  }

  function pasCodi(codiInicial = '') {
    // Si en aquest navegador algú ja s'ha connectat, li ho proposem (és el cas més habitual)
    const d = llegeix();
    const altre = Object.values(d.perfils).filter((x) => x.codi && x.alumne).sort((a, b) => (b.quan ?? 0) - (a.quan ?? 0))[0];
    obre(`<h2>Connecta’t a la classe</h2>
      ${altre ? `<p>Ets <b>${esc(altre.etiqueta)}</b>, de ${esc(altre.classe)}?</p>
        <div class="rkc-bt" style="justify-content:flex-start;margin:0 0 14px"><button type="button" class="pri" data-a="soc">Sí, sóc jo</button></div>
        <p style="margin-bottom:6px">Si no, escriu el codi de la teva classe:</p>`
      : '<p>Escriu el codi que t’ha donat el teu docent.</p>'}
      <label for="rkc-codi">Codi de la classe</label>
      <input id="rkc-codi" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="9" placeholder="XXXX-XXXX" value="${esc(codiInicial)}">
      <div class="rkc-err" role="alert"></div>
      <div class="rkc-bt"><button type="button" data-a="no">Ara no</button><button type="button" class="pri" data-a="seg">Següent</button></div>
      <p class="rkc-nota">Només s’envia el que has aconseguit a l’app i el temps que hi practiques.</p>`);
    const inp = dlg.querySelector('#rkc-codi'), err = dlg.querySelector('.rkc-err');
    dlg.querySelector('[data-a=no]').onclick = tanca;
    if (altre) dlg.querySelector('[data-a=soc]').onclick = () => uneix(altre.codi, altre.alumne, err);
    const seg = async () => {
      const codi = inp.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (codi.length !== 8) { err.textContent = 'El codi té 8 lletres i números.'; return; }
      err.textContent = 'Buscant la classe…';
      try {
        const c = await crida({ accio: 'classe', codi });
        pasBanda(codi, c);
      } catch (e) {
        err.textContent = e.status === 404 ? 'No trobem cap classe amb aquest codi. Revisa’l amb el teu docent.'
          : e.status === 429 ? 'Massa intents. Espera uns minuts i torna-ho a provar.' : 'No hi ha connexió. Torna-ho a provar.';
      }
    };
    dlg.querySelector('[data-a=seg]').onclick = seg;
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); seg(); } });
    inp.addEventListener('input', () => { const v = inp.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8); inp.value = v.length > 4 ? v.slice(0, 4) + '-' + v.slice(4) : v; });
    setTimeout(() => inp.focus(), 50);
  }

  function pasBanda(codi, c) {
    if (!c.bandes.length) { obre(`<h2>${esc(c.classe.nom)}</h2><p>Aquesta classe encara no té alumnes. Avisa el teu docent.</p><div class="rkc-bt"><button type="button" class="pri">D’acord</button></div>`); dlg.querySelector('button').onclick = tanca; return; }
    if (c.bandes.length === 1) return pasNom(codi, c, c.bandes[0]);
    obre(`<h2>${esc(c.classe.nom)}</h2><p>Quina és la teva banda?</p>
      <div class="rkc-tria">${c.bandes.map((b, i) => `<button type="button" data-i="${i}">${esc(b.nom)}</button>`).join('')}</div>
      <div class="rkc-bt"><button type="button" data-a="enrere">Enrere</button></div>`);
    dlg.querySelectorAll('.rkc-tria button').forEach((b) => { b.onclick = () => pasNom(codi, c, c.bandes[+b.dataset.i]); });
    dlg.querySelector('[data-a=enrere]').onclick = () => pasCodi(codi);
  }

  function pasNom(codi, c, banda) {
    obre(`<h2>${esc(banda.nom)}</h2><p>Qui ets?</p>
      <div class="rkc-tria">${banda.alumnes.map((a) => `<button type="button" data-id="${a.id}">${esc(a.etiqueta)}</button>`).join('')}</div>
      <div class="rkc-err" role="alert"></div>
      <div class="rkc-bt"><button type="button" data-a="enrere">Enrere</button></div>
      <p class="rkc-nota">Si no hi surts, avisa el teu docent.</p>`);
    const err = dlg.querySelector('.rkc-err');
    dlg.querySelectorAll('.rkc-tria button').forEach((b) => { b.onclick = () => uneix(codi, +b.dataset.id, err); });
    dlg.querySelector('[data-a=enrere]').onclick = () => (c.bandes.length > 1 ? pasBanda(codi, c) : pasCodi(codi));
  }

  async function uneix(codi, alumne, err) {
    const p = perfil();
    if (!p) return tanca();
    err.textContent = 'Connectant…';
    try {
      const r = await crida({ accio: 'unir', codi, alumne, app, perfil: p.nom });
      const d = llegeix();
      d.perfils[`${app}|${p.id}`] = { token: r.token, etiqueta: r.etiqueta, classe: r.classe, banda: r.banda, codi, alumne, quan: Date.now() };
      desa(d);
      pinta();
      ultim = '';            // envia el resum de seguida
      envia();
      pasConnectat(d.perfils[`${app}|${p.id}`]);
    } catch (e) {
      err.textContent = e.status === 404 ? 'Aquesta classe o aquest nom ja no hi són. Torna a escriure el codi.' : 'No s’ha pogut connectar. Torna-ho a provar.';
    }
  }

  pill.addEventListener('click', () => { const e = enllac(); if (e) pasConnectat(e); else pasCodi(); });

  // ---- Temps de pràctica i enviament ---------------------------------------------------------
  let darrerGest = Date.now(), acumulat = 0, ultim = '', ultimEnviament = 0, darrerCanvi = '';
  for (const ev of ['pointerdown', 'keydown', 'touchstart', 'wheel']) addEventListener(ev, () => { darrerGest = Date.now(); }, { passive: true, capture: true });
  // Quan l'app desa un intent (també tocant amb MIDI), també compta com a activitat
  const empremta = () => { try { const r = resum(); return r ? JSON.stringify(r) : ''; } catch { return ''; } };

  setInterval(() => {
    const e = enllac();
    if (!e) return;
    if (document.visibilityState === 'visible' && Date.now() - darrerGest < INACTIU * 1000) acumulat += 5;
  }, 5000);
  setInterval(() => {
    const ara = empremta();
    if (ara && ara !== darrerCanvi) { darrerCanvi = ara; darrerGest = Date.now(); }
  }, 15000);

  async function envia({ final = false } = {}) {
    const e = enllac(); const p = perfil();
    if (!e || !p) return;
    const r = (() => { try { return resum(); } catch { return null; } })();
    const json = r ? JSON.stringify(r) : '';
    const segons = acumulat;
    if (!segons && json === ultim) return;
    const dades = { accio: 'progres', token: e.token, app, perfil: p.nom, segons };
    if (json !== ultim && r) dades.resum = r;
    acumulat = 0;
    try {
      await crida(dades, { keepalive: final });
      if (dades.resum) ultim = json;
      ultimEnviament = Date.now();
    } catch (er) {
      if (er.status === 401) {          // el docent l'ha tret de la classe o l'ha desconnectat
        const d = llegeix(); delete d.perfils[clauPerfil()]; desa(d); pinta();
      } else acumulat += segons;        // es tornarà a provar
    }
  }
  setInterval(() => envia(), CADA * 1000);
  addEventListener('pagehide', () => envia({ final: true }));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') envia({ final: true }); });

  // El perfil pot canviar dins de l'app («Qui juga?»): ho mirem sovint
  let perfilAbans = null;
  setInterval(() => {
    const k = clauPerfil();
    if (k !== perfilAbans) { perfilAbans = k; ultim = ''; acumulat = 0; }   // el temps d'abans no s'atribueix a l'altre perfil
    pinta();
  }, 1500);
  pinta();

  // Comprova que la connexió encara és vàlida en obrir l'app
  const e0 = enllac();
  if (e0) crida({ accio: 'qui', token: e0.token }).then((r) => {
    const d = llegeix(); const k = clauPerfil();
    if (d.perfils[k]) { Object.assign(d.perfils[k], { etiqueta: r.etiqueta, classe: r.classe, banda: r.banda }); desa(d); pinta(); }
  }).catch((er) => { if (er.status === 401) { const d = llegeix(); delete d.perfils[clauPerfil()]; desa(d); pinta(); } });

  return { pinta, envia };
}
