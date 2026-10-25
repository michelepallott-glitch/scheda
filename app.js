"use strict";
/* Scheda: diario di allenamento che vive tutto sul telefono (localStorage), senza account ne' server.
   Le regole di progressione sono in `valuta()`; dopo ogni seduta diventano proposte che l'utente accetta,
   rifiuta o corregge con un valore suo. */
(() => {
const CHIAVE = "scheda-dati-v1";
const TIPI = {pesi: "Pesi", zavorrato: "Zavorrato", corpo_libero: "Corpo libero", isometria: "Tenuta"};
const GIORNI_BREVI = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];
const GIORNI = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];
const ORDINE_SETTIMANA = [1, 2, 3, 4, 5, 6, 0];
const MESI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
const ICONA_TIMER = `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13.5" r="7.5"/><path d="M12 10v3.5l2.5 2M9.5 2.5h5M12 2.5V6M18.5 6.5l1.5-1.5"/></svg>`;

// ---------------------------------------------------------------- utilita'
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
const fmt = v => v == null || v === "" ? "" : Number(v).toLocaleString("it-IT", {maximumFractionDigits: 2});
const num = v => { if (v === "" || v == null) return null; const x = Number(String(v).replace(",", ".")); return isNaN(x) ? null : x; };
const pad = n => String(n).padStart(2, "0");
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const daIso = s => { const [y, m, g] = s.split("-").map(Number); return new Date(y, m - 1, g); };
const piuGiorni = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const lunedi = d => piuGiorni(d, -((d.getDay() + 6) % 7));
const oggi = () => iso(new Date());
const dataBella = s => { const d = daIso(s); return `${GIORNI[d.getDay()]} ${d.getDate()} ${MESI[d.getMonth()]}`; };
const dataBreve = s => { const d = daIso(s); return `${d.getDate()} ${MESI[d.getMonth()]}`; };
const mmss = s => `${Math.floor(s / 60)}:${pad(Math.max(0, Math.round(s % 60)))}`;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const arrotonda = (kg, passo = 1.25) => Math.round(Math.round(kg / passo) * passo * 100) / 100;
const memo = {
  get(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} },
};

// ---------------------------------------------------------------- dati
function nuovoStato() { return {versione: 1, schede: [], attiva: null, allenamenti: [], proposte: [], pesate: [], obiettivo_peso: null}; }
let D = (() => { const s = memo.get(CHIAVE); return s && s.versione === 1 ? Object.assign(nuovoStato(), s) : nuovoStato(); })();
function salva() {
  if (!memo.set(CHIAVE, D)) avvisa("Non riesco a salvare: memoria del browser piena o bloccata. Fai un backup da Altro.");
}
try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) {}

const S = {vista: memo.get("scheda-vista") || "oggi", scelta: null, risultato: null, modifica: null, esStorico: memo.get("scheda-es")};
const schedaAttiva = () => D.schede.find(s => s.id === D.attiva) || null;
const ordinati = () => [...D.allenamenti].sort((a, b) => b.data.localeCompare(a.data) || (b.creato_il || "").localeCompare(a.creato_il || ""));

// ---------------------------------------------------------------- regole di progressione
/* p = esercizio della scheda; serie = [{rip, sec, kg}] fatte oggi. Restituisce
   {esito, testo, modifiche: {campo: nuovo}, tipo}. 'fallimenti' da solo e' contabilita' e si applica subito;
   le altre modifiche diventano una proposta (tranne la calibrazione, che si applica da sola). */
function valuta(p, serie) {
  const u = p.tipo === "isometria" ? "s" : "rip";
  const val = s => (p.tipo === "isometria" ? s.sec : s.rip) || 0;
  const conKg = p.tipo === "pesi" || p.tipo === "zavorrato";
  const r = (esito, testo, modifiche = {}, tipo = null) => ({esito, testo, modifiche, tipo});
  if (!serie.length) return r("saltato", "Non eseguito.");

  // 1. calibrazione: il carico usato la prima volta diventa quello di partenza
  if (conKg && (p.carico == null || p.carico === "")) {
    const riuscite = serie.filter(s => val(s) >= p.min).map(s => s.kg || 0);
    const nuovo = riuscite.length ? Math.max(...riuscite) : arrotonda(Math.max(...serie.map(s => s.kg || 0)) * 0.9);
    if (!nuovo && p.tipo === "pesi") return r("mantieni", "Scrivi i kg usati: servono per fissare il carico di partenza.");
    return r("calibrazione", p.tipo === "zavorrato" && !nuovo ? "Partenza a corpo libero, senza zavorra."
      : `Carico di partenza fissato a ${fmt(nuovo)} kg.`, {carico: nuovo, fallimenti: 0}, "calibrazione");
  }
  // 2. condizioni che non permettono di valutare
  if (serie.length < p.serie) return r("mantieni", `Fatte ${serie.length} serie su ${p.serie}: stesso obiettivo la prossima volta.`);
  let prev = Number(p.carico) || 0;
  if (conKg) {
    const usato = Math.min(...serie.map(s => s.kg || 0));
    if (usato < prev - 0.01) return r("mantieni", `Usati ${fmt(usato)} kg invece di ${fmt(prev)}: obiettivo invariato.`);
    prev = Math.max(prev, usato);
  }
  const principali = serie.slice(0, p.serie).map(val);
  const successo = principali.every(v => v >= p.max);
  const fallimento = principali.some(v => v < p.min);
  const varianti = p.varianti || [];
  const i = varianti.indexOf(p.variante);

  // 3. successo: tutte le serie al massimo dell'intervallo
  if (successo) {
    if (conKg) {
      const nuovo = Math.round((prev + Number(p.incremento || 0)) * 100) / 100;
      return r("progresso", `Tutte le serie a ${p.max} ${u}: ${p.tipo === "zavorrato" ? "zavorra" : "carico"} da ${fmt(prev)} a ${fmt(nuovo)} kg, ripartendo da ${p.min} ${u}.`,
        {carico: nuovo, fallimenti: 0}, "carico");
    }
    if (i >= 0 && i < varianti.length - 1)
      return r("progresso", `Tutte le serie a ${p.max} ${u}: si passa a ${varianti[i + 1]}, ripartendo da ${p.min} ${u}.`, {variante: varianti[i + 1], fallimenti: 0}, "variante");
    return r("progresso", `Tutte le serie a ${p.max} ${u}: obiettivo portato a ${p.min + 2}-${p.max + 2} ${u}.`, {min: p.min + 2, max: p.max + 2, fallimenti: 0}, "intervallo");
  }
  // 4. stallo: almeno una serie sotto il minimo; al secondo di fila si alleggerisce
  if (fallimento) {
    const stalli = (p.fallimenti || 0) + 1;
    if (stalli < 2) return r("stallo", `Una serie sotto ${p.min} ${u} (stallo ${stalli} di 2): stesso obiettivo la prossima volta.`, {fallimenti: stalli});
    if (conKg) {
      const nuovo = prev > Number(p.incremento || 0) ? arrotonda(prev * 0.9) : 0;
      if (nuovo === prev) return r("stallo", "Stallo ripetuto al carico minimo: prova un intervallo di ripetizioni più basso.", {fallimenti: stalli});
      return r("regressione", `Due stalli di fila: carico da ${fmt(prev)} a ${fmt(nuovo)} kg per ripartire con margine.`, {carico: nuovo, fallimenti: 0}, "carico");
    }
    if (i > 0) return r("regressione", `Due stalli di fila: si torna a ${varianti[i - 1]} per consolidare.`, {variante: varianti[i - 1], fallimenti: 0}, "variante");
    return r("stallo", "Due stalli di fila alla variante più facile: prova un intervallo più basso.", {fallimenti: stalli});
  }
  // 5. nel mezzo: stesso carico, una ripetizione in piu' nella serie piu' debole
  const debole = Math.min(...principali);
  return r("mantieni", `Serie tra ${fmt(debole)} e ${fmt(Math.max(...principali))} ${u}: stesso carico, la prossima volta cerca ${fmt(Math.min(debole + (u === "s" ? 2 : 1), p.max))} ${u} nella serie più debole.`,
    p.fallimenti ? {fallimenti: 0} : {});
}
window.SchedaTest = {valuta};

// ---------------------------------------------------------------- calendario e rotazione
function giornoPrevisto(sch, d) {
  const g = sch.giorni && sch.giorni.filter(x => x && x.length);
  if (!g || !g.length) return true;
  const inizio = lunedi(daIso(sch.inizio || iso(new Date())));
  const sett = Math.round((lunedi(d) - inizio) / (7 * 864e5));
  return g[((sett % g.length) + g.length) % g.length].includes(d.getDay());
}
function prossime(sch, quante = 6) {
  if (!sch || !sch.sedute.length) return [];
  const ultima = ordinati().find(a => a.scheda_id === sch.id);
  let idx = ultima ? sch.sedute.findIndex(s => s.id === ultima.seduta_id) + 1 : 0;
  if (idx < 0) idx = 0;
  const conGiorni = sch.giorni && sch.giorni.some(x => x && x.length);
  const fattaOggi = D.allenamenti.some(a => a.data === oggi() && a.scheda_id === sch.id);
  let d = fattaOggi ? piuGiorni(new Date(), 1) : new Date();
  const out = [];
  for (let i = 0; i < 60 && out.length < quante; i++, d = piuGiorni(d, 1)) {
    if (!conGiorni || giornoPrevisto(sch, d)) { out.push({data: conGiorni ? iso(d) : null, seduta: sch.sedute[idx % sch.sedute.length]}); idx++; }
  }
  return out;
}

