/**
 * Foto Cavalcavia - riceve le foto scattate con l'app e le salva in questo Google Drive.
 *
 * Non serve modificare niente: basta pubblicarlo come «App web» (Esegui come: Me, Chi ha accesso: Chiunque).
 * Le foto arrivano nella cartella scelta sul telefono; se non se ne sceglie una, in «FOTO CAVALCAVIA DAL TELEFONO»
 * (la crea lo script; puoi spostarla dove vuoi nel Drive, anche rinominarla: lo script la ritrova lo stesso).
 *
 *   <cartella>/<ispezione>/FOTO_PER_ARGO/      le foto, con il nome del difetto come sul PC:
 *        PARTE D'OPERA_COMPONENTE_DESCRIZIONE_ID DIFETTO_01.jpg, FOTO GENERALI_01.jpg,
 *        NUOVO DIFETTO_<nome>_01.jpg   (una copia per ogni difetto della foto; _01, _02… per difetto)
 *   <cartella>/<ispezione>/_dati/              elenco dei difetti e una scheda per foto (da non toccare)
 *
 * Chi ha il link dello script puo' mandare foto in questa cartella: dallo solo ai colleghi.
 */
const NOME_CARTELLA = "FOTO CAVALCAVIA DAL TELEFONO";
const INDIRIZZO_APP = "https://g-iv-ingegneria.github.io/foto-cavalcavia/";
const VERSIONE_SCRIPT = 3;

function doGet(e) {
  const r = radice_();
  if (e && e.parameter && e.parameter.a === "ping") return json_(ping_(r));
  const url = ScriptApp.getService().getUrl();
  const link = INDIRIZZO_APP + "#drive=" + encodeURIComponent(url);
  const h = '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<div style="font:16px/1.5 system-ui,sans-serif;max-width:560px;margin:24px auto;padding:0 16px">' +
    '<h2 style="margin:0 0 8px">Foto Cavalcavia: Drive collegato</h2>' +
    '<p>Le foto arrivano nella cartella <b>' + esc_(r.getName()) + '</b> di questo Drive.</p>' +
    '<p>Per collegare un telefono apri questo link sul telefono (mandalo anche ai colleghi che usano questo Drive):</p>' +
    '<p><a href="' + esc_(link) + '" target="_blank" style="word-break:break-all">' + esc_(link) + '</a></p></div>';
  return HtmlService.createHtmlOutput(h).setTitle("Foto Cavalcavia");
}

function doPost(e) {
  try {
    const q = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    if (q.radice && !cartellaScelta_(q.radice)) return json_({ ok: false, errore: "cartella_non_trovata" });
    switch (q.a) {
      case "ping": return json_(ping_(radice_()));
      case "ispezione": return json_(ispezione_(q));
      case "foto": return json_(Array.isArray(q.voci) ? fotoArgo_(q) : foto_(q));
      case "meta": return json_(Array.isArray(q.voci) ? metaArgo_(q) : meta_(q));
      case "elimina": return json_(eliminaArgo_(q) || elimina_(q));
      case "cartelle": return json_(elencoCartelle_(q));
      case "nuova": return json_(nuovaCartella_(q));
      default: return json_({ ok: false, errore: "azione sconosciuta" });
    }
  } catch (err) {
    return json_({ ok: false, errore: String((err && err.message) || err).slice(0, 300) });
  }
}

