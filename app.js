/* =====================================================================
   Escala do Turismo — app.js
   Site estático (GitHub Pages) + Supabase (banco, fotos e tempo real).
   Sem Supabase configurado, roda em MODO TESTE salvando no navegador.
   ===================================================================== */
(function () {
  'use strict';

  const C = window.ESCALA_CONFIG || {};
  const TZ = C.fusoHorario || '-03:00';
  const TZ_MIN = (() => { const m = /^([+-])(\d{2}):(\d{2})$/.exec(TZ); return m ? (m[1] === '-' ? -1 : 1) * (+m[2] * 60 + +m[3]) : -180; })();
  const ANTEC = (C.checkinAntecedenciaMin ?? 60) * 60000;
  const KEY_NOME = 'escala-turismo:meu-nome';

  /* ---------------- utilidades ---------------- */
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const hm = (t) => String(t || '').slice(0, 5);
  const pad = (n) => String(n).padStart(2, '0');
  const normaliza = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
  const limpaNome = (s) => String(s || '').trim().replace(/\s+/g, ' ');

  const SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  const SEM_LONGO = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  const MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const MES_C = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

  /* ---------------- datas e horários (sempre no fuso do evento) ---------------- */
  const dUTC = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
  const isoDe = (dt) => dt.toISOString().slice(0, 10);
  const noFuso = (ms) => new Date(ms + TZ_MIN * 60000); // campos UTC = horário local do evento
  const hojeIso = () => isoDe(noFuso(Date.now()));
  const instante = (iso, hora) => new Date(`${iso}T${hm(hora)}:00${TZ}`).getTime();
  function faixa(iso, ini, fim) {
    const a = instante(iso, ini);
    let b = instante(iso, fim);
    if (b <= a) b += 864e5; // passa da meia-noite
    return [a, b];
  }
  const horaDe = (ms) => noFuso(typeof ms === 'number' ? ms : Date.parse(ms)).toISOString().slice(11, 16);
  const isoDeTs = (ms) => isoDe(noFuso(typeof ms === 'number' ? ms : Date.parse(ms)));
  const dataCurta = (iso) => { const d = dUTC(iso); return `${SEM[d.getUTCDay()]} ${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}`; };
  const dataLonga = (iso) => { const d = dUTC(iso); return `${SEM_LONGO[d.getUTCDay()]}, ${d.getUTCDate()} de ${MES[d.getUTCMonth()]}`; };
  const ddmm = (iso) => { const d = dUTC(iso); return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}`; };
  const ddmmaaaa = (iso) => { const d = dUTC(iso); return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`; };

  function diasDoPeriodo() {
    const out = [];
    if (!C.periodo || !C.periodo.inicio || !C.periodo.fim) return out;
    const semana = Array.isArray(C.diasDaSemana) && C.diasDaSemana.length ? C.diasDaSemana : [0, 1, 2, 3, 4, 5, 6];
    const fechados = new Set(C.diasFechados || []);
    const fim = dUTC(C.periodo.fim);
    for (let d = dUTC(C.periodo.inicio), n = 0; d <= fim && n < 500; d = new Date(d.getTime() + 864e5), n++) {
      const iso = isoDe(d);
      if (semana.includes(d.getUTCDay()) && !fechados.has(iso)) out.push(iso);
    }
    return out;
  }

  /* ---------------- locais e turnos ---------------- */
  const LOCAIS = (C.locais || []).map((l) => ({ vagas: 1, cor: '#475569', ...l, vagas: Math.max(1, Math.min(10, +l.vagas || 1)) }));
  const turnosDe = (loc) => (loc.turnos && loc.turnos.length ? loc.turnos : C.turnos || []).map((t) => ({ inicio: hm(t.inicio), fim: hm(t.fim) }));
  const chave = (d, l, i, f) => `${d}|${l}|${hm(i)}|${hm(f)}`;
  function localPorId(id) {
    return LOCAIS.find((l) => l.id === id) || { id, nome: id, cor: '#64748B', vagas: 0, turnos: [], desconhecido: true };
  }
  const nomeLocal = (id) => localPorId(id).nome;

  const ICONES = {
    carrossel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9 12 3l9 6"/><path d="M3 9h18"/><path d="M6 9v10M12 9v10M18 9v10"/><path d="M4 19.5h16"/><circle cx="6" cy="14" r="1.4"/><circle cx="12" cy="12.6" r="1.4"/><circle cx="18" cy="15.2" r="1.4"/></svg>',
    chapeu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5c-1.9 0-2.9 3.2-3.3 7C5.2 10.8 2.5 11.9 2.5 13.3c0 1.4 4.3 2.4 9.5 2.4s9.5-1 9.5-2.4c0-1.4-2.7-2.5-6.2-2.8-.4-3.8-1.4-7-3.3-7z"/><path d="M8.7 10.5h6.6"/><path d="M5.5 15.4 4.5 20M18.5 15.4l1 4.6M12 15.7V21"/></svg>',
    padrao: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M4 10h16M9 3v4M15 3v4"/></svg>',
  };
  const iconeDe = (loc) => ICONES[loc.icone] || ICONES.padrao;
  const ICO_CAMERA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/></svg>';

  /* =====================================================================
     BACK-END 1: Supabase (online, tempo real)
     ===================================================================== */
  function apiSupabase() {
    const sb = window.supabase.createClient(C.supabaseUrl, C.supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const bucket = sb.storage.from('checkins');
    const pub = (p) => bucket.getPublicUrl(p).data.publicUrl;

    function traduz(error) {
      const m = (error && error.message) || String(error || '');
      if ((error && (error.code === 'PGRST202' || error.code === 'PGRST205' || error.code === '42P01')) || /could not find the (function|table)/i.test(m)) {
        return 'O banco ainda não foi configurado. Rode o arquivo supabase/setup.sql no SQL Editor do Supabase.';
      }
      if (/failed to fetch|networkerror|load failed|network request failed/i.test(m)) return 'Sem conexão. Verifique a internet e tente de novo.';
      if (/invalid api key|no api key|jwt/i.test(m)) return 'Chave do Supabase inválida. Confira supabaseKey no config.js.';
      return 'Erro no servidor: ' + m;
    }
    async function rpc(fn, args) {
      try {
        const { data, error } = await sb.rpc(fn, args);
        if (error) return { ok: false, erro: traduz(error) };
        return data || { ok: false, erro: 'Resposta vazia do servidor.' };
      } catch (e) {
        return { ok: false, erro: traduz(e) };
      }
    }

    return {
      modo: 'online',
      fotoMax: 1280,
      async carregar() {
        const [e, c] = await Promise.all([
          sb.from('escalas').select('id,data,local,hora_inicio,hora_fim,nome,criado_em,atualizado_em')
            .gte('data', C.periodo.inicio).lte('data', C.periodo.fim).order('data').range(0, 4999),
          sb.from('checkins').select('id,escala_id,foto_path,thumb_path,observacao,criado_em')
            .order('criado_em', { ascending: false }).range(0, 4999),
        ]);
        if (e.error) throw new Error(traduz(e.error));
        if (c.error) throw new Error(traduz(c.error));
        return {
          escalas: e.data,
          checkins: c.data.map((x) => ({ ...x, foto_url: pub(x.foto_path), thumb_url: pub(x.thumb_path) })),
        };
      },
      reservar: (p) => rpc('reservar_turno', { p_data: p.data, p_local: p.local, p_inicio: p.inicio, p_fim: p.fim, p_nome: p.nome, p_pin: p.pin, p_vagas: p.vagas }),
      editar: (id, pin, p) => rpc('editar_turno', { p_id: id, p_pin: pin, p_data: p.data, p_local: p.local, p_inicio: p.inicio, p_fim: p.fim, p_nome: p.nome, p_vagas: p.vagas }),
      cancelar: (id, pin) => rpc('cancelar_turno', { p_id: id, p_pin: pin }),
      conferirCheckin: (id, pin) => rpc('conferir_checkin', { p_id: id, p_pin: pin }),
      async checkin(id, pin, f) {
        const base = `${id}/${Date.now()}`;
        const opts = { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false };
        try {
          const a = await bucket.upload(`${base}.jpg`, f.foto, opts);
          if (a.error) return { ok: false, erro: 'Não foi possível enviar a foto: ' + a.error.message };
          const b = await bucket.upload(`${base}-mini.jpg`, f.thumb, opts);
          if (b.error) return { ok: false, erro: 'Não foi possível enviar a foto: ' + b.error.message };
        } catch (e) {
          return { ok: false, erro: traduz(e) };
        }
        return rpc('registrar_checkin', { p_id: id, p_pin: pin, p_foto: `${base}.jpg`, p_thumb: `${base}-mini.jpg`, p_obs: f.obs || null });
      },
      assinar(aoMudar, aoStatus) {
        sb.channel('escala-turismo')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'escalas' }, aoMudar)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'checkins' }, aoMudar)
          .subscribe((st) => aoStatus(st === 'SUBSCRIBED' ? 'on' : ['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(st) ? 'off' : 'conectando'));
      },
    };
  }

  /* =====================================================================
     BACK-END 2: modo teste (localStorage) — mesmas regras do banco
     ===================================================================== */
  function apiLocal() {
    const K = 'escala-turismo:teste:v1';
    const ADMIN = '00000000';
    const vazio = () => ({ escalas: [], pins: {}, checkins: [] });
    const ler = () => { try { return JSON.parse(localStorage.getItem(K)) || vazio(); } catch (e) { return vazio(); } };
    const gravar = (db) => { try { localStorage.setItem(K, JSON.stringify(db)); return true; } catch (e) { return false; } };
    const err = (m) => ({ ok: false, erro: m });
    const papel = (db, id, pin) => (pin === ADMIN ? 'admin' : pin && db.pins[id] === pin ? 'dono' : null);
    const novoId = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2));
    const sobrepoe = (a, b) => a[0] < b[1] && b[0] < a[1];
    const ouvintes = [];
    const avisar = () => ouvintes.forEach((f) => f());
    window.addEventListener('storage', (e) => { if (e.key === K) avisar(); });

    function conflito(db, nome, d, i, f, ignorar) {
      const fx = faixa(d, i, f);
      const e = db.escalas.find((x) => x.id !== ignorar && x.nome.toLowerCase() === nome.toLowerCase() && sobrepoe(faixa(x.data, x.hora_inicio, x.hora_fim), fx));
      return e ? { ok: false, codigo: 'conflito', erro: `${e.nome} já está escalado(a) nesse horário.`, nome: e.nome, local: e.local, data: e.data, inicio: hm(e.hora_inicio), fim: hm(e.hora_fim) } : null;
    }
    const ocupadas = (db, d, l, i, f, ign) => db.escalas.filter((x) => x.id !== ign && x.data === d && x.local === l && hm(x.hora_inicio) === i && hm(x.hora_fim) === f).length;
    function validaSlot(p) {
      const nome = limpaNome(p.nome);
      if (nome.length < 3 || nome.length > 80) return err('Digite o nome (pelo menos 3 letras).');
      if (!p.data || !p.local || !p.inicio || !p.fim || p.inicio === p.fim) return err('Horário inválido.');
      return null;
    }
    function checaCheckin(db, e, pp) {
      if (db.checkins.some((c) => c.escala_id === e.id)) return err('A presença deste turno já foi registrada.');
      if (pp === 'admin') return null;
      const [a, b] = faixa(e.data, e.hora_inicio, e.hora_fim);
      if (Date.now() < a - ANTEC) return err(`O registro abre às ${horaDe(a - ANTEC)} do dia ${ddmm(isoDeTs(a - ANTEC))}.`);
      if (Date.now() > b) return err('Esse turno já terminou. Para registrar agora, fale com a coordenação.');
      return null;
    }
    const paraDataUrl = (blob) => new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob); });
    const salvar = (db) => { if (!gravar(db)) return err('A memória do modo teste encheu. Use "apagar dados de teste" no aviso amarelo.'); avisar(); return null; };

    return {
      modo: 'teste',
      fotoMax: 900,
      ADMIN,
      limpar() { localStorage.removeItem(K); avisar(); },
      async carregar() { const db = ler(); return { escalas: db.escalas, checkins: db.checkins }; },
      async reservar(p) {
        const db = ler();
        const v = validaSlot(p); if (v) return v;
        if (!/^\d{4}$/.test(p.pin || '')) return err('O PIN precisa ter exatamente 4 números.');
        if (faixa(p.data, p.inicio, p.fim)[1] <= Date.now()) return err('Esse horário já terminou.');
        if (ocupadas(db, p.data, p.local, p.inicio, p.fim) >= (p.vagas || 1)) return err('Esse horário acabou de ser preenchido por outra pessoa. Escolha outro.');
        const nome = limpaNome(p.nome);
        const c = conflito(db, nome, p.data, p.inicio, p.fim); if (c) return c;
        const id = novoId(); const agora = new Date().toISOString();
        db.escalas.push({ id, data: p.data, local: p.local, hora_inicio: p.inicio, hora_fim: p.fim, nome, criado_em: agora, atualizado_em: agora });
        db.pins[id] = p.pin;
        return salvar(db) || { ok: true, id };
      },
      async editar(id, pin, p) {
        const db = ler(); const e = db.escalas.find((x) => x.id === id);
        if (!e) return err('Esse turno não existe mais (pode ter sido cancelado).');
        const pp = papel(db, id, pin); if (!pp) return err('PIN incorreto.');
        if (pp !== 'admin' && db.checkins.some((c) => c.escala_id === id)) return err('Este turno já tem presença registrada. Só a coordenação pode alterar.');
        const v = validaSlot(p); if (v) return v;
        const mudou = p.data !== e.data || p.local !== e.local || p.inicio !== hm(e.hora_inicio) || p.fim !== hm(e.hora_fim);
        if (mudou) {
          if (pp !== 'admin' && faixa(e.data, e.hora_inicio, e.hora_fim)[0] <= Date.now()) return err('Esse turno já começou. Para trocar agora, fale com a coordenação.');
          if (pp !== 'admin' && faixa(p.data, p.inicio, p.fim)[1] <= Date.now()) return err('O novo horário já terminou.');
          if (ocupadas(db, p.data, p.local, p.inicio, p.fim, id) >= (p.vagas || 1)) return err('Esse horário já está preenchido. Escolha outro.');
        }
        const nome = limpaNome(p.nome);
        const c = conflito(db, nome, p.data, p.inicio, p.fim, id); if (c) return c;
        Object.assign(e, { data: p.data, local: p.local, hora_inicio: p.inicio, hora_fim: p.fim, nome, atualizado_em: new Date().toISOString() });
        return salvar(db) || { ok: true, id, papel: pp };
      },
      async cancelar(id, pin) {
        const db = ler(); const e = db.escalas.find((x) => x.id === id);
        if (!e) return err('Esse turno não existe mais.');
        const pp = papel(db, id, pin); if (!pp) return err('PIN incorreto.');
        if (pp !== 'admin') {
          if (db.checkins.some((c) => c.escala_id === id)) return err('Este turno já tem presença registrada. Só a coordenação pode cancelar.');
          if (faixa(e.data, e.hora_inicio, e.hora_fim)[0] <= Date.now()) return err('Esse turno já começou. Para cancelar agora, fale com a coordenação.');
        }
        db.escalas = db.escalas.filter((x) => x.id !== id);
        db.checkins = db.checkins.filter((c) => c.escala_id !== id);
        delete db.pins[id];
        return salvar(db) || { ok: true };
      },
      async conferirCheckin(id, pin) {
        const db = ler(); const e = db.escalas.find((x) => x.id === id);
        if (!e) return err('Esse turno não existe mais.');
        const pp = papel(db, id, pin); if (!pp) return err('PIN incorreto.');
        return checaCheckin(db, e, pp) || { ok: true, papel: pp };
      },
      async checkin(id, pin, f) {
        const foto = await paraDataUrl(f.foto); const thumb = await paraDataUrl(f.thumb);
        const db = ler(); const e = db.escalas.find((x) => x.id === id);
        if (!e) return err('Esse turno não existe mais.');
        const pp = papel(db, id, pin); if (!pp) return err('PIN incorreto.');
        const ch = checaCheckin(db, e, pp); if (ch) return ch;
        db.checkins.unshift({ id: novoId(), escala_id: id, foto_url: foto, thumb_url: thumb, observacao: (f.obs || '').trim().slice(0, 200) || null, criado_em: new Date().toISOString() });
        return salvar(db) || { ok: true };
      },
      assinar(aoMudar, aoStatus) { ouvintes.push(aoMudar); aoStatus('teste'); },
    };
  }

  const online = !!(C.supabaseUrl && C.supabaseKey);
  const api = online && window.supabase ? apiSupabase() : apiLocal();

  /* =====================================================================
     ESTADO
     ===================================================================== */
  const S = {
    escalas: [], checkins: [],
    porId: new Map(), porSlot: new Map(), ckPorEscala: new Map(),
    dias: diasDoPeriodo(), dia: null, aba: 'escala',
    busca: '', filtroMural: 'todos',
    meuNome: (() => { try { return localStorage.getItem(KEY_NOME) || ''; } catch (e) { return ''; } })(),
    carregado: false, modalId: null,
  };

  function indexar() {
    S.escalas = S.escalas.map((e) => ({ ...e, hora_inicio: hm(e.hora_inicio), hora_fim: hm(e.hora_fim) }));
    S.porId = new Map(S.escalas.map((e) => [e.id, e]));
    S.ckPorEscala = new Map(S.checkins.map((c) => [c.escala_id, c]));
    S.porSlot = new Map();
    for (const e of S.escalas) {
      const k = chave(e.data, e.local, e.hora_inicio, e.hora_fim);
      if (!S.porSlot.has(k)) S.porSlot.set(k, []);
      S.porSlot.get(k).push(e);
    }
    for (const lista of S.porSlot.values()) lista.sort((a, b) => String(a.criado_em).localeCompare(String(b.criado_em)));
  }

  function locaisVisiveis() {
    const ids = new Set(LOCAIS.map((l) => l.id));
    const extras = [...new Set(S.escalas.map((e) => e.local))].filter((id) => !ids.has(id)).map(localPorId);
    return [...LOCAIS, ...extras];
  }

  function slotsDe(iso, loc) {
    const lista = (loc.desconhecido ? [] : turnosDe(loc)).map((t) => ({
      data: iso, local: loc.id, inicio: t.inicio, fim: t.fim, vagas: loc.vagas,
      ocupantes: S.porSlot.get(chave(iso, loc.id, t.inicio, t.fim)) || [], extra: false,
    }));
    const conhecidas = new Set(lista.map((s) => chave(s.data, s.local, s.inicio, s.fim)));
    const extras = new Map();
    for (const e of S.escalas) {
      if (e.data !== iso || e.local !== loc.id) continue;
      const k = chave(e.data, e.local, e.hora_inicio, e.hora_fim);
      if (conhecidas.has(k)) continue;
      if (!extras.has(k)) extras.set(k, { data: iso, local: loc.id, inicio: e.hora_inicio, fim: e.hora_fim, vagas: 0, ocupantes: [], extra: true });
      extras.get(k).ocupantes.push(e);
    }
    return [...lista, ...[...extras.values()].sort((a, b) => a.inicio.localeCompare(b.inicio))];
  }

  function resumoDia(iso) {
    let vagas = 0, ocupadas = 0;
    for (const loc of LOCAIS) for (const s of slotsDe(iso, loc)) {
      if (s.extra) continue;
      vagas += s.vagas;
      ocupadas += Math.min(s.vagas, s.ocupantes.length);
    }
    return { vagas, ocupadas, livres: vagas - ocupadas };
  }

  function statusDe(e) {
    const ck = S.ckPorEscala.get(e.id);
    if (ck) return { cod: 'presente', txt: `No local · ${horaDe(ck.criado_em)}` };
    const [a, b] = faixa(e.data, e.hora_inicio, e.hora_fim);
    const agora = Date.now();
    if (agora < a - ANTEC) return { cod: 'agendado', txt: 'Agendado' };
    if (agora <= b) return { cod: 'aguardando', txt: agora < a ? 'Registro aberto' : 'Aguardando registro', podeRegistrar: true };
    return { cod: 'faltou', txt: 'Sem registro' };
  }
  const comecou = (e) => faixa(e.data, e.hora_inicio, e.hora_fim)[0] <= Date.now();
  const terminou = (iso, ini, fim) => faixa(iso, ini, fim)[1] <= Date.now();
  const ehMeu = (e) => S.meuNome && normaliza(e.nome) === normaliza(S.meuNome);

  function msgErro(r) {
    if (r && r.codigo === 'conflito') {
      return `${r.nome} já está na escala nesse horário: ${nomeLocal(r.local)}, ${dataCurta(r.data)}, ${r.inicio}–${r.fim}.`;
    }
    return (r && r.erro) || 'Não deu certo. Tente de novo.';
  }

  /* =====================================================================
     RENDERIZAÇÃO
     ===================================================================== */
  function render() {
    if (S.aba === 'escala') renderEscala();
    if (S.aba === 'geral') renderGeral();
    if (S.aba === 'mural') renderMural();
    $('#mural-cont').textContent = S.checkins.length ? String(S.checkins.length) : '';
  }

  /* ---------- aba Escala ---------- */
  function renderEscala() {
    renderDias();
    renderMeus();
    const iso = S.dia;
    const cab = $('#dia-cab');
    const box = $('#locais');
    if (!iso) {
      cab.innerHTML = '';
      box.innerHTML = '<p class="vazio-msg">Nenhum dia configurado. Confira o período em config.js.</p>';
      return;
    }
    const r = resumoDia(iso);
    cab.innerHTML = `
      <div>
        <h2>${esc(dataLonga(iso))}${iso === hojeIso() ? ' · hoje' : ''}</h2>
        <p>${r.ocupadas} de ${r.vagas} vagas preenchidas${r.livres ? ` · <strong>${r.livres} livre${r.livres > 1 ? 's' : ''}</strong>` : ' · dia completo'}</p>
      </div>
      <button type="button" class="btn btn-sec btn-sm" data-compartilhar>Enviar escala do dia</button>`;

    if (!S.carregado) { box.innerHTML = '<p class="vazio-msg">Carregando a escala…</p>'; return; }

    box.innerHTML = locaisVisiveis().map((loc) => {
      const slots = slotsDe(iso, loc);
      if (loc.desconhecido && !slots.length) return '';
      const tot = slots.filter((s) => !s.extra).reduce((n, s) => n + s.vagas, 0);
      const oc = slots.filter((s) => !s.extra).reduce((n, s) => n + Math.min(s.vagas, s.ocupantes.length), 0);
      return `
        <article class="local" style="--cor:${esc(loc.cor)}">
          <header class="local-cab">
            <span class="local-ico">${iconeDe(loc)}</span>
            <h3>${esc(loc.nome)}</h3>
            ${tot ? `<span class="local-cont">${oc}/${tot}</span>` : ''}
          </header>
          <ul class="turnos">${slots.map((s) => linhasDoSlot(s, loc)).join('')}</ul>
        </article>`;
    }).join('');
  }

  function linhasDoSlot(s, loc) {
    const out = [];
    const hora = `${s.inicio}–${s.fim}`;
    for (const e of s.ocupantes) {
      const st = statusDe(e);
      const ck = S.ckPorEscala.get(e.id);
      out.push(`
        <li class="turno ocupado st-${st.cod}${ehMeu(e) ? ' meu' : ''}${s.extra ? ' turno-outro' : ''}">
          <button type="button" class="turno-main" data-abrir="${esc(e.id)}" aria-label="${esc(`${hora}, ${e.nome}, ${st.txt}. Ver detalhes`)}">
            <span class="turno-hora">${hora}</span>
            <span class="turno-quem">
              <span class="turno-nome">${esc(e.nome)}</span>
              <span class="chip chip-${st.cod}">${esc(st.txt)}</span>
            </span>
            ${ck ? `<img class="turno-thumb" src="${esc(ck.thumb_url)}" alt="" loading="lazy" width="44" height="44">` : '<span class="turno-acao" aria-hidden="true">›</span>'}
          </button>
          ${st.podeRegistrar ? `<div class="turno-extra"><button type="button" class="btn btn-ok" data-checkin="${esc(e.id)}">Estou no local</button></div>` : ''}
        </li>`);
    }
    for (let i = s.ocupantes.length; i < s.vagas; i++) {
      const passou = terminou(s.data, s.inicio, s.fim);
      out.push(`
        <li class="turno livre">
          <button type="button" class="turno-main" data-reservar="${esc(chave(s.data, s.local, s.inicio, s.fim))}" ${passou ? 'disabled' : ''}
            aria-label="${esc(`${loc.nome}, ${hora}, ${passou ? 'encerrado' : 'livre. Escolher este horário'}`)}">
            <span class="turno-hora">${hora}</span>
            <span class="turno-quem"><span class="turno-nome">${passou ? 'Não preenchido' : 'Livre'}</span></span>
            <span class="turno-acao">${passou ? '' : 'Escolher'}</span>
          </button>
        </li>`);
    }
    return out.join('');
  }

  function renderDias() {
    const hoje = hojeIso();
    $('#dias').innerHTML = S.dias.map((iso) => {
      const d = dUTC(iso);
      const r = S.carregado ? resumoDia(iso) : null;
      const cls = !r ? '' : r.livres === 0 ? 'cheio' : r.ocupadas === 0 ? 'vazio' : 'parcial';
      const info = !r ? '…' : r.livres === 0 ? 'completo' : `${r.livres} livre${r.livres > 1 ? 's' : ''}`;
      const sel = iso === S.dia;
      return `
        <button type="button" class="dia ${cls}${sel ? ' sel' : ''}${iso === hoje ? ' hoje' : ''}${iso < hoje ? ' passado' : ''}"
          data-dia="${iso}" aria-pressed="${sel}" aria-label="${esc(`${dataLonga(iso)}, ${info}`)}">
          <span class="dia-sem">${iso === hoje ? 'hoje' : SEM[d.getUTCDay()]}</span>
          <span class="dia-num">${pad(d.getUTCDate())}</span>
          <span class="dia-mes">${MES_C[d.getUTCMonth()]}</span>
          <span class="dia-info">${info}</span>
        </button>`;
    }).join('');
  }

  function centralizarDia() {
    const cont = $('#dias');
    const el = cont.querySelector('.dia.sel');
    if (!el) return;
    const r = el.getBoundingClientRect(), cr = cont.getBoundingClientRect();
    cont.scrollLeft += (r.left + r.width / 2) - (cr.left + cr.width / 2);
  }

  function renderMeus() {
    const box = $('#meus');
    if (!S.meuNome || !S.carregado) { box.hidden = true; return; }
    const agora = Date.now();
    const meus = S.escalas
      .filter((e) => ehMeu(e) && faixa(e.data, e.hora_inicio, e.hora_fim)[1] > agora)
      .sort((a, b) => (a.data + a.hora_inicio).localeCompare(b.data + b.hora_inicio));
    box.hidden = false;
    box.innerHTML = `
      <div class="meus-cab">
        <h2>Seus próximos turnos · ${esc(S.meuNome)}</h2>
        <button type="button" class="btn-link" data-esquecer>não é você?</button>
      </div>
      ${meus.length ? `<ul>${meus.slice(0, 8).map((e) => {
        const loc = localPorId(e.local);
        return `<li><button type="button" style="--cor:${esc(loc.cor)}" data-ir-dia="${e.data}">${esc(dataCurta(e.data))} · ${esc(loc.nome)} · ${e.hora_inicio}–${e.hora_fim}</button></li>`;
      }).join('')}</ul>${meus.length > 8 ? `<p class="nota">e mais ${meus.length - 8}.</p>` : ''}`
        : '<p class="nota">Nenhum turno futuro nesse nome. Escolha um horário livre abaixo.</p>'}`;
  }

  /* ---------- aba Visão geral ---------- */
  function renderGeral() {
    const tab = $('#tabela');
    const locs = LOCAIS;
    const cols = locs.flatMap((loc) => turnosDe(loc).map((t) => ({ loc, t })));
    const busca = normaliza(S.busca);
    const hoje = hojeIso();
    let vagas = 0, preench = 0, presencas = 0, achados = 0;

    const linhas = S.dias.map((iso) => {
      const tds = cols.map(({ loc, t }) => {
        const ocup = S.porSlot.get(chave(iso, loc.id, t.inicio, t.fim)) || [];
        vagas += loc.vagas;
        preench += Math.min(loc.vagas, ocup.length);
        const pessoas = ocup.map((e) => {
          const st = statusDe(e);
          if (st.cod === 'presente') presencas++;
          const achou = busca && normaliza(e.nome).includes(busca);
          if (achou) achados++;
          return `<button type="button" class="cel-pessoa st-${st.cod}${achou ? ' achado' : ''}" data-abrir="${esc(e.id)}" title="${esc(st.txt)}">${esc(e.nome)}</button>`;
        });
        const passou = terminou(iso, t.inicio, t.fim);
        for (let i = ocup.length; i < loc.vagas; i++) {
          pessoas.push(`<button type="button" class="cel-livre" data-reservar="${esc(chave(iso, loc.id, t.inicio, t.fim))}" ${passou ? 'disabled' : ''}>${passou ? '—' : 'livre'}</button>`);
        }
        return `<td>${pessoas.join('')}</td>`;
      }).join('');
      return `<tr class="${iso === hoje ? 'hoje' : ''}"><th scope="row">${esc(dataCurta(iso))}</th>${tds}</tr>`;
    }).join('');

    tab.classList.toggle('filtrando', !!busca);
    tab.innerHTML = `
      <caption class="print-titulo">${esc(C.titulo || 'Escala')} — ${ddmmaaaa(C.periodo.inicio)} a ${ddmmaaaa(C.periodo.fim)}</caption>
      <thead>
        <tr><th rowspan="2">Dia</th>${locs.map((loc) => `<th class="loc" colspan="${turnosDe(loc).length}" style="--cor:${esc(loc.cor)}">${esc(loc.nome)}</th>`).join('')}</tr>
        <tr>${cols.map(({ t }) => `<th>${t.inicio}–${t.fim}</th>`).join('')}</tr>
      </thead>
      <tbody>${linhas}</tbody>`;

    $('#geral-resumo').innerHTML = `
      <span>Vagas no período: <strong>${vagas}</strong></span>
      <span>Preenchidas: <strong>${preench}</strong></span>
      <span>Livres: <strong>${vagas - preench}</strong></span>
      <span>Presenças registradas: <strong>${presencas}</strong></span>
      ${busca ? `<span>“${esc(S.busca.trim())}”: <strong>${achados}</strong> turno${achados === 1 ? '' : 's'}</span>` : ''}`;
  }

  /* ---------- aba No local (mural público) ---------- */
  function renderMural() {
    $('#mural-filtros').innerHTML = [{ id: 'todos', nome: 'Todos' }, ...LOCAIS].map((l) =>
      `<button type="button" data-filtro="${esc(l.id)}" aria-pressed="${S.filtroMural === l.id}">${esc(l.nome)}</button>`).join('');

    const box = $('#mural');
    if (!S.carregado) { box.innerHTML = '<p class="vazio-msg">Carregando…</p>'; return; }
    const itens = S.checkins
      .map((c) => ({ c, e: S.porId.get(c.escala_id) }))
      .filter((x) => x.e && (S.filtroMural === 'todos' || x.e.local === S.filtroMural))
      .sort((a, b) => String(b.c.criado_em).localeCompare(String(a.c.criado_em)));
    if (!itens.length) { box.innerHTML = '<p class="vazio-msg">Ainda não há registros de presença.</p>'; return; }

    const hoje = hojeIso();
    const ontem = isoDe(new Date(dUTC(hoje).getTime() - 864e5));
    let diaAtual = '';
    box.innerHTML = itens.map(({ c, e }) => {
      const loc = localPorId(e.local);
      const dReg = isoDeTs(c.criado_em);
      let cab = '';
      if (dReg !== diaAtual) {
        diaAtual = dReg;
        cab = `<h3 class="mural-dia">${dReg === hoje ? 'Hoje' : dReg === ontem ? 'Ontem' : esc(dataLonga(dReg))}</h3>`;
      }
      return `${cab}
        <button type="button" class="foto-card" data-foto="${esc(c.id)}">
          <img src="${esc(c.thumb_url)}" alt="${esc(`Foto de presença de ${e.nome} no ${loc.nome}`)}" loading="lazy" width="480" height="360">
          <span class="foto-info">
            <strong>${esc(e.nome)}</strong>
            <span class="tag" style="--cor:${esc(loc.cor)}">${esc(loc.nome)}</span>
            <span class="quando">Turno ${esc(dataCurta(e.data))} · ${e.hora_inicio}–${e.hora_fim}</span>
            <span class="hora-reg">Registrado às ${horaDe(c.criado_em)}</span>
          </span>
        </button>`;
    }).join('');
  }

  /* =====================================================================
     MODAIS
     ===================================================================== */
  const modal = $('#modal');
  const corpo = $('#modal-corpo');
  let limparModal = null;

  function abrirModal(html, montar, id = null) {
    if (limparModal) { limparModal(); limparModal = null; }
    corpo.innerHTML = html;
    S.modalId = id;
    if (!modal.open) modal.showModal();
    if (montar) limparModal = montar(corpo) || null;
    if (window.matchMedia('(hover: hover)').matches) { // no celular não abre o teclado sozinho
      const foco = [...corpo.querySelectorAll('input:not([type=file])')].find((i) => !i.value) || corpo.querySelector('.btn-pri, .btn-ok');
      if (foco) foco.focus();
    }
  }
  function fecharModal() { if (modal.open) modal.close(); }
  modal.addEventListener('close', () => { if (limparModal) { limparModal(); limparModal = null; } S.modalId = null; corpo.innerHTML = ''; });
  modal.addEventListener('click', (ev) => {
    if (ev.target === modal) return fecharModal(); // clique fora
    const b = ev.target.closest('[data-fechar]');
    if (b) fecharModal();
  });

  const resumoHtml = (loc, iso, ini, fim) =>
    `<p class="modal-resumo"><span class="tag" style="--cor:${esc(loc.cor)}">${esc(loc.nome)}</span><span>${esc(dataLonga(iso))} · <strong>${hm(ini)}–${hm(fim)}</strong></span></p>`;

  const campoPin = (rotulo, ajuda) => `
    <label class="campo campo-pin">${rotulo}
      <input name="pin" type="password" inputmode="numeric" autocomplete="off" maxlength="12" required placeholder="••••">
      ${ajuda ? `<small>${ajuda}</small>` : ''}
    </label>`;

  function erroNoForm(form, msg) {
    const el = form.querySelector('.erro-msg');
    el.textContent = msg; el.hidden = !msg;
    if (msg) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  function ocupado(btn, texto) {
    if (!btn.dataset.txt) btn.dataset.txt = btn.innerHTML;
    if (texto) { btn.disabled = true; btn.innerHTML = `<span class="gira" aria-hidden="true"></span>${esc(texto)}`; }
    else { btn.disabled = false; btn.innerHTML = btn.dataset.txt; }
  }
  function lembrarNome(nome) {
    S.meuNome = limpaNome(nome);
    try { localStorage.setItem(KEY_NOME, S.meuNome); } catch (e) { /* sem armazenamento */ }
  }

  /* ---------- escolher horário ---------- */
  function modalReservar(k) {
    const [data, local, ini, fim] = k.split('|');
    const loc = localPorId(local);
    abrirModal(`
      <form novalidate>
        <h2 id="modal-titulo">Escolher este horário</h2>
        ${resumoHtml(loc, data, ini, fim)}
        <div class="erro-msg" hidden></div>
        <label class="campo">Seu nome
          <input name="nome" autocomplete="name" required minlength="3" maxlength="80" placeholder="Nome e sobrenome" value="${esc(S.meuNome)}">
        </label>
        <label class="campo campo-pin">Crie um PIN de 4 números
          <input name="pin" type="text" inputmode="numeric" pattern="[0-9]{4}" autocomplete="off" required placeholder="0000">
        </label>
        <p class="ajuda">Guarde esse PIN: ele é pedido para editar, cancelar e registrar presença. Pode usar o mesmo em todos os seus turnos.</p>
        <div class="modal-acoes">
          <button type="button" class="btn btn-sec" data-fechar>Voltar</button>
          <button type="submit" class="btn btn-pri">Confirmar horário</button>
        </div>
      </form>`, (el) => {
      const form = el.querySelector('form');
      form.pin.addEventListener('input', () => { form.pin.value = form.pin.value.replace(/\D/g, '').slice(0, 4); });
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const nome = limpaNome(form.nome.value);
        const pin = form.pin.value.trim();
        if (nome.length < 3) return erroNoForm(form, 'Digite seu nome (pelo menos 3 letras).');
        if (!/^\d{4}$/.test(pin)) return erroNoForm(form, 'O PIN precisa ter exatamente 4 números.');
        erroNoForm(form, '');
        const btn = form.querySelector('[type=submit]');
        ocupado(btn, 'Salvando…');
        const r = await api.reservar({ data, local, inicio: ini, fim, nome, pin, vagas: loc.vagas });
        ocupado(btn, null);
        if (!r || !r.ok) { erroNoForm(form, msgErro(r)); await recarregar(); return; }
        lembrarNome(nome);
        fecharModal();
        toast(`Pronto! ${loc.nome}, ${dataCurta(data)}, ${ini}–${fim} é seu.`);
        await recarregar();
      });
    });
  }

  /* ---------- detalhes do turno ---------- */
  function modalDetalhe(id) {
    const e = S.porId.get(id);
    if (!e) return toast('Esse turno não existe mais.', true);
    const loc = localPorId(e.local);
    const st = statusDe(e);
    const ck = S.ckPorEscala.get(id);
    const travado = ck || comecou(e);
    abrirModal(`<div class="detalhe">
      <h2 id="modal-titulo">${esc(e.nome)}</h2>
      ${resumoHtml(loc, e.data, e.hora_inicio, e.hora_fim)}
      <p><span class="chip chip-${st.cod}">${esc(st.txt)}</span></p>
      ${ck ? `
        <figure class="registro">
          <img src="${esc(ck.foto_url)}" alt="${esc(`Foto de presença de ${e.nome}`)}">
          <figcaption>Presença registrada às <strong>${horaDe(ck.criado_em)}</strong> de ${ddmm(isoDeTs(ck.criado_em))}
            ${ck.observacao ? `<em>“${esc(ck.observacao)}”</em>` : ''}</figcaption>
        </figure>` : ''}
      <div class="acoes-col">
        ${st.podeRegistrar ? '<button type="button" class="btn btn-ok" data-ir="checkin">Estou no local</button>' : ''}
        <div class="acoes-lin">
          <button type="button" class="btn btn-sec" data-ir="editar">Editar</button>
          <button type="button" class="btn btn-perigo" data-ir="cancelar">Cancelar turno</button>
        </div>
        ${travado ? '<p class="nota">Turno já iniciado ou com presença registrada: troca e cancelamento só com o PIN da coordenação.</p>' : ''}
        <button type="button" class="btn btn-sec" data-fechar>Fechar</button>
      </div></div>`, (el) => {
      el.querySelector('.detalhe').addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-ir]');
        if (!b) return;
        if (b.dataset.ir === 'checkin') modalCheckin(id);
        if (b.dataset.ir === 'editar') modalEditar(id);
        if (b.dataset.ir === 'cancelar') modalCancelar(id);
      });
    }, id);
  }

  /* ---------- editar ---------- */
  function modalEditar(id) {
    const e = S.porId.get(id);
    if (!e) return toast('Esse turno não existe mais.', true);
    const dias = S.dias.includes(e.data) ? S.dias : [...S.dias, e.data].sort();
    const locs = locaisVisiveis();
    abrirModal(`
      <form novalidate>
        <h2 id="modal-titulo">Editar turno</h2>
        ${resumoHtml(localPorId(e.local), e.data, e.hora_inicio, e.hora_fim)}
        <div class="erro-msg" hidden></div>
        <label class="campo">Nome
          <input name="nome" required minlength="3" maxlength="80" value="${esc(e.nome)}">
        </label>
        <div class="linha-2">
          <label class="campo">Dia
            <select name="data">${dias.map((d) => `<option value="${d}"${d === e.data ? ' selected' : ''}>${esc(dataCurta(d))}</option>`).join('')}</select>
          </label>
          <label class="campo">Local
            <select name="local">${locs.map((l) => `<option value="${esc(l.id)}"${l.id === e.local ? ' selected' : ''}>${esc(l.nome)}</option>`).join('')}</select>
          </label>
        </div>
        <label class="campo">Horário
          <select name="turno"></select>
        </label>
        ${campoPin('PIN', 'O PIN deste turno ou o da coordenação.')}
        <div class="modal-acoes">
          <button type="button" class="btn btn-sec" data-voltar>Voltar</button>
          <button type="submit" class="btn btn-pri">Salvar alterações</button>
        </div>
      </form>`, (el) => {
      const form = el.querySelector('form');
      function preencherTurnos() {
        const d = form.data.value, l = form.local.value;
        const loc = localPorId(l);
        const opts = loc.desconhecido ? [] : turnosDe(loc);
        if (d === e.data && l === e.local && !opts.some((t) => t.inicio === e.hora_inicio && t.fim === e.hora_fim)) {
          opts.push({ inicio: e.hora_inicio, fim: e.hora_fim });
        }
        const atualSel = form.turno.value;
        form.turno.innerHTML = opts.map((t) => {
          const atual = d === e.data && l === e.local && t.inicio === e.hora_inicio && t.fim === e.hora_fim;
          const outros = (S.porSlot.get(chave(d, l, t.inicio, t.fim)) || []).filter((x) => x.id !== id);
          const cheio = outros.length >= (loc.vagas || 1);
          const passou = terminou(d, t.inicio, t.fim);
          const extra = atual ? ' · atual' : cheio ? ` · ocupado (${outros.map((x) => x.nome.split(' ')[0]).join(', ')})` : passou ? ' · encerrado' : ' · livre';
          return `<option value="${t.inicio}|${t.fim}"${!atual && (cheio || passou) ? ' disabled' : ''}>${t.inicio}–${t.fim}${esc(extra)}</option>`;
        }).join('') || '<option value="">Sem horários nesse local</option>';
        const alvo = [...form.turno.options].find((o) => o.value === atualSel && !o.disabled)
          || [...form.turno.options].find((o) => o.value === `${e.hora_inicio}|${e.hora_fim}` && !o.disabled)
          || [...form.turno.options].find((o) => !o.disabled);
        if (alvo) alvo.selected = true;
      }
      preencherTurnos();
      form.data.addEventListener('change', preencherTurnos);
      form.local.addEventListener('change', preencherTurnos);
      form.querySelector('[data-voltar]').addEventListener('click', () => modalDetalhe(id));
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const nome = limpaNome(form.nome.value);
        const pin = form.pin.value.trim();
        const [ini, fim] = (form.turno.value || '').split('|');
        if (nome.length < 3) return erroNoForm(form, 'Digite o nome (pelo menos 3 letras).');
        if (!ini || !fim) return erroNoForm(form, 'Escolha um horário disponível.');
        if (!pin) return erroNoForm(form, 'Digite o PIN.');
        erroNoForm(form, '');
        const btn = form.querySelector('[type=submit]');
        ocupado(btn, 'Salvando…');
        const loc = localPorId(form.local.value);
        const r = await api.editar(id, pin, { data: form.data.value, local: form.local.value, inicio: ini, fim, nome, vagas: loc.vagas || 1 });
        ocupado(btn, null);
        if (!r || !r.ok) { erroNoForm(form, msgErro(r)); return; }
        if (r.papel !== 'admin') lembrarNome(nome);
        fecharModal();
        toast('Turno atualizado.');
        await recarregar();
      });
    }, id);
  }

  /* ---------- cancelar ---------- */
  function modalCancelar(id) {
    const e = S.porId.get(id);
    if (!e) return toast('Esse turno não existe mais.', true);
    const loc = localPorId(e.local);
    abrirModal(`
      <form novalidate>
        <h2 id="modal-titulo">Cancelar turno de ${esc(e.nome)}?</h2>
        ${resumoHtml(loc, e.data, e.hora_inicio, e.hora_fim)}
        <p class="ajuda" style="margin-top:0">O horário volta a ficar livre para outra pessoa.</p>
        <div class="erro-msg" hidden></div>
        ${campoPin('PIN', 'O PIN deste turno ou o da coordenação.')}
        <div class="modal-acoes">
          <button type="button" class="btn btn-sec" data-voltar>Voltar</button>
          <button type="submit" class="btn btn-perigo">Cancelar turno</button>
        </div>
      </form>`, (el) => {
      const form = el.querySelector('form');
      form.querySelector('[data-voltar]').addEventListener('click', () => modalDetalhe(id));
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const pin = form.pin.value.trim();
        if (!pin) return erroNoForm(form, 'Digite o PIN.');
        const btn = form.querySelector('[type=submit]');
        ocupado(btn, 'Cancelando…');
        const r = await api.cancelar(id, pin);
        ocupado(btn, null);
        if (!r || !r.ok) { erroNoForm(form, msgErro(r)); return; }
        S.modalId = null;
        fecharModal();
        toast('Turno cancelado. O horário está livre de novo.');
        await recarregar();
      });
    }, id);
  }

  /* ---------- estou no local (foto) ---------- */
  function modalCheckin(id) {
    const e = S.porId.get(id);
    if (!e) return toast('Esse turno não existe mais.', true);
    const loc = localPorId(e.local);
    let pronta = null;
    let previaUrl = null;
    abrirModal(`
      <form novalidate>
        <h2 id="modal-titulo">Estou no local</h2>
        ${resumoHtml(loc, e.data, e.hora_inicio, e.hora_fim)}
        <div class="erro-msg" hidden></div>
        <label class="foto-campo">
          ${ICO_CAMERA}
          <span>Tirar foto no local</span>
          <small>Mostre você no ${esc(loc.nome)}</small>
          <input type="file" name="foto" accept="image/*" capture="environment">
        </label>
        <div class="foto-previa" hidden>
          <img alt="Prévia da foto">
          <button type="button" class="btn btn-sec btn-sm" data-trocar>Trocar foto</button>
        </div>
        <label class="campo">Observação <small>opcional</small>
          <input name="obs" maxlength="200" placeholder="Ex.: brinquedo funcionando normalmente">
        </label>
        ${campoPin('Seu PIN', '')}
        <p class="ajuda">A foto e o horário do registro ficam públicos na aba “No local”.</p>
        <div class="modal-acoes">
          <button type="button" class="btn btn-sec" data-voltar>Voltar</button>
          <button type="submit" class="btn btn-ok">Registrar presença</button>
        </div>
      </form>`, (el) => {
      const form = el.querySelector('form');
      const campo = el.querySelector('.foto-campo');
      const previa = el.querySelector('.foto-previa');
      form.querySelector('[data-voltar]').addEventListener('click', () => modalDetalhe(id));
      el.querySelector('[data-trocar]').addEventListener('click', () => form.foto.click());
      form.foto.addEventListener('change', async () => {
        const file = form.foto.files && form.foto.files[0];
        if (!file) return;
        erroNoForm(form, '');
        campo.querySelector('span').textContent = 'Preparando a foto…';
        try {
          pronta = await prepararFoto(file, e, loc);
          if (previaUrl) URL.revokeObjectURL(previaUrl);
          previaUrl = URL.createObjectURL(pronta.foto);
          previa.querySelector('img').src = previaUrl;
          previa.hidden = false; campo.hidden = true;
        } catch (err) {
          pronta = null;
          erroNoForm(form, 'Não consegui ler essa foto. Tente tirar de novo (ou use JPG/PNG).');
        }
        campo.querySelector('span').textContent = 'Tirar foto no local';
      });
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const pin = form.pin.value.trim();
        if (!pronta) return erroNoForm(form, 'Tire a foto antes de registrar.');
        if (!pin) return erroNoForm(form, 'Digite seu PIN.');
        erroNoForm(form, '');
        const btn = form.querySelector('[type=submit]');
        ocupado(btn, 'Conferindo…');
        const r1 = await api.conferirCheckin(id, pin);
        if (!r1 || !r1.ok) { ocupado(btn, null); erroNoForm(form, msgErro(r1)); return; }
        ocupado(btn, 'Enviando foto…');
        const r2 = await api.checkin(id, pin, { foto: pronta.foto, thumb: pronta.thumb, obs: form.obs.value });
        ocupado(btn, null);
        if (!r2 || !r2.ok) { erroNoForm(form, msgErro(r2)); return; }
        fecharModal();
        toast(`Presença registrada às ${horaDe(Date.now())}. Bom trabalho!`);
        await recarregar();
      });
      return () => { if (previaUrl) URL.revokeObjectURL(previaUrl); };
    }, id);
  }

  /* ---------- foto ampliada (mural) ---------- */
  function modalFoto(ckId) {
    const c = S.checkins.find((x) => x.id === ckId);
    const e = c && S.porId.get(c.escala_id);
    if (!e) return;
    const loc = localPorId(e.local);
    abrirModal(`
      <h2 id="modal-titulo">${esc(e.nome)}</h2>
      ${resumoHtml(loc, e.data, e.hora_inicio, e.hora_fim)}
      <figure class="registro">
        <img src="${esc(c.foto_url)}" alt="${esc(`Foto de presença de ${e.nome} no ${loc.nome}`)}">
        <figcaption>Registrado às <strong>${horaDe(c.criado_em)}</strong> de ${ddmm(isoDeTs(c.criado_em))}
          ${c.observacao ? `<em>“${esc(c.observacao)}”</em>` : ''}</figcaption>
      </figure>
      <div class="modal-acoes"><button type="button" class="btn btn-sec" data-fechar>Fechar</button></div>`, null, e.id);
  }

  /* ---------- tratamento da foto: reduz, carimba e gera miniatura ---------- */
  function carregarImagem(file) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => res({ img, url });
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('imagem ilegível')); };
      img.src = url;
    });
  }
  function desenhar(img, max, legenda) {
    const w0 = img.naturalWidth, h0 = img.naturalHeight;
    const k = Math.min(1, max / Math.max(w0, h0));
    const w = Math.max(1, Math.round(w0 * k)), h = Math.max(1, Math.round(h0 * k));
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const cx = cv.getContext('2d');
    cx.drawImage(img, 0, 0, w, h);
    if (legenda) {
      const fs = Math.max(14, Math.round(Math.min(w, h) * 0.042));
      const p = Math.round(fs * 0.7);
      const faixaH = Math.round(fs * 2.35 + p * 2);
      cx.fillStyle = 'rgba(0,0,0,.6)';
      cx.fillRect(0, h - faixaH, w, faixaH);
      cx.fillStyle = '#fff';
      cx.textBaseline = 'top';
      cx.font = `700 ${fs}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
      cx.fillText(legenda[0], p, h - faixaH + p, w - p * 2);
      cx.font = `400 ${Math.round(fs * 0.85)}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
      cx.fillText(legenda[1], p, h - faixaH + p + Math.round(fs * 1.3), w - p * 2);
    }
    return cv;
  }
  const paraBlob = (cv, q) => new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('falha ao gerar jpg'))), 'image/jpeg', q));
  async function prepararFoto(file, e, loc) {
    const { img, url } = await carregarImagem(file);
    try {
      const agora = Date.now();
      const leg = [`${loc.nome} · ${e.nome}`, `${ddmmaaaa(isoDeTs(agora))} às ${horaDe(agora)} · turno ${e.hora_inicio}–${e.hora_fim}`];
      const foto = await paraBlob(desenhar(img, api.fotoMax, leg), 0.82);
      const thumb = await paraBlob(desenhar(img, 480, null), 0.72);
      return { foto, thumb };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  /* =====================================================================
     COMPARTILHAR, TOAST, CONEXÃO
     ===================================================================== */
  function textoDoDia(iso) {
    const linhas = [`*${C.titulo || 'Escala'} — ${dataLonga(iso)}*`, ''];
    for (const loc of locaisVisiveis()) {
      const slots = slotsDe(iso, loc);
      if (!slots.length) continue;
      linhas.push(`*${loc.nome}*`);
      for (const s of slots) {
        const nomes = s.ocupantes.map((e) => e.nome);
        for (let i = nomes.length; i < s.vagas; i++) nomes.push('(livre)');
        linhas.push(`${s.inicio}–${s.fim} · ${nomes.join(', ')}`);
      }
      linhas.push('');
    }
    linhas.push(location.href.split('#')[0]);
    return linhas.join('\n');
  }
  async function compartilharDia() {
    const texto = textoDoDia(S.dia);
    if (navigator.share) {
      try { await navigator.share({ text: texto }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    window.open('https://wa.me/?text=' + encodeURIComponent(texto), '_blank', 'noopener');
  }

  let toastTimer;
  function toast(msg, erro = false) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.toggle('erro', !!erro);
    t.classList.add('vis');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('vis'), 3800);
  }

  function setConexao(st) {
    const el = $('#conexao');
    const map = { on: ['on', 'ao vivo'], teste: ['teste', 'modo teste'], off: ['off', 'reconectando'], conectando: ['', 'conectando…'] };
    const [cls, txt] = map[st] || map.conectando;
    el.className = 'conexao ' + cls;
    el.textContent = txt;
  }

  function aviso(html, tipo) {
    const el = $('#aviso');
    if (!html) { el.hidden = true; el.innerHTML = ''; return; }
    el.className = 'aviso' + (tipo === 'erro' ? ' erro' : '');
    el.innerHTML = html;
    el.hidden = false;
  }

  /* =====================================================================
     CARGA DE DADOS
     ===================================================================== */
  let recarregando = null;
  async function recarregar() {
    if (recarregando) return recarregando;
    recarregando = (async () => {
      try {
        const d = await api.carregar();
        S.escalas = d.escalas || [];
        S.checkins = d.checkins || [];
        indexar();
        const primeira = !S.carregado;
        S.carregado = true;
        if (S.modalId && !S.porId.has(S.modalId)) {
          fecharModal();
          toast('Esse turno foi cancelado ou alterado por outra pessoa.', true);
        }
        render();
        if (primeira) centralizarDia();
        if (api.modo === 'online') aviso('');
      } catch (err) {
        aviso(esc(err.message || 'Não foi possível carregar a escala.'), 'erro');
        if (!S.carregado) { S.carregado = true; render(); }
      } finally {
        recarregando = null;
      }
    })();
    return recarregando;
  }
  let timerRecarga;
  const agendarRecarga = () => { clearTimeout(timerRecarga); timerRecarga = setTimeout(recarregar, 250); };

  /* =====================================================================
     NAVEGAÇÃO E EVENTOS
     ===================================================================== */
  const ABAS = { escala: '', geral: '#geral', mural: '#no-local' };
  function trocarAba(aba, mexerHash = true) {
    if (!ABAS.hasOwnProperty(aba)) aba = 'escala';
    S.aba = aba;
    for (const b of document.querySelectorAll('.abas [data-aba]')) b.setAttribute('aria-selected', String(b.dataset.aba === aba));
    for (const id of Object.keys(ABAS)) $('#aba-' + id).hidden = id !== aba;
    if (mexerHash) history.replaceState(null, '', ABAS[aba] || location.pathname + location.search);
    render();
    if (aba === 'escala') centralizarDia();
  }
  function abaDoHash() {
    const h = location.hash;
    return h === '#geral' ? 'geral' : h === '#no-local' || h === '#mural' ? 'mural' : 'escala';
  }

  function selecionarDia(iso) {
    S.dia = iso;
    renderEscala();
    centralizarDia();
  }

  document.querySelector('.abas').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-aba]');
    if (b) trocarAba(b.dataset.aba);
  });
  window.addEventListener('hashchange', () => trocarAba(abaDoHash(), false));

  document.addEventListener('click', (ev) => {
    if (ev.target.closest('#modal')) return;
    const t = ev.target;
    let b;
    if ((b = t.closest('[data-dia]'))) return selecionarDia(b.dataset.dia);
    if ((b = t.closest('[data-rolar]'))) return $('#dias').scrollBy({ left: +b.dataset.rolar * 300, behavior: 'smooth' });
    if ((b = t.closest('[data-reservar]'))) return modalReservar(b.dataset.reservar);
    if ((b = t.closest('[data-checkin]'))) return modalCheckin(b.dataset.checkin);
    if ((b = t.closest('[data-abrir]'))) return modalDetalhe(b.dataset.abrir);
    if ((b = t.closest('[data-foto]'))) return modalFoto(b.dataset.foto);
    if ((b = t.closest('[data-ir-dia]'))) return selecionarDia(b.dataset.irDia);
    if ((b = t.closest('[data-filtro]'))) { S.filtroMural = b.dataset.filtro; return renderMural(); }
    if (t.closest('[data-compartilhar]')) return compartilharDia();
    if (t.closest('[data-esquecer]')) { S.meuNome = ''; try { localStorage.removeItem(KEY_NOME); } catch (e) { /* */ } return renderEscala(); }
    if (t.closest('[data-limpar-teste]')) {
      if (api.limpar && window.confirm('Apagar todos os dados do modo teste neste navegador?')) { api.limpar(); recarregar(); }
    }
  });

  $('#busca').addEventListener('input', (ev) => { S.busca = ev.target.value; renderGeral(); });
  $('#btn-imprimir').addEventListener('click', () => window.print());

  document.addEventListener('visibilitychange', () => { if (!document.hidden) recarregar(); });

  /* =====================================================================
     INÍCIO
     ===================================================================== */
  function diaInicial() {
    const hoje = hojeIso();
    return S.dias.find((d) => d >= hoje) || S.dias[S.dias.length - 1] || null;
  }

  function iniciar() {
    document.title = C.titulo || 'Escala';
    $('#titulo').textContent = C.titulo || 'Escala';
    $('#subtitulo').textContent = C.subtitulo || '';
    S.dia = diaInicial();

    if (online && !window.supabase) {
      aviso('Não foi possível carregar a conexão com o banco (Supabase). Verifique a internet e recarregue a página.', 'erro');
    } else if (api.modo === 'teste') {
      aviso(`<strong>Modo teste:</strong> os dados ficam só neste navegador. Para usar com a equipe, preencha o Supabase no <code>config.js</code>.
        PIN da coordenação no teste: <strong>${api.ADMIN}</strong>. <button type="button" class="btn-link" data-limpar-teste>apagar dados de teste</button>`);
    }

    trocarAba(abaDoHash(), false);
    setConexao(api.modo === 'teste' ? 'teste' : 'conectando');
    recarregar().then(() => {
      api.assinar(agendarRecarga, setConexao);
    });

    setInterval(render, 30000);                                   // atualiza status (aguardando, sem registro…)
    if (api.modo === 'online') setInterval(recarregar, 60000);    // segurança extra além do tempo real
  }

  iniciar();
})();