// ---------------------------------------------------------------- testo degli obiettivi
function obiettivo(e) {
  const u = e.tipo === "isometria" ? "s" : "rip";
  let t = `${e.serie} × ${e.min}–${e.max} ${u}`;
  if (e.tipo === "pesi") t += e.carico != null && e.carico !== "" ? ` · ${fmt(e.carico)} kg` : " · carico da trovare";
  if (e.tipo === "zavorrato") t += e.carico ? ` · +${fmt(e.carico)} kg` : e.carico === 0 ? " · corpo libero" : " · zavorra da trovare";
  return t;
}
function ultimaVolta(esId, nome) {
  for (const a of ordinati()) {
    const e = (a.esercizi || []).find(x => x.id === esId) || (a.esercizi || []).find(x => x.nome === nome);
    if (e && e.serie && e.serie.length) return {data: a.data, e};
  }
  return null;
}
const fmtSerie = e => (e.serie || []).map(x => (x.kg ? fmt(x.kg) + "×" : "") + (x.sec != null ? fmt(x.sec) + "s" : fmt(x.rip))).join("  ");

// ---------------------------------------------------------------- avvisi
let tAvviso;
function avvisa(testo) {
  let el = $("avviso-flottante");
  if (!el) { el = document.createElement("div"); el.id = "avviso-flottante"; el.className = "esito";
    el.style.cssText = "position:fixed;left:16px;right:16px;top:calc(env(safe-area-inset-top,0px) + 10px);z-index:20;box-shadow:0 6px 24px rgba(0,0,0,.18)";
    document.body.appendChild(el); }
  el.textContent = testo; el.hidden = false; clearTimeout(tAvviso); tAvviso = setTimeout(() => el.hidden = true, 3500);
}

// ---------------------------------------------------------------- timer di recupero
const T = {fine: 0, id: null, audio: null, lock: null};
function avviaTimer(secondi, cosa) {
  try { T.audio = T.audio || new (window.AudioContext || window.webkitAudioContext)(); T.audio.resume && T.audio.resume(); } catch (e) {}
  T.fine = Date.now() + secondi * 1000; T.durata = secondi; $("timer-cosa").textContent = cosa;
  $("timer").hidden = false; $("timer").classList.remove("finito");
  clearInterval(T.id); T.id = setInterval(tick, 250); tick();
  if (navigator.wakeLock && !T.lock) navigator.wakeLock.request("screen").then(l => { T.lock = l; l.addEventListener("release", () => T.lock = null); }).catch(() => {});
}
function tick() {
  const resto = (T.fine - Date.now()) / 1000;
  $("timer-barra").style.transform = `scaleX(${Math.max(0, Math.min(1, resto / (T.durata || 1)))})`;   // la scia si accorcia
  if (resto <= 0) { clearInterval(T.id); $("timer-tempo").textContent = "Vai!"; $("timer").classList.add("finito"); suona(); return; }
  $("timer-tempo").textContent = mmss(Math.ceil(resto));
}
function suona() {
  try {
    const a = T.audio; if (!a) return;
    [0, 0.25, 0.5].forEach(t => { const o = a.createOscillator(), g = a.createGain(); o.frequency.value = 880;
      g.gain.setValueAtTime(0.18, a.currentTime + t); g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + t + 0.2);
      o.connect(g).connect(a.destination); o.start(a.currentTime + t); o.stop(a.currentTime + t + 0.2); });
  } catch (e) {}
  try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch (e) {}
}
$("timer-piu").onclick = () => { if (T.fine < Date.now()) { T.fine = Date.now(); T.durata = 0; } T.fine += 15000;
  T.durata = Math.max(T.durata || 0, (T.fine - Date.now()) / 1000); $("timer").classList.remove("finito"); clearInterval(T.id); T.id = setInterval(tick, 250); tick(); };
$("timer-stop").onclick = () => { clearInterval(T.id); $("timer").hidden = true; };
document.addEventListener("visibilitychange", () => { if (!document.hidden && !$("timer").hidden) tick(); });

// ---------------------------------------------------------------- bozza della seduta in corso
const chiaveBozza = sid => "scheda-bozza-" + sid;
function bozza(sed) {
  const b = memo.get(chiaveBozza(sed.id));
  const iniziata = b && Object.values(b.es || {}).some(r => r.some(s => s.ok));
  if (b && (iniziata || b.data === oggi())) {
    for (const e of sed.esercizi) if (!b.es[e.id]) b.es[e.id] = righeNuove(e);   // esercizi aggiunti dopo
    return b;
  }
  const nuova = {data: oggi(), rpe: "", durata: "", peso: "", note: "", es: {}};
  for (const e of sed.esercizi) nuova.es[e.id] = righeNuove(e);
  return nuova;
}
function righeNuove(e) {
  const u = ultimaVolta(e.id, e.nome);
  return Array.from({length: e.serie}, (_, i) => {
    const prec = u && u.e.serie[i];
    const kg = e.tipo === "pesi" || e.tipo === "zavorrato" ? (e.carico != null && e.carico !== "" ? e.carico : prec && prec.kg != null ? prec.kg : "") : "";
    return {val: "", kg, ph: prec ? (e.tipo === "isometria" ? prec.sec : prec.rip) : e.max, ok: false};
  });
}