/* ---------------- azioni ---------------- */
function ping_(r) {
  return { ok: true, versione: VERSIONE_SCRIPT, cartella: r.getName(), predefinita: r.getId(), proprietario: Session.getEffectiveUser().getEmail() };
}
// cartelle del Drive per sceglierne una dal telefono: «» = Il mio Drive, «condivisi» = Condivisi con me
function elencoCartelle_(q) {
  const dentro = String(q.dentro || "");
  let it, percorso;
  if (dentro === "condivisi") { it = DriveApp.searchFolders("sharedWithMe = true"); percorso = [{ id: "condivisi", nome: "Condivisi con me" }]; }
  else {
    const c = dentro ? DriveApp.getFolderById(dentro) : DriveApp.getRootFolder();
    if (c.isTrashed()) return { ok: false, errore: "cartella_non_trovata" };
    it = c.getFolders(); percorso = percorso_(c);
  }
  const cartelle = [];
  while (it.hasNext() && cartelle.length < 300) { const f = it.next(); if (!f.isTrashed()) cartelle.push({ id: f.getId(), nome: f.getName() }); }
  cartelle.sort(function (a, b) { return a.nome.localeCompare(b.nome, "it", { numeric: true, sensitivity: "base" }); });
  return { ok: true, cartelle: cartelle, percorso: percorso, predefinita: { id: radice_().getId(), nome: NOME_CARTELLA } };
}
function nuovaCartella_(q) {
  const nome = pulisci_(q.nome, 80);
  if (!nome) return { ok: false, errore: "nome della cartella mancante" };
  const dentro = String(q.dentro || "");
  const padre = dentro && dentro !== "condivisi" ? DriveApp.getFolderById(dentro) : DriveApp.getRootFolder();
  const f = conLock_(function () { return sotto_(padre, nome); });
  return { ok: true, id: f.getId(), nome: f.getName(), percorso: percorso_(f) };
}
// dal Drive alla cartella: [{id, nome}, …] (le cartelle condivise si fermano dove finisce l'accesso)
function percorso_(f) {
  const radiceId = DriveApp.getRootFolder().getId(), out = [];
  let c = f;
  for (let n = 0; c && n < 15; n++) {
    if (c.getId() === radiceId) { out.unshift({ id: "", nome: "Il mio Drive" }); break; }
    out.unshift({ id: c.getId(), nome: c.getName() });
    let p = null;
    try { const it = c.getParents(); p = it.hasNext() ? it.next() : null; } catch (err) {}
    c = p;
  }
  return out;
}
function ispezione_(q) {
  if (!q.dati || typeof q.dati !== "object") return { ok: false, errore: "dati mancanti" };
  return conLock_(function () {
    if (q.formato === 3) { const c = cartelleArgo_(q.cartella, q.radice); scriviJson_(c.dati, "_ispezione.json", q.dati); return { ok: true }; }
    const c = cartelle_(q.cartella, q.radice);
    scriviJson_(c.isp, "_ispezione.json", q.dati);
    return { ok: true };
  });
}

/* ---------------- foto con il nome del difetto (dalla versione 3) ----------------
   q.voci = [{chiave, prefisso}]: una per difetto della foto; il prefisso arriva gia' calcolato dall'app
   (come sul PC: PARTE_COMPONENTE_DESCRIZIONE_ID); qui si aggiunge il progressivo _01, _02… del difetto. */
