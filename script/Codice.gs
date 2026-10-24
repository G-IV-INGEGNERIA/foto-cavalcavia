/**
 * Foto Cavalcavia - riceve le foto scattate con l'app e le salva in questo Google Drive.
 *
 * Non serve modificare niente: basta pubblicarlo come «App web» (Esegui come: Me, Chi ha accesso: Chiunque).
 * Le foto arrivano nella cartella «FOTO CAVALCAVIA DAL TELEFONO» (la crea lo script; puoi spostarla dove vuoi
 * nel Drive, anche rinominarla: lo script la ritrova lo stesso).
 *
 *   <cartella>/<ispezione>/_ispezione.json     elenco dei difetti dell'ispezione
 *   <cartella>/<ispezione>/foto/<id>.<est>     la foto, originale
 *   <cartella>/<ispezione>/foto/<id>.json      i difetti a cui e' assegnata
 *
 * Chi ha il link dello script puo' mandare foto in questa cartella: dallo solo ai colleghi.
 */
const NOME_CARTELLA = "FOTO CAVALCAVIA DAL TELEFONO";
const INDIRIZZO_APP = "https://g-iv-ingegneria.github.io/foto-cavalcavia/";
const VERSIONE_SCRIPT = 1;

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
    switch (q.a) {
      case "ping": return json_(ping_(radice_()));
      case "ispezione": return json_(ispezione_(q));
      case "foto": return json_(foto_(q));
      case "meta": return json_(meta_(q));
      case "elimina": return json_(elimina_(q));
      default: return json_({ ok: false, errore: "azione sconosciuta" });
    }
  } catch (err) {
    return json_({ ok: false, errore: String((err && err.message) || err).slice(0, 300) });
  }
}

/* ---------------- azioni ---------------- */
function ping_(r) {
  return { ok: true, versione: VERSIONE_SCRIPT, cartella: r.getName(), proprietario: Session.getEffectiveUser().getEmail() };
}
function ispezione_(q) {
  if (!q.dati || typeof q.dati !== "object") return { ok: false, errore: "dati mancanti" };
  return conLock_(function () {
    const c = cartelle_(q.cartella);
    scriviJson_(c.isp, "_ispezione.json", q.dati);
    return { ok: true };
  });
}
function foto_(q) {
  const file = nomeFile_(q.file), id = idFoto_(q.id);
  if (!file || !id || file.indexOf(id + ".") !== 0) return { ok: false, errore: "nome della foto non valido" };
  if (!q.b64) return { ok: false, errore: "foto mancante" };
  const c = conLock_(function () { return cartelle_(q.cartella); });
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
  const c = conLock_(function () { return cartelle_(q.cartella); });
  scriviJson_(c.foto, id + ".json", q.meta || {});
  return { ok: true };
}
function elimina_(q) {
  const id = idFoto_(q.id), file = nomeFile_(q.file);
  if (!id) return { ok: false, errore: "foto non valida" };
  const c = conLock_(function () { return cartelle_(q.cartella); });
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
function cartelle_(nome) {
  const isp = sotto_(radice_(), pulisci_(nome, 80) || "senza_ispezione");
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