// ---------------------------------------------------------------- vista OGGI
function vistaOggi() {
  const el = $("v-oggi");
  const sch = schedaAttiva();
  if (!D.schede.length) {
    el.innerHTML = `<div class="blocco pila"><h2>Benvenuto</h2>
      <p>Qui scrivi la tua scheda, segni le serie mentre ti alleni e, dopo ogni seduta, l'app ti propone come progredire: più carico, una ripetizione in più o la variante successiva.</p>
      <p class="sub">Tutto resta su questo telefono: nessun account. Ricordati ogni tanto il backup da Altro.</p>
      <button class="pulsante pieno" type="button" id="crea-prima">Crea la mia scheda</button>
      <button class="pulsante secondario pieno" type="button" id="crea-esempio">Prova con una scheda di esempio</button></div>` + bloccoInstalla();
    $("crea-prima").onclick = () => { const s = nuovaScheda("La mia scheda"); S.modifica = s.id; mostra("schede"); };
    $("crea-esempio").onclick = () => { creaEsempio(); render(); guidaSeNuova("oggi"); };
    return;
  }
  if (!sch || !sch.sedute.length) {
    el.innerHTML = `<div class="blocco pila"><p>${sch ? "La scheda attiva non ha ancora sedute." : "Scegli quale scheda usare."}</p>
      <button class="pulsante" type="button" id="vai-schede">Vai alle schede</button></div>`;
    $("vai-schede").onclick = () => { if (sch) S.modifica = sch.id; mostra("schede"); };
    return;
  }
  const lista = prossime(sch);
  const prossima = lista[0];
  const sed = sch.sedute.find(s => s.id === S.scelta) || prossima.seduta;
  const b = bozza(sed);
  let h = "";
  if (S.risultato) h += bloccoRisultato();
  else h += bloccoProposte();
  const quando = S.scelta && S.scelta !== prossima.seduta.id ? "Seduta scelta" : prossima.data ? (prossima.data === oggi() ? "Oggi" : dataBella(prossima.data)) : "Prossima seduta";
  h += `<div class="riga"><div><div class="eyebrow">${esc(quando)}</div><h2>${esc(sed.nome)}</h2></div>
    ${sch.sedute.length > 1 ? `<select id="scelta" aria-label="Cambia seduta">${sch.sedute.map(s => `<option value="${esc(s.id)}" ${s.id === sed.id ? "selected" : ""}>${esc(s.nome)}</option>`).join("")}</select>` : ""}</div>`;
  if (!sed.esercizi.length) h += `<div class="blocco"><p class="vuoto">Questa seduta non ha esercizi. Aggiungili dalla scheda.</p></div>`;
  for (const e of sed.esercizi) {
    const u = ultimaVolta(e.id, e.nome), isoE = e.tipo === "isometria", conKg = e.tipo === "pesi" || e.tipo === "zavorrato";
    const righe = (b.es[e.id] || []).map((s, i) => `
      <div class="n">${i + 1}</div>
      <input inputmode="decimal" data-es="${esc(e.id)}" data-i="${i}" data-k="val" value="${esc(s.val)}" placeholder="${esc(s.ph)}" aria-label="${isoE ? "Secondi" : "Ripetizioni"} serie ${i + 1}" class="${s.ok ? "fatta" : ""}">
      ${conKg ? `<input inputmode="decimal" data-es="${esc(e.id)}" data-i="${i}" data-k="kg" value="${esc(s.kg)}" placeholder="kg" aria-label="Chili serie ${i + 1}" class="${s.ok ? "fatta" : ""}">` : ""}
      <button type="button" class="orologio" data-es="${esc(e.id)}" data-i="${i}" aria-label="Avvia il recupero dopo la serie ${i + 1}">${ICONA_TIMER}</button>
      <button type="button" class="spunta" data-es="${esc(e.id)}" data-i="${i}" aria-pressed="${s.ok}" aria-label="Serie ${i + 1} fatta">✓</button>`).join("");
    h += `<article class="blocco">
      <div class="es-testa"><h3>${esc(e.nome)}</h3><span class="tipo">${TIPI[e.tipo] || ""}</span></div>
      <div class="target">${esc(obiettivo(e))}${e.variante ? ` · <span class="var">${esc(e.variante)}</span>` : ""}</div>
      <div class="dett">RIR ${e.rir ?? 2} · recupero ${mmss(e.recupero_sec || 90)}</div>
      ${u ? `<div class="ultima">Ultima volta (${esc(dataBreve(u.data))}): ${esc(fmtSerie(u.e))}</div>` : ""}
      ${e.note ? `<div class="nota">${esc(e.note)}</div>` : ""}
      <div class="serie ${conKg ? "" : "senza-kg"}">
        <div></div><div class="h">${isoE ? "Secondi" : "Ripetizioni"}</div>${conKg ? `<div class="h">${e.tipo === "zavorrato" ? "Zavorra kg" : "Kg"}</div>` : ""}<div></div><div></div>
        ${righe}
      </div>
      <button type="button" class="link" data-modifica="${esc(e.id)}">Modifica obiettivo o carico</button>
    </article>`;
  }
  h += `<div class="blocco pila">
    <div class="campi">
      <label>Data<input type="date" id="f-data" value="${esc(b.data)}"></label>
      <label>Durata (minuti)<input inputmode="numeric" id="f-durata" value="${esc(b.durata)}" placeholder="70"></label>
      <label>Fatica della seduta (1-10)<input inputmode="decimal" id="f-rpe" value="${esc(b.rpe)}" placeholder="8"></label>
      <label>Peso corporeo (kg)<input inputmode="decimal" id="f-peso" value="${esc(b.peso)}" placeholder="facoltativo"></label>
      <label class="largo">Note<textarea id="f-note" placeholder="Sonno, sensazioni, dolori">${esc(b.note)}</textarea></label>
    </div>
    <button class="pulsante pieno" type="button" id="salva">Salva seduta</button>
    <button class="pulsante secondario pieno" type="button" id="svuota">Ricomincia la seduta</button>
    <div id="msg" class="sub"></div>
  </div>`;
  if (lista.some(x => x.data)) h += `<div class="blocco"><div class="eyebrow" style="margin-bottom:6px">Prossimi allenamenti</div><table>${lista.map(x =>
    `<tr><td>${esc(dataBella(x.data))}</td><td>${esc(x.seduta.nome)}</td></tr>`).join("")}</table></div>`;
  el.innerHTML = h;
  collegaProposte();

  if ($("scelta")) $("scelta").onchange = ev => { S.scelta = ev.target.value; S.risultato = null; render(); };
  el.querySelectorAll("input[data-es]").forEach(inp => inp.addEventListener("input", () => {
    b.es[inp.dataset.es][+inp.dataset.i][inp.dataset.k] = inp.value; memo.set(chiaveBozza(sed.id), b);
  }));
  for (const [id, k] of [["f-data", "data"], ["f-durata", "durata"], ["f-rpe", "rpe"], ["f-peso", "peso"], ["f-note", "note"]])
    $(id).addEventListener("input", ev => { b[k] = ev.target.value; memo.set(chiaveBozza(sed.id), b); });
  el.querySelectorAll(".spunta").forEach(btn => btn.onclick = () => {
    const e = sed.esercizi.find(x => x.id === btn.dataset.es), i = +btn.dataset.i, s = b.es[e.id][i];
    s.ok = !s.ok;
    if (s.ok && (s.val === "" || s.val == null)) s.val = String(s.ph ?? "");
    memo.set(chiaveBozza(sed.id), b); renderFermo();
    if (s.ok) avviaTimer(e.recupero_sec || 90, cosaDopo(sed, e, b));   // ogni serie segnata fa partire il recupero
  });
  el.querySelectorAll(".orologio").forEach(btn => btn.onclick = () => {
    const e = sed.esercizi.find(x => x.id === btn.dataset.es);
    avviaTimer(e.recupero_sec || 90, `${e.nome} · recupero dopo la serie ${+btn.dataset.i + 1}`);
  });
  el.querySelectorAll("[data-modifica]").forEach(btn => btn.onclick = () => dialogoEsercizio(sch, sed, sed.esercizi.find(x => x.id === btn.dataset.modifica)));
  $("svuota").onclick = () => { if (confirm("Cancellare le serie segnate in questa seduta?")) { memo.del(chiaveBozza(sed.id)); render(); } };
  $("salva").onclick = () => salvaSeduta(sch, sed, b);
}

// cosa viene dopo il recupero: la prossima serie da fare, il prossimo esercizio o la fine
function cosaDopo(sed, e, b) {
  const prossima = b.es[e.id].findIndex(x => !x.ok);
  if (prossima >= 0) return `${e.nome} · serie ${prossima + 1}`;
  const i = sed.esercizi.indexOf(e), daFare = x => (b.es[x.id] || []).some(s => !s.ok);
  const dopo = sed.esercizi.slice(i + 1).find(daFare) || sed.esercizi.slice(0, i).find(daFare);
  return dopo ? `Prossimo: ${dopo.nome}` : "Ultima serie fatta: salva la seduta";
}

function salvaSeduta(sch, sed, b) {
  const esercizi = sed.esercizi.map(e => {
    const serie = (b.es[e.id] || []).filter(s => s.ok && num(s.val) != null).map(s => {
      const v = num(s.val), kg = num(s.kg);
      return e.tipo === "isometria" ? {sec: v} : {rip: Math.round(v), ...(kg != null && (e.tipo === "pesi" || e.tipo === "zavorrato") ? {kg} : {})};
    });
    return {id: e.id, nome: e.nome, tipo: e.tipo, variante: e.variante || null, serie};
  }).filter(e => e.serie.length);
  if (!esercizi.length) { $("msg").textContent = "Segna almeno una serie con ✓ prima di salvare."; return; }
  const a = {id: uid(), data: b.data || oggi(), scheda_id: sch.id, seduta_id: sed.id, nome_seduta: sed.nome, esercizi,
    durata_min: num(b.durata), rpe: num(b.rpe), peso: num(b.peso), note: b.note || "", creato_il: new Date().toISOString()};
  D.allenamenti.push(a);
  if (a.peso) D.pesate.push({data: a.data, kg: a.peso});
  // regole: una valutazione per esercizio
  const valutazioni = [], nuove = [];
  for (const e of sed.esercizi) {
    const fatto = esercizi.find(x => x.id === e.id);
    const v = valuta(e, fatto ? fatto.serie : []);
    valutazioni.push({nome: e.nome, ...v});
    const m = {...v.modifiche};
    if ("fallimenti" in m) { e.fallimenti = m.fallimenti; delete m.fallimenti; }
    if (v.tipo === "calibrazione") { Object.assign(e, m); continue; }
    if (v.tipo && Object.keys(m).length) {
      D.proposte = D.proposte.filter(p => !(p.stato === "attesa" && p.scheda_id === sch.id && p.es_id === e.id));
      const p = {id: uid(), data: a.data, scheda_id: sch.id, seduta_id: sed.id, es_id: e.id, es_nome: e.nome, tipo: v.tipo, testo: v.testo, stato: "attesa",
        da: Object.fromEntries(Object.keys(m).map(k => [k, e[k] ?? null])), a: m};
      D.proposte.push(p); nuove.push(p.id);
    }
  }
  salva(); memo.del(chiaveBozza(sed.id));
  S.risultato = {seduta: sed.nome, valutazioni, proposte: nuove}; S.scelta = null;
  render(); window.scrollTo(0, 0);
}