const CARTELLA_ARGO = "FOTO_PER_ARGO", CARTELLA_DATI = "_dati";
function cartelleArgo_(nome, radice) {
  const base = (radice && cartellaScelta_(radice)) || radice_();
  const isp = sotto_(base, pulisci_(nome, 80) || "senza_ispezione");
  return { isp: isp, argo: sotto_(isp, CARTELLA_ARGO), dati: sotto_(isp, CARTELLA_DATI) };
}
// come il PC (argo_foto.leggi_nome_foto): di quale difetto e' un nome di FOTO_PER_ARGO
function chiaveNome_(stem) {
  let m = /^FOTO GENERALI_(\d+)$/i.exec(stem); if (m) return { k: "G", n: +m[1] };
  m = /^NUOVO DIFETTO_(.+)_(\d+)$/i.exec(stem); if (m) return { k: "N:" + m[1].trim().toLowerCase(), n: +m[2] };
  m = /^(?:.*_)?(\d+)_(\d+)$/.exec(stem); if (m) return { k: "D:" + m[1], n: +m[2] };
  return null;
}
function prossimoNome_(cartella, prefisso, est) {
  const p = pulisci_(prefisso, 92) || "FOTO", k = chiaveNome_(p + "_1");
  let max = 0;
  const it = cartella.getFiles();
  while (it.hasNext()) {
    const f = it.next(); if (f.isTrashed()) continue;
    const c = chiaveNome_(f.getName().replace(/\.[^.]*$/, ""));
    if (c && k && c.k === k.k && c.n > max) max = c.n;
  }
  const n = max + 1;
  return p + "_" + (n < 10 ? "0" + n : String(n)) + "." + est;
}
function vociValide_(voci) {
  return (voci || []).filter(function (v) { return v && v.chiave && v.prefisso; }).map(function (v) { return { chiave: String(v.chiave).slice(0, 120), prefisso: String(v.prefisso) }; });
}
function leggiJson_(cartella, nome) {
  const f = primo_(cartella.getFilesByName(nome));
  if (!f) return null;
  try { return JSON.parse(f.getBlob().getDataAsString()); } catch (err) { return null; }
}
function filePresente_(id) { try { const f = DriveApp.getFileById(id); return f.isTrashed() ? null : f; } catch (err) { return null; } }
function fotoArgo_(q) {
  const id = idFoto_(q.id), est = String(q.est || "").toLowerCase();
  if (!id || !/^[a-z0-9]{1,5}$/.test(est)) return { ok: false, errore: "nome della foto non valido" };
  if (!q.b64) return { ok: false, errore: "foto mancante" };
  const voci = vociValide_(q.voci);
  if (!voci.length) return { ok: false, errore: "foto senza difetto" };
  const c = conLock_(function () { return cartelleArgo_(q.cartella, q.radice); });
  const prima = leggiJson_(c.dati, id + ".json");   // gia' arrivata (risposta persa per strada): non la rifaccio
  if (prima && prima.file && prima.file.length && prima.file.every(function (x) { return filePresente_(x.id); })) return { ok: true, file: prima.file };
  const dati = Utilities.base64Decode(q.b64);
  if (q.size && dati.length !== q.size) return { ok: false, errore: "foto arrivata incompleta (" + dati.length + " di " + q.size + " byte)" };
  const file = conLock_(function () {
    const out = []; let primoFile = null;
    voci.forEach(function (v) {
      const nome = prossimoNome_(c.argo, v.prefisso, est);
      const f = primoFile ? primoFile.makeCopy(nome, c.argo) : c.argo.createFile(Utilities.newBlob(dati, q.mime || "application/octet-stream", nome));
      if (!primoFile) primoFile = f;
      out.push({ chiave: v.chiave, nome: nome, id: f.getId() });
    });
    return out;
  });
  scriviJson_(c.dati, id + ".json", Object.assign({}, q.meta || {}, { file: file }));
  return { ok: true, file: file };
}
// la foto cambia difetti: prima le copie con i nomi nuovi, poi nel cestino quelle dei difetti tolti
function metaArgo_(q) {
  const id = idFoto_(q.id);
  if (!id) return { ok: false, errore: "foto non valida" };
  const voci = vociValide_(q.voci);
  const c = conLock_(function () { return cartelleArgo_(q.cartella, q.radice); });
  const prima = leggiJson_(c.dati, id + ".json");
  const vivi = ((prima && prima.file) || []).filter(function (x) { return filePresente_(x.id); });
  if (!vivi.length) return { ok: false, errore: "foto_mancante" };   // l'app la rimanda intera
  const file = conLock_(function () {
    const fonte = filePresente_(vivi[0].id), tieni = [], nuove = [];
    voci.forEach(function (v) {
      const g = vivi.filter(function (x) { return x.chiave === v.chiave; })[0];
      if (g) tieni.push(g);
      else { const nome = prossimoNome_(c.argo, v.prefisso, String(vivi[0].nome).split(".").pop()); nuove.push({ chiave: v.chiave, nome: nome, id: fonte.makeCopy(nome, c.argo).getId() }); }
    });
    if (!voci.length) return vivi;   // nessun difetto: resta com'e'
    vivi.forEach(function (x) { if (tieni.indexOf(x) < 0) { const f = filePresente_(x.id); if (f) f.setTrashed(true); } });
    return tieni.concat(nuove);
  });
  scriviJson_(c.dati, id + ".json", Object.assign({}, q.meta || {}, { file: file }));
  return { ok: true, file: file };
}
function eliminaArgo_(q) {
  const id = idFoto_(q.id);
  if (!id || q.formato !== 3) return null;
  const c = conLock_(function () { return cartelleArgo_(q.cartella, q.radice); });
  const prima = leggiJson_(c.dati, id + ".json");
  let n = 0;
  ((prima && prima.file) || []).forEach(function (x) { const f = filePresente_(x.id); if (f) { f.setTrashed(true); n++; } });
  const it = c.dati.getFilesByName(id + ".json");
  while (it.hasNext()) { it.next().setTrashed(true); n++; }
  return { ok: true, eliminati: n };
}
function foto_(q) {
  const file = nomeFile_(q.file), id = idFoto_(q.id);
  if (!file || !id || file.indexOf(id + ".") !== 0) return { ok: false, errore: "nome della foto non valido" };
  if (!q.b64) return { ok: false, errore: "foto mancante" };
  const c = conLock_(function () { return cartelle_(q.cartella, q.radice); });
  const dati = Utilities.base64Decode(q.b64);
  if (q.size && dati.length !== q.size) return { ok: false, errore: "foto arrivata incompleta (" + dati.length + " di " + q.size + " byte)" };
  let f = primo_(c.foto.getFilesByName(file));
  if (f && f.getSize() !== dati.length) { f.setTrashed(true); f = null; }   // c'era una copia diversa: la rifaccio
  if (!f) f = c.foto.createFile(Utilities.newBlob(dati, q.mime || "application/octet-stream", file));
  scriviJson_(c.foto, id + ".json", q.meta || {});
  return { ok: true, file: f.getId() };
}
function meta_(q) {
  const id = idFoto_(q.id);
  if (!id) return { ok: false, errore: "foto non valida" };
  const c = conLock_(function () { return cartelle_(q.cartella, q.radice); });
  scriviJson_(c.foto, id + ".json", q.meta || {});
  return { ok: true };
}
function elimina_(q) {
  const id = idFoto_(q.id), file = nomeFile_(q.file);
  if (!id) return { ok: false, errore: "foto non valida" };
  const c = conLock_(function () { return cartelle_(q.cartella, q.radice); });
  let n = 0;
  [file, id + ".json"].forEach(function (nome) {
    if (!nome) return;
    const it = c.foto.getFilesByName(nome);
    while (it.hasNext()) { it.next().setTrashed(true); n++; }   // nel cestino del Drive: si recupera per 30 giorni
  });
  return { ok: true, eliminati: n };
}

