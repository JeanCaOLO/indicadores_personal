/* ============================================================
 * OLO · Sincronización con Supabase (tabla propia del proyecto)
 * ------------------------------------------------------------
 * Puente entre el dashboard (localStorage["olo_master_db"]) y la
 * tabla EXCLUSIVA public.olo_indicadores_kv.
 *
 * ⚠️ Este proyecto usa SOLO olo_indicadores_kv. No lee ni escribe
 * en olo_kv, olo_movilidad_kv, olo_organigramas_kv ni olo_salida_kv
 * (esas pertenecen a otros proyectos y tienen data de producción).
 *
 * Requiere @supabase/supabase-js v2 cargado antes que este script.
 * ============================================================ */
(function (global) {
  "use strict";

  var TABLE = "olo_indicadores_kv"; // tabla propia, no tocar las demás
  var LS_KEY = "olo_master_db";
  var client = null;

  var DEFAULTS = {
    url: "https://iigtulgpbqeypnewmzxz.supabase.co",
    // anon key = pública, segura para el navegador
    anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlpZ3R1bGdwYnFleXBuZXdtenh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1MTU3OTgsImV4cCI6MjA5OTA5MTc5OH0.kFqdbOiRKjyNJ5H-vCvNd3SrC7lamYtN3WyIY8rpetU"
  };

  function readLocalDB() {
    try { return JSON.parse(global.localStorage.getItem(LS_KEY) || "{}"); }
    catch (e) { return {}; }
  }
  function writeLocalDB(db) {
    try { global.localStorage.setItem(LS_KEY, JSON.stringify(db)); } catch (e) {}
  }

  /* Sube toda la DB local a olo_indicadores_kv (upsert por key) */
  async function push() {
    if (!client) throw new Error("OLOSync no inicializado");
    var db = readLocalDB();
    var rows = Object.keys(db).map(function (key) { return { key: key, value: db[key] }; });
    if (!rows.length) return { count: 0 };
    var res = await client.from(TABLE).upsert(rows, { onConflict: "key" });
    if (res.error) throw res.error;
    return { count: rows.length };
  }

  /* Descarga olo_indicadores_kv y reconstruye la DB local */
  async function pull() {
    if (!client) throw new Error("OLOSync no inicializado");
    var res = await client.from(TABLE).select("key,value");
    if (res.error) throw res.error;
    var db = {};
    (res.data || []).forEach(function (r) { db[r.key] = r.value; });
    if (Object.keys(db).length) writeLocalDB(db);
    return { count: (res.data || []).length };
  }

  function init(opts) {
    opts = opts || {};
    var url = opts.url || DEFAULTS.url;
    var anonKey = opts.anonKey || DEFAULTS.anonKey;
    if (!global.supabase || !global.supabase.createClient) {
      console.error("[OLOSync] Falta @supabase/supabase-js. Cargá el CDN primero.");
      return null;
    }
    client = global.supabase.createClient(url, anonKey);
    return client;
  }

  global.OLOSync = { init: init, push: push, pull: pull, get client() { return client; } };
})(window);