// proposte: applicabili cosi' come sono o con un valore scelto dall'utente
function trovaEsercizio(p) {
  const sch = D.schede.find(s => s.id === p.scheda_id); if (!sch) return {};
  const sed = sch.sedute.find(s => s.id === p.seduta_id);
  return {sch, sed, e: sed && sed.esercizi.find(x => x.id === p.es_id)};
}
function cartaProposta(p) {
  const {e} = trovaEsercizio(p);
  if (!e) return "";
  let campo = "";
  if (p.tipo === "carico") campo = `<label class="campo" style="flex-direction:row;align-items:center;gap:8px">${e.tipo === "zavorrato" ? "Zavorra" : "Carico"}
    <input inputmode="decimal" data-valore="${esc(p.id)}" value="${esc(fmt(p.a.carico))}"> kg</label>`;
  if (p.tipo === "variante") campo = `<select data-valore="${esc(p.id)}" aria-label="Variante">${(e.varianti || []).map(v => `<option ${v === p.a.variante ? "selected" : ""}>${esc(v)}</option>`).join("")}</select>`;
  return `<li class="proposta"><b>${esc(e.nome)}</b><div class="dett">${esc(p.testo)}</div>
    <div class="controlli">${campo}<button class="pulsante piccolo" type="button" data-applica="${esc(p.id)}">Applica</button>
    <button class="pulsante secondario piccolo" type="button" data-rifiuta="${esc(p.id)}">Lascia com'è</button></div></li>`;
}
function bloccoProposte() {
  const attesa = D.proposte.filter(p => p.stato === "attesa" && trovaEsercizio(p).e);
  if (!attesa.length) return "";
  return `<div class="blocco"><h3>Progressioni da decidere</h3><p class="sub" style="margin:2px 0 4px">Puoi accettarle, cambiare il valore o lasciare tutto com'è.</p>
    <ul class="lista">${attesa.map(cartaProposta).join("")}</ul></div>`;
}
function bloccoRisultato() {
  const r = S.risultato;
  const attesa = D.proposte.filter(p => r.proposte.includes(p.id) && p.stato === "attesa");
  const altre = D.proposte.filter(p => p.stato === "attesa" && !r.proposte.includes(p.id) && trovaEsercizio(p).e);
  return `<div class="esito"><b>${esc(r.seduta)} salvata.</b></div>
    <div class="blocco"><h3>Com'è andata</h3><ul class="lista">${r.valutazioni.filter(v => v.esito !== "saltato").map(v =>
      `<li><b>${esc(v.nome)}</b><div class="dett">${esc(v.testo)}</div></li>`).join("")}</ul></div>
    ${attesa.length || altre.length ? `<div class="blocco"><h3>Progressioni da decidere</h3><ul class="lista">${[...attesa, ...altre].map(cartaProposta).join("")}</ul></div>` : ""}
    <button class="pulsante secondario" type="button" id="chiudi-risultato">Vai alla prossima seduta</button>`;
}
function collegaProposte() {
  document.querySelectorAll("[data-applica]").forEach(btn => btn.onclick = () => decidi(btn.dataset.applica, true));
  document.querySelectorAll("[data-rifiuta]").forEach(btn => btn.onclick = () => decidi(btn.dataset.rifiuta, false));
  if ($("chiudi-risultato")) $("chiudi-risultato").onclick = () => { S.risultato = null; render(); window.scrollTo(0, 0); };
}
function decidi(id, applica) {
  const p = D.proposte.find(x => x.id === id); if (!p) return;
  const {sch, e} = trovaEsercizio(p);
  if (applica && e) {
    const nuovo = {...p.a};
    const inp = document.querySelector(`[data-valore="${CSS.escape(id)}"]`);
    if (inp && p.tipo === "carico") { const v = num(inp.value); if (v == null || v < 0) { avvisa("Scrivi un carico valido in kg."); return; } nuovo.carico = v; }
    if (inp && p.tipo === "variante") nuovo.variante = inp.value;
    Object.assign(e, nuovo); e.fallimenti = 0;
    // una variante e' un livello di abilita': vale per lo stesso esercizio in tutte le sedute della scheda
    if ("variante" in nuovo) for (const s of sch.sedute) for (const x of s.esercizi) if (x.nome === e.nome) x.variante = nuovo.variante;
    p.applicato = nuovo;
  }
  p.stato = applica ? "applicata" : "rifiutata"; p.decisa_il = oggi();
  salva(); renderFermo();
}

// ---------------------------------------------------------------- vista SCHEDE
function nuovaScheda(nome) {
  const s = {id: uid(), nome, inizio: iso(lunedi(new Date())), giorni: [], sedute: [{id: uid(), nome: "Seduta A", esercizi: []}], creato_il: new Date().toISOString()};
  D.schede.push(s); if (!D.attiva) D.attiva = s.id; salva(); return s;
}
function vistaSchede() {
  const el = $("v-schede");
  const sch = D.schede.find(s => s.id === S.modifica);
  if (sch) { editorScheda(el, sch); return; }
  el.innerHTML = `<div class="riga"><h2>Le tue schede</h2><button class="pulsante piccolo" type="button" id="nuova">Nuova scheda</button></div>
    ${D.schede.length ? D.schede.map(s => `<div class="blocco pila">
      <div class="riga"><h3>${esc(s.nome)}</h3>${s.id === D.attiva ? '<span class="chip attiva">In uso</span>' : ""}</div>
      <p class="sub">${s.sedute.length} ${s.sedute.length === 1 ? "seduta" : "sedute"} · ${s.sedute.reduce((n, x) => n + x.esercizi.length, 0)} esercizi${giorniTesto(s) ? " · " + esc(giorniTesto(s)) : ""}</p>
      <div class="controlli"><button class="pulsante piccolo" type="button" data-apri="${esc(s.id)}">Modifica</button>
        ${s.id !== D.attiva ? `<button class="pulsante secondario piccolo" type="button" data-usa="${esc(s.id)}">Usa questa</button>` : ""}
        <button class="pulsante secondario piccolo" type="button" data-copia="${esc(s.id)}">Duplica</button></div></div>`).join("")
    : `<div class="blocco pila"><p class="vuoto">Nessuna scheda.</p><button class="pulsante secondario" type="button" id="esempio">Aggiungi una scheda di esempio</button></div>`}`;
  $("nuova").onclick = () => { const s = nuovaScheda("Nuova scheda"); S.modifica = s.id; render(); };
  if ($("esempio")) $("esempio").onclick = () => { creaEsempio(); render(); };
  el.querySelectorAll("[data-apri]").forEach(b => b.onclick = () => { S.modifica = b.dataset.apri; render(); window.scrollTo(0, 0); });
  el.querySelectorAll("[data-usa]").forEach(b => b.onclick = () => { D.attiva = b.dataset.usa; S.scelta = null; salva(); render(); });
  el.querySelectorAll("[data-copia]").forEach(b => b.onclick = () => {
    const o = D.schede.find(s => s.id === b.dataset.copia);
    const c = JSON.parse(JSON.stringify(o)); c.id = uid(); c.nome = o.nome + " (copia)";
    c.sedute.forEach(s => { s.id = uid(); s.esercizi.forEach(e => e.id = uid()); });
    D.schede.push(c); salva(); render();
  });
}
function giorniTesto(s) {
  const g = (s.giorni || []).filter(x => x && x.length);
  return g.map(x => ORDINE_SETTIMANA.filter(d => x.includes(d)).map(d => GIORNI_BREVI[d]).join("-")).join(" / ");
}
function editorScheda(el, sch) {
  const settimane = [sch.giorni && sch.giorni[0] || [], sch.giorni && sch.giorni[1] || []];
  const caselle = (k) => ORDINE_SETTIMANA.map(d => `<label style="display:inline-flex;align-items:center;gap:4px;margin-right:8px">
    <input type="checkbox" data-sett="${k}" value="${d}" ${settimane[k].includes(d) ? "checked" : ""}>${GIORNI_BREVI[d]}</label>`).join("");
  el.innerHTML = `<button class="link" type="button" id="indietro">‹ Tutte le schede</button>
    <div class="blocco pila">
      <label class="campo">Nome della scheda<input id="s-nome" value="${esc(sch.nome)}"></label>
      <div><div class="eyebrow" style="margin-bottom:6px">Giorni di allenamento (facoltativo)</div>
        <div>${caselle(0)}</div>
        <div class="sub" style="margin:8px 0 4px">Settimana alternata (lascia vuoto se ogni settimana è uguale)</div><div>${caselle(1)}</div></div>
      ${sch.id !== D.attiva ? `<button class="pulsante secondario" type="button" id="usa">Usa questa scheda</button>` : '<span class="chip attiva" style="align-self:flex-start">Scheda in uso</span>'}
    </div>
    ${sch.sedute.map((sed, si) => `<div class="blocco pila">
      <div class="riga"><input data-nome-seduta="${esc(sed.id)}" value="${esc(sed.nome)}" aria-label="Nome della seduta" style="flex:1;font-weight:600">
        <div class="mini"><button type="button" data-su-sed="${si}" aria-label="Sposta su">↑</button><button type="button" data-giu-sed="${si}" aria-label="Sposta giù">↓</button><button type="button" data-via-sed="${esc(sed.id)}" aria-label="Elimina seduta">✕</button></div></div>
      ${sed.esercizi.length ? `<ul class="lista">${sed.esercizi.map((e, ei) => `<li><div class="riga">
          <div style="flex:1;min-width:0"><b>${esc(e.nome)}</b><div class="dett">${esc(obiettivo(e))}${e.variante ? " · " + esc(e.variante) : ""} · rec ${mmss(e.recupero_sec || 90)}</div></div>
          <div class="mini"><button type="button" data-su="${esc(sed.id)}:${ei}" aria-label="Sposta su">↑</button><button type="button" data-giu="${esc(sed.id)}:${ei}" aria-label="Sposta giù">↓</button><button type="button" data-ed="${esc(sed.id)}:${esc(e.id)}" aria-label="Modifica">✎</button></div>
        </div></li>`).join("")}</ul>` : `<p class="vuoto">Nessun esercizio.</p>`}
      <button class="pulsante secondario piccolo" type="button" data-agg="${esc(sed.id)}">Aggiungi esercizio</button>
    </div>`).join("")}
    <button class="pulsante secondario" type="button" id="agg-seduta">Aggiungi seduta</button>
    <button class="pulsante pericolo" type="button" id="elimina-scheda">Elimina scheda</button>`;
  $("indietro").onclick = () => { S.modifica = null; render(); };
  $("s-nome").onchange = ev => { sch.nome = ev.target.value.trim() || "Scheda"; salva(); };
  el.querySelectorAll("[data-sett]").forEach(c => c.onchange = () => {
    const g = [0, 1].map(k => [...el.querySelectorAll(`[data-sett="${k}"]:checked`)].map(x => +x.value));
    sch.giorni = g[1].length ? g : g[0].length ? [g[0]] : [];
    sch.inizio = sch.inizio || iso(lunedi(new Date())); salva();
  });
  if ($("usa")) $("usa").onclick = () => { D.attiva = sch.id; S.scelta = null; salva(); render(); };
  el.querySelectorAll("[data-nome-seduta]").forEach(i => i.onchange = () => { sch.sedute.find(s => s.id === i.dataset.nomeSeduta).nome = i.value.trim() || "Seduta"; salva(); });
  const sposta = (arr, i, d) => { const j = i + d; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; salva(); render(); };
  el.querySelectorAll("[data-su-sed]").forEach(b => b.onclick = () => sposta(sch.sedute, +b.dataset.suSed, -1));
  el.querySelectorAll("[data-giu-sed]").forEach(b => b.onclick = () => sposta(sch.sedute, +b.dataset.giuSed, 1));
  el.querySelectorAll("[data-su]").forEach(b => b.onclick = () => { const [s, i] = b.dataset.su.split(":"); sposta(sch.sedute.find(x => x.id === s).esercizi, +i, -1); });
  el.querySelectorAll("[data-giu]").forEach(b => b.onclick = () => { const [s, i] = b.dataset.giu.split(":"); sposta(sch.sedute.find(x => x.id === s).esercizi, +i, 1); });
  el.querySelectorAll("[data-ed]").forEach(b => b.onclick = () => { const [s, e] = b.dataset.ed.split(":"); const sed = sch.sedute.find(x => x.id === s); dialogoEsercizio(sch, sed, sed.esercizi.find(x => x.id === e)); });
  el.querySelectorAll("[data-agg]").forEach(b => b.onclick = () => dialogoEsercizio(sch, sch.sedute.find(x => x.id === b.dataset.agg), null));
  el.querySelectorAll("[data-via-sed]").forEach(b => b.onclick = () => {
    const sed = sch.sedute.find(x => x.id === b.dataset.viaSed);
    if (!confirm(`Eliminare la seduta "${sed.nome}" dalla scheda? Lo storico resta.`)) return;
    sch.sedute = sch.sedute.filter(x => x !== sed); salva(); render();
  });
  $("agg-seduta").onclick = () => { sch.sedute.push({id: uid(), nome: `Seduta ${String.fromCharCode(65 + sch.sedute.length)}`, esercizi: []}); salva(); render(); };
  $("elimina-scheda").onclick = () => {
    if (!confirm(`Eliminare la scheda "${sch.nome}"? Le sedute già registrate restano nello storico.`)) return;
    D.schede = D.schede.filter(s => s !== sch); if (D.attiva === sch.id) D.attiva = D.schede[0] ? D.schede[0].id : null;
    S.modifica = null; salva(); render();
  };
}