/* ---------------- cartelle e file ---------------- */
function radice_() {
  const p = PropertiesService.getScriptProperties();
  const id = p.getProperty("radice");
  if (id) {
    try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (err) {}
  }
  const r = primo_(DriveApp.getRootFolder().getFoldersByName(NOME_CARTELLA)) || DriveApp.getRootFolder().createFolder(NOME_CARTELLA);
  p.setProperty("radice", r.getId());
  return r;
}
function cartellaScelta_(id) {
  try { const f = DriveApp.getFolderById(String(id)); return f.isTrashed() ? null : f; } catch (err) { return null; }
}
function cartelle_(nome, radice) {
  const base = (radice && cartellaScelta_(radice)) || radice_();
  const isp = sotto_(base, pulisci_(nome, 80) || "senza_ispezione");
  return { isp: isp, foto: sotto_(isp, "foto") };
}
function sotto_(padre, nome) { return primo_(padre.getFoldersByName(nome)) || padre.createFolder(nome); }
function primo_(it) { while (it.hasNext()) { const x = it.next(); if (!x.isTrashed()) return x; } return null; }
function scriviJson_(cartella, nome, dati) {
  const testo = JSON.stringify(dati, null, 1);
  const f = primo_(cartella.getFilesByName(nome));
  if (f) f.setContent(testo); else cartella.createFile(nome, testo, "application/json");
}
function conLock_(fn) {
  const l = LockService.getScriptLock();
  l.waitLock(30000);
  try { return fn(); } finally { l.releaseLock(); }
}
// come le cartelle create dal programma sul PC: niente caratteri vietati da Windows
function pulisci_(s, max) {
  return String(s || "").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").replace(/\s+/g, " ").trim().replace(/[. ]+$/, "").slice(0, max || 100);
}
function idFoto_(s) { s = String(s || ""); return /^[A-Za-z0-9_-]{1,40}$/.test(s) ? s : ""; }
function nomeFile_(s) { s = String(s || ""); return /^[A-Za-z0-9_-]{1,40}\.[a-z0-9]{1,5}$/.test(s) ? s : ""; }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function esc_(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

/** Da lanciare una volta dall'editor (▶ Esegui) per dare i permessi al Drive e creare la cartella. */
function prova() {
  const r = radice_();
  Logger.log("Cartella pronta: " + r.getName() + " - " + r.getUrl());
}