// dialogo per creare o modificare un esercizio
function dialogoEsercizio(sch, sed, e) {
  const nuovo = !e;
  const x = e || {tipo: "pesi", serie: 3, min: 8, max: 12, rir: 2, carico: null, incremento: 2.5, recupero_sec: 90, varianti: [], variante: null, note: ""};
  const f = $("dialogo-form");
  f.innerHTML = `<h2>${nuovo ? "Nuovo esercizio" : "Modifica esercizio"}</h2>
    <div class="campi">
      <label class="largo">Nome<input id="e-nome" value="${esc(x.nome || "")}" placeholder="es. Panca piana" required></label>
      <label class="largo">Tipo<select id="e-tipo">${Object.entries(TIPI).map(([k, v]) => `<option value="${k}" ${k === x.tipo ? "selected" : ""}>${v}${k === "zavorrato" ? " (corpo libero + kg)" : k === "isometria" ? " (secondi)" : ""}</option>`).join("")}</select></label>
      <label>Serie<input id="e-serie" inputmode="numeric" value="${esc(x.serie)}"></label>
      <label>RIR (ripetizioni di riserva)<input id="e-rir" inputmode="numeric" value="${esc(x.rir ?? 2)}"></label>
      <label><span id="l-min">Minimo</span><input id="e-min" inputmode="numeric" value="${esc(x.min)}"></label>
      <label><span id="l-max">Massimo</span><input id="e-max" inputmode="numeric" value="${esc(x.max)}"></label>
      <label class="kg"><span id="l-carico">Carico (kg)</span><input id="e-carico" inputmode="decimal" value="${esc(fmt(x.carico))}" placeholder="vuoto = lo trovi alla prima seduta"></label>
      <label class="kg">Aumento per progressione (kg)<input id="e-inc" inputmode="decimal" value="${esc(fmt(x.incremento))}"></label>
      <label>Recupero (secondi)<input id="e-rec" inputmode="numeric" value="${esc(x.recupero_sec)}"></label>
      <label class="var largo">Varianti dalla più facile alla più difficile (una per riga)<textarea id="e-varianti" placeholder="Tuck planche&#10;Advanced tuck planche&#10;Straddle planche">${esc((x.varianti || []).join("\n"))}</textarea></label>
      <label class="var largo">Variante attuale<input id="e-variante" value="${esc(x.variante || "")}" placeholder="una delle varianti sopra"></label>
      <label class="largo">Note tecniche<textarea id="e-note">${esc(x.note || "")}</textarea></label>
    </div>
    <div id="e-msg" class="sub"></div>
    <div class="controlli"><button class="pulsante" type="button" id="e-salva">Salva</button>
      <button class="pulsante secondario" type="button" id="e-annulla">Annulla</button>
      ${nuovo ? "" : `<button class="pulsante pericolo" type="button" id="e-elimina">Elimina</button>`}</div>`;
  const aggiornaCampi = () => {
    const t = $("e-tipo").value, sec = t === "isometria";
    f.querySelectorAll(".kg").forEach(n => n.hidden = !(t === "pesi" || t === "zavorrato"));
    f.querySelectorAll(".var").forEach(n => n.hidden = !(t === "corpo_libero" || t === "isometria"));
    $("l-min").textContent = sec ? "Minimo (secondi)" : "Minimo (ripetizioni)";
    $("l-max").textContent = sec ? "Massimo (secondi)" : "Massimo (ripetizioni)";
    $("l-carico").textContent = t === "zavorrato" ? "Zavorra (kg, 0 = corpo libero)" : "Carico (kg)";
  };
  $("e-tipo").onchange = aggiornaCampi; aggiornaCampi();
  f.onsubmit = ev => ev.preventDefault();   // Invio sulla tastiera non deve chiudere senza salvare
  const d = $("dialogo"); d.showModal();
  $("e-annulla").onclick = () => d.close();
  if ($("e-elimina")) $("e-elimina").onclick = () => {
    if (!confirm(`Eliminare ${x.nome} da questa seduta? Lo storico resta.`)) return;
    sed.esercizi = sed.esercizi.filter(y => y !== e); salva(); d.close(); render();
  };
  $("e-salva").onclick = () => {
    const nome = $("e-nome").value.trim(), tipo = $("e-tipo").value;
    const serie = Math.round(num($("e-serie").value) || 0), mn = Math.round(num($("e-min").value) || 0), mx = Math.round(num($("e-max").value) || 0);
    if (!nome) return void ($("e-msg").textContent = "Scrivi il nome dell'esercizio.");
    if (serie < 1 || serie > 20) return void ($("e-msg").textContent = "Le serie vanno da 1 a 20.");
    if (mn < 1 || mx < mn) return void ($("e-msg").textContent = "Il massimo deve essere uguale o più alto del minimo.");
    const varianti = $("e-varianti").value.split("\n").map(s => s.trim()).filter(Boolean);
    let variante = $("e-variante").value.trim() || null;
    if ((tipo === "corpo_libero" || tipo === "isometria") && varianti.length && !varianti.includes(variante)) variante = varianti[0];
    const conKg = tipo === "pesi" || tipo === "zavorrato";
    const dati = {nome, tipo, serie, min: mn, max: mx, rir: Math.round(num($("e-rir").value) ?? 2),
      carico: conKg ? num($("e-carico").value) : null, incremento: conKg ? (num($("e-inc").value) ?? 2.5) : 0,
      recupero_sec: Math.round(num($("e-rec").value) || 90), varianti: conKg ? [] : varianti, variante: conKg ? null : variante,
      note: $("e-note").value.trim()};
    if (nuovo) sed.esercizi.push({id: uid(), fallimenti: 0, ...dati});
    else { Object.assign(e, dati); e.fallimenti = 0; D.proposte.forEach(p => { if (p.stato === "attesa" && p.es_id === e.id) p.stato = "superata"; }); }
    // un esercizio cambiato a mano rende vecchia la bozza di oggi per quella seduta
    const b = memo.get(chiaveBozza(sed.id));
    if (b && b.es) { const pronto = nuovo ? sed.esercizi[sed.esercizi.length - 1] : e;
      if (!(b.es[pronto.id] || []).some(s => s.ok)) { b.es[pronto.id] = righeNuove(pronto); memo.set(chiaveBozza(sed.id), b); } }
    salva(); d.close(); render();
  };
}

// scheda di esempio, per vedere come funziona l'app
function creaEsempio() {
  const es = (nome, tipo, serie, min, max, extra = {}) => ({id: uid(), nome, tipo, serie, min, max, rir: 2, carico: null, incremento: tipo === "pesi" ? 2.5 : tipo === "zavorrato" ? 1.25 : 0,
    recupero_sec: 90, varianti: [], variante: null, note: "", fallimenti: 0, ...extra});
  const s = {id: uid(), nome: "Esempio: full body 3 giorni", inizio: iso(lunedi(new Date())), giorni: [[1, 3, 5]], creato_il: new Date().toISOString(), sedute: [
    {id: uid(), nome: "A · Spinta", esercizi: [
      es("Panca piana", "pesi", 4, 6, 8, {recupero_sec: 150}), es("Dip", "zavorrato", 3, 6, 10, {carico: 0, recupero_sec: 120}),
      es("Leg press", "pesi", 3, 8, 12, {incremento: 10, recupero_sec: 120}), es("Alzate laterali", "pesi", 3, 10, 15, {incremento: 1, recupero_sec: 60}),
      es("Plank", "isometria", 3, 30, 60, {varianti: ["Plank sulle ginocchia", "Plank", "Plank con braccia avanti"], variante: "Plank", recupero_sec: 60})]},
    {id: uid(), nome: "B · Tirata", esercizi: [
      es("Trazioni", "zavorrato", 4, 4, 8, {carico: 0, recupero_sec: 150}), es("Pulley basso", "pesi", 3, 8, 12, {incremento: 5}),
      es("Leg curl", "pesi", 3, 10, 15, {incremento: 5}), es("Front lever", "isometria", 4, 6, 12, {varianti: ["Tuck front lever", "Advanced tuck front lever", "Straddle front lever", "Front lever"], variante: "Tuck front lever", recupero_sec: 120})]},
    {id: uid(), nome: "C · Misto", esercizi: [
      es("Chest press", "pesi", 3, 8, 12, {incremento: 5}), es("Rematore con manubrio", "pesi", 3, 8, 12, {incremento: 2}),
      es("Leg extension", "pesi", 3, 10, 15, {incremento: 5}), es("Push-up", "corpo_libero", 3, 10, 20, {varianti: ["Push-up sulle ginocchia", "Push-up", "Push-up diamante", "Archer push-up"], variante: "Push-up"})]},
  ]};
  D.schede.push(s); D.attiva = s.id; salva();
}

// ---------------------------------------------------------------- vista STORICO
function indicatore(e) {
  const ss = e.serie || [];
  if (e.tipo === "pesi") return Math.max(0, ...ss.map(s => s.kg && s.rip && s.rip <= 15 ? s.kg * (1 + s.rip / 30) : 0));
  if (e.tipo === "zavorrato") { const z = Math.max(0, ...ss.map(s => s.kg || 0)); return z || Math.max(0, ...ss.map(s => s.rip || 0)); }
  if (e.tipo === "isometria") return Math.max(0, ...ss.map(s => s.sec || 0));
  return Math.max(0, ...ss.map(s => s.rip || 0));
}
const UNITA = {pesi: "kg, massimale stimato", zavorrato: "kg di zavorra (o ripetizioni se a corpo libero)", isometria: "secondi, tenuta migliore", corpo_libero: "ripetizioni, serie migliore"};
function grafico(punti, unita) {
  if (punti.length < 2) return `<p class="vuoto">Servono almeno due sedute per vedere l'andamento.</p>`;
  const W = 640, H = 260, m = {l: 62, r: 14, t: 16, b: 36};
  const ys = punti.map(p => p.y), lo0 = Math.min(...ys), hi0 = Math.max(...ys);
  const marg = (hi0 - lo0) * 0.15 || 1, lo = Math.max(0, lo0 - marg), hi = hi0 + marg;
  const t0 = daIso(punti[0].data).getTime(), t1 = daIso(punti[punti.length - 1].data).getTime();
  const X = d => m.l + (daIso(d).getTime() - t0) / Math.max(1, t1 - t0) * (W - m.l - m.r);
  const Y = v => m.t + (1 - (v - lo) / (hi - lo)) * (H - m.t - m.b);
  const gid = "scia" + Math.random().toString(36).slice(2, 7);
  const xs = punti.map(p => X(p.data)), area = `M${xs[0]},${H - m.b} ` + punti.map((p, i) => `L${xs[i].toFixed(1)},${Y(p.y).toFixed(1)}`).join(" ") + ` L${xs[xs.length - 1]},${H - m.b} Z`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Andamento (${esc(unita)})">
    <defs><linearGradient id="${gid}" x1="0" x2="1" y1="0" y2="0"><stop offset="0" style="stop-color:var(--arancio)"/><stop offset="1" style="stop-color:var(--verde)"/></linearGradient>
      <linearGradient id="${gid}a" x1="0" x2="0" y1="0" y2="1"><stop offset="0" style="stop-color:var(--arancio);stop-opacity:.18"/><stop offset="1" style="stop-color:var(--arancio);stop-opacity:0"/></linearGradient></defs>
    <path d="${area}" fill="url(#${gid}a)"/>
    ${[lo, (lo + hi) / 2, hi].map(t => `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(t)}" y2="${Y(t)}" stroke="var(--line)"/><text x="${m.l - 6}" y="${Y(t) + 7}" text-anchor="end" font-size="22" fill="var(--muted)">${fmt(Math.round(t * 10) / 10)}</text>`).join("")}
    <text x="${m.l}" y="${H - 6}" font-size="22" fill="var(--muted)">${esc(dataBreve(punti[0].data))}</text>
    <text x="${W - m.r}" y="${H - 6}" font-size="22" fill="var(--muted)" text-anchor="end">${esc(dataBreve(punti[punti.length - 1].data))}</text>
    <path d="${punti.map((p, i) => (i ? "L" : "M") + X(p.data).toFixed(1) + "," + Y(p.y).toFixed(1)).join("")}" fill="none" stroke="url(#${gid})" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
    ${punti.map((p, i) => `<circle cx="${X(p.data).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="${i === punti.length - 1 ? 7 : 5}" fill="${i === punti.length - 1 ? "var(--verde)" : "var(--arancio)"}" stroke="var(--surface)" stroke-width="2"><title>${esc(dataBreve(p.data))}: ${fmt(Math.round(p.y * 10) / 10)}${p.variante ? " · " + esc(p.variante) : ""}</title></circle>`).join("")}
  </svg>`;
}
function bloccoPeso() {
  const punti = [...D.pesate].sort((a, b) => a.data.localeCompare(b.data)).map(p => ({data: p.data, y: p.kg}));
  if (!punti.length) return "";
  const ora = punti[punti.length - 1], meta = D.obiettivo_peso;
  return `<div class="blocco"><h3>Peso corporeo</h3>
    <div class="campi" style="margin-top:8px"><div><div class="eyebrow">Adesso</div><div class="target">${fmt(ora.y)} kg</div><div class="sub">${esc(dataBreve(ora.data))}</div></div>
      <div><div class="eyebrow">Obiettivo</div><div class="target">${meta ? fmt(meta) + " kg" : "–"}</div><div class="sub">${meta ? (Math.abs(meta - ora.y) < 0.1 ? "raggiunto" : (meta > ora.y ? "mancano " : "da perdere ") + fmt(Math.abs(meta - ora.y)) + " kg") : "impostalo da Altro"}</div></div></div>
    <div class="grafico" style="margin-top:8px">${grafico(punti, "kg")}</div></div>`;
}
function vistaStorico() {
  const el = $("v-storico");
  const lista = ordinati();
  if (!lista.length) { el.innerHTML = bloccoPeso() + `<div class="blocco"><p class="vuoto">Nessuna seduta salvata. Dalla sezione Oggi segna le serie con ✓ e premi “Salva seduta”.</p></div>`; return; }
  const nomi = [...new Set(lista.flatMap(a => a.esercizi.map(e => e.nome)))].sort((a, b) => a.localeCompare(b, "it"));
  const scelto = nomi.includes(S.esStorico) ? S.esStorico : nomi[0];
  const punti = lista.slice().reverse().map(a => { const e = a.esercizi.find(x => x.nome === scelto); return e ? {data: a.data, y: indicatore(e), variante: e.variante, tipo: e.tipo} : null; }).filter(p => p && p.y > 0);
  const tipo = punti[0] ? punti[0].tipo : "pesi";
  const quattro = iso(piuGiorni(new Date(), -28));
  const recenti = lista.filter(a => a.data >= quattro).length;
  el.innerHTML = `<div class="blocco"><div class="campi">
      <div><div class="eyebrow">Sedute salvate</div><div class="target">${lista.length}</div></div>
      <div><div class="eyebrow">Ultime 4 settimane</div><div class="target">${recenti}</div><div class="sub">${fmt(Math.round(recenti / 4 * 10) / 10)} a settimana</div></div></div></div>
    <div class="blocco"><div class="riga"><h3>Andamento</h3><select id="es-storico" aria-label="Esercizio">${nomi.map(n => `<option ${n === scelto ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></div>
      <div class="sub" style="margin:4px 0 6px">${esc(UNITA[tipo] || "")}</div><div class="grafico">${grafico(punti, UNITA[tipo] || "")}</div></div>
    ${bloccoPeso()}
    <div class="blocco"><h3 style="margin-bottom:4px">Diario</h3>${lista.slice(0, 60).map(a => `
      <details class="sessione"><summary><span><b>${esc(a.nome_seduta)}</b> · ${esc(dataBella(a.data))}</span>
        <span class="sub">${a.durata_min ? a.durata_min + "′ " : ""}${a.rpe ? "· fatica " + fmt(a.rpe) : ""}</span></summary>
        <table style="margin-top:6px">${a.esercizi.map(e => `<tr><td>${esc(e.nome)}${e.variante ? `<div class="sub">${esc(e.variante)}</div>` : ""}</td><td class="num">${esc(fmtSerie(e))}</td></tr>`).join("")}</table>
        ${a.note ? `<p class="nota">${esc(a.note)}</p>` : ""}
        <button type="button" class="pulsante pericolo piccolo" data-elimina="${esc(a.id)}" style="margin-top:8px">Elimina seduta</button>
      </details>`).join("")}</div>`;
  $("es-storico").onchange = ev => { S.esStorico = ev.target.value; memo.set("scheda-es", S.esStorico); render(); };
  el.querySelectorAll("[data-elimina]").forEach(b => b.onclick = () => {
    if (!confirm("Eliminare questa seduta dallo storico? Le progressioni già applicate restano.")) return;
    const a = D.allenamenti.find(x => x.id === b.dataset.elimina);
    D.allenamenti = D.allenamenti.filter(x => x !== a);
    if (a && a.peso) { const i = D.pesate.findIndex(p => p.data === a.data && p.kg === a.peso); if (i >= 0) D.pesate.splice(i, 1); }
    salva(); renderFermo();
  });
}

// ---------------------------------------------------------------- vista ALTRO
function bloccoInstalla() {
  if (installata()) return "";
  return `<div class="avviso"><b>Installala sul telefono</b><p class="dett" style="margin-top:4px">Si apre come un'app e funziona anche senza connessione.</p>
    <button class="link" type="button" data-guida="installa">Come si fa</button></div>`;
}
function vistaAltro() {
  const el = $("v-altro");
  const ultimoBackup = memo.get("scheda-ultimo-backup");
  el.innerHTML = `${bloccoInstalla()}
    <div class="blocco pila"><h3>Backup</h3>
      <p class="dett">I dati stanno solo su questo telefono. Salva un backup ogni tanto (per esempio su iCloud Drive) e ripristinalo se cambi telefono.</p>
      <p class="sub">${ultimoBackup ? "Ultimo backup: " + esc(dataBella(ultimoBackup)) : "Nessun backup ancora."} · ${D.allenamenti.length} sedute, ${D.schede.length} schede</p>
      <button class="pulsante" type="button" id="backup">Salva un backup</button>
      <label class="pulsante secondario" style="text-align:center">Ripristina da backup<input type="file" id="ripristina" accept="application/json,.json" hidden></label></div>
    <div class="blocco pila"><h3>Peso</h3>
      <div class="campi"><label>Peso di oggi (kg)<input id="p-peso" inputmode="decimal" placeholder="65"></label>
        <label>Obiettivo (kg)<input id="p-obiettivo" inputmode="decimal" value="${esc(fmt(D.obiettivo_peso))}" placeholder="70"></label></div>
      <button class="pulsante secondario" type="button" id="p-salva">Salva peso</button></div>
    <div class="blocco"><h3>Come funzionano le progressioni</h3><ol style="margin:8px 0 0;padding-left:20px">
      <li><b>Prima volta:</b> se lasci il carico vuoto, quello che usi diventa il carico di partenza.</li>
      <li><b>Tutte le serie al massimo dell'intervallo:</b> il carico sale dell'aumento scelto, oppure si passa alla variante successiva. Si riparte dal minimo.</li>
      <li><b>Nel mezzo:</b> stesso carico, cerchi una ripetizione in più nella serie più debole.</li>
      <li><b>Una serie sotto il minimo</b> per due sedute di fila: carico -10% o variante precedente.</li>
      <li>Ogni proposta la decidi tu: la applichi, scrivi un carico diverso o la lasci com'è.</li></ol></div>
    <div class="blocco pila"><h3>Guida</h3><p class="dett">Fa ricomparire le spiegazioni di ogni sezione la prossima volta che la apri.</p>
      <button class="pulsante secondario" type="button" id="rivedi-guida">Rivedi la guida</button></div>
    <div class="blocco pila"><h3>Cancella tutto</h3><p class="dett">Elimina schede, sedute e peso da questo telefono. Fai prima un backup.</p>
      <button class="pulsante pericolo" type="button" id="cancella">Cancella tutti i dati</button></div>
    <p class="sub" style="text-align:center">Scheda · versione 1.0</p>`;
  $("backup").onclick = esportaBackup;
  $("rivedi-guida").onclick = () => { memo.del("scheda-guida-viste"); apriGuida("benvenuto"); };
  $("ripristina").onchange = ev => importaBackup(ev.target.files[0]);
  $("p-salva").onclick = () => {
    const kg = num($("p-peso").value), ob = num($("p-obiettivo").value);
    if (kg != null) { if (kg < 25 || kg > 300) return avvisa("Scrivi un peso in kg, per esempio 65,5."); D.pesate.push({data: oggi(), kg}); }
    D.obiettivo_peso = ob; salva(); avvisa("Peso salvato."); render();
  };
  $("cancella").onclick = () => {
    if (!confirm("Cancellare tutti i dati da questo telefono? Non si può annullare.")) return;
    D = nuovoStato(); salva(); Object.keys(localStorage).filter(k => k.startsWith("scheda-bozza-")).forEach(k => memo.del(k));
    S.risultato = null; S.modifica = null; mostra("oggi");
  };
}
async function esportaBackup() {
  const nome = `scheda-backup-${oggi()}.json`;
  const blob = new Blob([JSON.stringify(D, null, 1)], {type: "application/json"});
  try {
    const file = new File([blob], nome, {type: "application/json"});
    if (navigator.canShare && navigator.canShare({files: [file]})) { await navigator.share({files: [file], title: "Backup Scheda"}); memo.set("scheda-ultimo-backup", oggi()); render(); return; }
  } catch (e) { if (e && e.name === "AbortError") return; }
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nome; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  memo.set("scheda-ultimo-backup", oggi()); render();
}
function importaBackup(file) {
  if (!file) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const dati = JSON.parse(r.result);
      if (!dati || dati.versione !== 1 || !Array.isArray(dati.schede) || !Array.isArray(dati.allenamenti)) throw new Error("formato");
      if (!confirm(`Ripristinare il backup con ${dati.schede.length} schede e ${dati.allenamenti.length} sedute? I dati attuali verranno sostituiti.`)) return;
      D = Object.assign(nuovoStato(), dati); salva(); avvisa("Backup ripristinato."); mostra("oggi");
    } catch (e) { avvisa("Questo file non è un backup di Scheda."); }
  };
  r.readAsText(file);
}

// ---------------------------------------------------------------- guida a comparsa
/* La prima volta che si apre una sezione compare una breve guida (una o piu' pagine). Quelle gia' viste sono in
   localStorage ("scheda-guida-viste"); da Altro si possono rivedere. */
const ICONA = {
  spunta: `<span class="esempio verde">✓</span>`, timer: `<span class="esempio">${ICONA_TIMER}</span>`,
  condividi: `<span class="esempio"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3M8 7l4-4 4 4"/><path d="M5 11v9h14v-9"/></svg></span>`,
  piu: `<span class="esempio">＋</span>`,
};
const installata = () => window.navigator.standalone || matchMedia("(display-mode: standalone)").matches;
const suIphone = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
let promptAndroid = null;
window.addEventListener("beforeinstallprompt", ev => { ev.preventDefault(); promptAndroid = ev; });

function paginaInstalla() {
  if (suIphone()) return {titolo: "Mettila sulla schermata Home", testo: `
    <ol><li>Apri questa pagina in <b>Safari</b> (non da WhatsApp o Instagram).</li>
      <li>Tocca ${ICONA.condividi} <b>Condividi</b>, in basso al centro.</li>
      <li>Scorri e scegli <b>Aggiungi alla schermata Home</b>, poi <b>Aggiungi</b>.</li>
      <li>Da ora aprila dall'icona col manubrio: si apre a schermo intero e funziona anche senza connessione.</li></ol>`};
  if (promptAndroid) return {titolo: "Installala sul telefono", testo: `<p>Tocca <b>Installa</b>: l'app comparirà tra le tue app e funzionerà anche senza connessione.</p>`, installa: true};
  return {titolo: "Installala sul telefono", testo: `
    <p>Apri questo indirizzo dal telefono:</p><p><b>${esc(location.origin + location.pathname)}</b></p>
    <ul><li><b>iPhone:</b> in Safari tocca ${ICONA.condividi} Condividi → <b>Aggiungi alla schermata Home</b>.</li>
      <li><b>Android:</b> in Chrome apri il menu ⋮ → <b>Installa app</b>.</li></ul>`};
}
const GUIDE = {
  benvenuto: () => [
    {titolo: "Benvenuto in Scheda", testo: `<p>Il tuo quaderno di allenamento: scrivi le tue schede, segni le serie mentre ti alleni e dopo ogni seduta l'app ti propone come progredire.</p>
      <p>Ti mostro le funzioni man mano che apri le sezioni in basso: <b>Oggi</b>, <b>Schede</b>, <b>Storico</b> e <b>Altro</b>.</p>`},
    ...(installata() ? [] : [paginaInstalla()]),
    {titolo: "I tuoi dati restano qui", testo: `<p>Niente account: schede e allenamenti sono salvati solo su questo telefono.</p>
      <p>Ogni tanto fai un <b>backup</b> da <b>Altro</b> (per esempio su iCloud Drive), così non perdi niente se cambi telefono.</p>`},
  ],
  oggi: () => [
    {titolo: "Oggi: la seduta da fare", testo: `<p>Qui trovi la prossima seduta della scheda in uso. Per ogni esercizio vedi l'obiettivo (serie × ripetizioni o secondi, carico, recupero) e cosa hai fatto l'ultima volta.</p>
      <p>Dal menu in alto a destra puoi scegliere un'altra seduta.</p>`},
    {titolo: "Segnare le serie", testo: `<ol><li>Scrivi ripetizioni (o secondi) e kg. Se lasci vuoto vale il numero in grigio.</li>
      <li>Tocca ${ICONA.spunta} quando hai finito la serie: parte subito il <b>recupero</b>.</li>
      <li>Tocca ${ICONA.timer} per far ripartire il recupero di quella serie.</li>
      <li>Nella barra del timer: <b>+15 s</b> per allungarlo, <b>Chiudi</b> per toglierlo. Alla fine suona.</li></ol>`},
    {titolo: "Salva e progredisci", testo: `<p>A fine allenamento compila durata e fatica (facoltativi) e tocca <b>Salva seduta</b>.</p>
      <p>L'app ti dice com'è andata e ti propone le <b>progressioni</b>: più carico, la variante successiva o un obiettivo più alto. Puoi applicarle, scrivere un carico tuo o lasciare com'è.</p>
      <p>Se esci a metà seduta, le serie segnate restano salvate.</p>`},
  ],
  schede: () => [
    {titolo: "Le tue schede", testo: `<p>Una scheda è il tuo programma: contiene una o più <b>sedute</b> (per esempio A, B, C) che si alternano in ordine.</p>
      <p>Puoi averne più di una: quella con l'etichetta <b>In uso</b> è quella che vedi in Oggi. <b>Duplica</b> serve per partire da una scheda esistente.</p>`},
    {titolo: "Aggiungere esercizi", testo: `<p>Apri una scheda con <b>Modifica</b> e tocca <b>Aggiungi esercizio</b>. Scegli il tipo:</p>
      <ul><li><b>Pesi</b>: con il carico in kg.</li><li><b>Zavorrato</b>: corpo libero più kg aggiunti (0 = senza zavorra).</li>
      <li><b>Corpo libero</b>: ripetizioni, con varianti dalla più facile alla più difficile.</li><li><b>Tenuta</b>: secondi, per esempio planche o front lever.</li></ul>
      <p>Se non sai il carico lascialo vuoto: lo prende dalla prima seduta.</p>`},
    {titolo: "Ordine e giorni", testo: `<p>Con ↑ ↓ cambi l'ordine di sedute ed esercizi, con ✎ modifichi un esercizio.</p>
      <p>Se segni i <b>giorni di allenamento</b>, Oggi ti mostra le prossime date. Puoi anche alternare due settimane diverse, per esempio lun-mer-ven e mar-gio-sab.</p>`},
  ],
  storico: () => [
    {titolo: "Storico e progressi", testo: `<ul><li><b>Andamento</b>: scegli un esercizio e vedi come cresce (massimale stimato, zavorra, secondi o ripetizioni).</li>
      <li><b>Peso corporeo</b>: si aggiorna con il peso che scrivi nelle sedute o in Altro.</li>
      <li><b>Diario</b>: tocca una seduta per vedere le serie fatte o eliminarla.</li></ul>`},
  ],
  altro: () => [
    {titolo: "Altro", testo: `<ul><li><b>Backup</b>: salva un file con tutti i tuoi dati; con <b>Ripristina</b> lo ricarichi, anche su un altro telefono.</li>
      <li><b>Peso</b>: registra il peso di oggi e il tuo obiettivo.</li>
      <li><b>Come funzionano le progressioni</b>: le regole che usa l'app.</li>
      <li><b>Rivedi la guida</b>: fa ricomparire questi messaggi.</li></ul>`},
  ],
  installa: () => [paginaInstalla()],
};
const guideViste = () => memo.get("scheda-guida-viste") || [];
function guidaSeNuova(nome) {
  if (guideViste().includes(nome) || $("dialogo").open || $("guida").open) return;
  setTimeout(() => apriGuida(nome), 350);   // dopo che la sezione e' comparsa
}
function apriGuida(nome, pagina = 0) {
  const pagine = GUIDE[nome]();
  const p = pagine[pagina], ultima = pagina === pagine.length - 1, d = $("guida");
  $("guida-corpo").innerHTML = `
    <div class="eyebrow">${pagine.length > 1 ? `Guida · ${pagina + 1} di ${pagine.length}` : "Guida"}</div>
    <h2 id="guida-titolo">${p.titolo}</h2>
    <div class="pila" style="gap:10px">${p.testo}</div>
    ${p.installa ? `<button class="pulsante" type="button" id="g-installa">Installa</button>` : ""}
    ${pagine.length > 1 ? `<div class="puntini" aria-hidden="true">${pagine.map((_, i) => `<i class="${i === pagina ? "su" : ""}"></i>`).join("")}</div>` : ""}
    <div class="comandi">
      ${pagina > 0 ? `<button class="pulsante secondario piccolo" type="button" id="g-indietro">Indietro</button>` : ultima ? "<span></span>" : `<button class="link" type="button" id="g-salta">Salta</button>`}
      <button class="pulsante piccolo" type="button" id="g-avanti">${ultima ? "Ho capito" : "Avanti"}</button></div>`;
  const chiudi = () => { const v = guideViste(); if (!v.includes(nome)) memo.set("scheda-guida-viste", [...v, nome]); d.close(); };
  $("g-avanti").onclick = () => ultima ? chiudi() : apriGuida(nome, pagina + 1);
  if ($("g-indietro")) $("g-indietro").onclick = () => apriGuida(nome, pagina - 1);
  if ($("g-salta")) $("g-salta").onclick = chiudi;
  if ($("g-installa")) $("g-installa").onclick = async () => { try { await promptAndroid.prompt(); } catch (e) {} promptAndroid = null; chiudi(); };
  d.onclose = () => { const v = guideViste(); if (!v.includes(nome)) memo.set("scheda-guida-viste", [...v, nome]); };
  if (!d.open) d.showModal();
  $("g-avanti").focus();
}

// ---------------------------------------------------------------- navigazione
const VISTE = {oggi: vistaOggi, schede: vistaSchede, storico: vistaStorico, altro: vistaAltro};
function render() {
  const sch = schedaAttiva();
  $("sottotitolo").textContent = S.vista === "oggi" && sch ? sch.nome : "";
  VISTE[S.vista]();
}
document.addEventListener("click", ev => { const b = ev.target.closest("[data-guida]"); if (b) apriGuida(b.dataset.guida); });
function renderFermo() { const y = window.scrollY; render(); window.scrollTo(0, y); }
function mostra(v) {
  if (!VISTE[v]) v = "oggi";
  S.vista = v; memo.set("scheda-vista", v);
  document.querySelectorAll("nav.barra button").forEach(b => b.setAttribute("aria-selected", String(b.dataset.v === v)));
  Object.keys(VISTE).forEach(k => $("v-" + k).hidden = k !== v);
  render(); window.scrollTo(0, 0);
  // i blocchi della sezione entrano in sequenza; la classe si toglie subito dopo, cosi' i ridisegni non riananimano
  const sez = $("v-" + v); sez.classList.remove("anima"); void sez.offsetWidth; sez.classList.add("anima");
  clearTimeout(S.tAnima); S.tAnima = setTimeout(() => sez.classList.remove("anima"), 900);
  guidaSeNuova(v === "oggi" && !(schedaAttiva() && schedaAttiva().sedute.some(s => s.esercizi.length)) ? "benvenuto" : v);
}
document.querySelectorAll("nav.barra button").forEach(b => b.onclick = () => { if (b.dataset.v === "schede" && S.vista === "schede") S.modifica = null; mostra(b.dataset.v); });
mostra(S.vista);

if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1"))
  navigator.serviceWorker.register("sw.js").catch(() => {});
})();
