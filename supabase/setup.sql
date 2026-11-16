-- =====================================================================
--  ESCALA DO TURISMO — configuração do banco no Supabase
--
--  Como usar:
--    Supabase > SQL Editor > New query > cole TODO este arquivo > Run
--
--  Pode rodar de novo quando quiser: o script não apaga dados.
--
--  Depois, defina o PIN da coordenação (só números, 6 a 12 dígitos)
--  rodando, numa query separada e SEM salvar no GitHub:
--      select public.definir_pin_admin('SEU_PIN_AQUI');
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;


-- ---------------------------------------------------------------------
--  1. Tabelas
-- ---------------------------------------------------------------------

-- Cada linha = uma pessoa escalada num local, num dia, num horário.
create table if not exists public.escalas (
  id            uuid primary key default gen_random_uuid(),
  data          date not null,
  local         text not null,             -- id do local no config.js (ex.: carrossel)
  hora_inicio   time not null,
  hora_fim      time not null,
  nome          text not null,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists escalas_slot_idx on public.escalas (data, local, hora_inicio, hora_fim);
create index if not exists escalas_nome_idx on public.escalas (lower(nome), data);

-- PIN de cada turno (guardado só como hash, nunca exposto ao site).
create table if not exists public.escala_pins (
  escala_id uuid primary key references public.escalas(id) on delete cascade,
  pin_hash  text not null
);

-- Controle de tentativas erradas de PIN (5 erros = 10 min bloqueado).
create table if not exists public.pin_tentativas (
  escala_id     uuid primary key references public.escalas(id) on delete cascade,
  falhas        int not null default 0,
  bloqueado_ate timestamptz
);

-- Registro "Estou no local": uma foto por turno, horário do servidor.
create table if not exists public.checkins (
  id          uuid primary key default gen_random_uuid(),
  escala_id   uuid not null unique references public.escalas(id) on delete cascade,
  foto_path   text not null,
  thumb_path  text not null,
  observacao  text,
  criado_em   timestamptz not null default now()
);
create index if not exists checkins_criado_idx on public.checkins (criado_em desc);

-- Configurações internas (PIN da coordenação). Ninguém lê pelo site.
create table if not exists public.app_config (
  chave text primary key,
  valor text not null
);


-- ---------------------------------------------------------------------
--  2. Segurança: o site só LÊ escalas e check-ins.
--     Toda gravação passa pelas funções abaixo, que conferem o PIN.
-- ---------------------------------------------------------------------

alter table public.escalas        enable row level security;
alter table public.escala_pins    enable row level security;
alter table public.pin_tentativas enable row level security;
alter table public.checkins       enable row level security;
alter table public.app_config     enable row level security;

drop policy if exists "escalas_leitura_publica" on public.escalas;
create policy "escalas_leitura_publica" on public.escalas
  for select to anon, authenticated using (true);

drop policy if exists "checkins_leitura_publica" on public.checkins;
create policy "checkins_leitura_publica" on public.checkins
  for select to anon, authenticated using (true);

revoke insert, update, delete, truncate on public.escalas, public.checkins from anon, authenticated;
revoke all on public.escala_pins, public.pin_tentativas, public.app_config from anon, authenticated;


-- ---------------------------------------------------------------------
--  3. Funções auxiliares (internas, o site não chama)
-- ---------------------------------------------------------------------

-- Intervalo do turno; se o fim for menor que o início, passa da meia-noite.
create or replace function public._faixa(p_data date, p_ini time, p_fim time)
returns tsrange language sql immutable as $$
  select tsrange(
    p_data + p_ini,
    case when p_fim <= p_ini then (p_data + 1) + p_fim else p_data + p_fim end,
    '[)')
$$;

-- "Agora" no horário de Guarapuava.
create or replace function public._agora_local()
returns timestamp language sql stable as $$
  select (now() at time zone 'America/Sao_Paulo')
$$;

create or replace function public._erro(p_msg text)
returns jsonb language sql immutable as $$
  select jsonb_build_object('ok', false, 'erro', p_msg)
$$;

create or replace function public._limpa_nome(p_nome text)
returns text language sql immutable as $$
  select btrim(regexp_replace(coalesce(p_nome, ''), '\s+', ' ', 'g'))
$$;

-- Confere o PIN. Devolve 'admin', 'dono', 'bloqueado' ou null (errado).
create or replace function public._verificar(p_escala uuid, p_pin text)
returns text language plpgsql
set search_path = public, extensions as $$
declare
  v_hash text;
  v_bloq timestamptz;
begin
  -- PIN da coordenação vale para qualquer turno
  select valor into v_hash from app_config where chave = 'admin_pin_hash';
  if coalesce(p_pin, '') <> '' and v_hash is not null and crypt(p_pin, v_hash) = v_hash then
    return 'admin';
  end if;

  select bloqueado_ate into v_bloq from pin_tentativas where escala_id = p_escala;
  if v_bloq is not null and v_bloq > now() then
    return 'bloqueado';
  end if;

  select pin_hash into v_hash from escala_pins where escala_id = p_escala;
  if coalesce(p_pin, '') <> '' and v_hash is not null and crypt(p_pin, v_hash) = v_hash then
    delete from pin_tentativas where escala_id = p_escala;
    return 'dono';
  end if;

  insert into pin_tentativas as t (escala_id, falhas) values (p_escala, 1)
  on conflict (escala_id) do update set
    falhas        = case when t.falhas + 1 >= 5 then 0 else t.falhas + 1 end,
    bloqueado_ate = case when t.falhas + 1 >= 5 then now() + interval '10 minutes' else null end;
  return null;
end $$;

create or replace function public._msg_pin(p_papel text)
returns jsonb language sql immutable as $$
  select case
    when p_papel = 'bloqueado' then public._erro('Muitas tentativas com PIN errado. Aguarde 10 minutos ou fale com a coordenação.')
    else public._erro('PIN incorreto.')
  end
$$;

-- Ainda tem vaga nesse local/dia/horário?
create or replace function public._tem_vaga(p_data date, p_local text, p_ini time, p_fim time,
                                            p_vagas int, p_ignorar uuid)
returns boolean language sql stable as $$
  select count(*) < greatest(1, least(coalesce(p_vagas, 1), 10))
  from public.escalas
  where data = p_data and local = p_local and hora_inicio = p_ini and hora_fim = p_fim
    and id is distinct from p_ignorar
$$;

-- A mesma pessoa já está em outro lugar no mesmo horário?
create or replace function public._conflito(p_nome text, p_data date, p_ini time, p_fim time,
                                            p_ignorar uuid)
returns jsonb language sql stable as $$
  select jsonb_build_object(
           'ok', false, 'codigo', 'conflito',
           'erro', format('%s já está escalado(a) das %s às %s nesse dia.',
                          e.nome, to_char(e.hora_inicio, 'HH24:MI'), to_char(e.hora_fim, 'HH24:MI')),
           'nome', e.nome, 'local', e.local, 'data', e.data,
           'inicio', to_char(e.hora_inicio, 'HH24:MI'), 'fim', to_char(e.hora_fim, 'HH24:MI'))
  from public.escalas e
  where lower(e.nome) = lower(p_nome)
    and e.id is distinct from p_ignorar
    and e.data between p_data - 1 and p_data + 1
    and public._faixa(e.data, e.hora_inicio, e.hora_fim) && public._faixa(p_data, p_ini, p_fim)
  limit 1
$$;

-- Pode registrar presença agora? Devolve null (pode) ou o erro.
create or replace function public._checa_checkin(p_id uuid, p_papel text)
returns jsonb language plpgsql stable as $$
declare
  -- Mesmo valor de "checkinAntecedenciaMin" no config.js
  v_antecedencia interval := interval '60 minutes';
  v public.escalas%rowtype;
  v_faixa tsrange;
  v_agora timestamp := public._agora_local();
begin
  select * into v from public.escalas where id = p_id;
  if not found then return public._erro('Esse turno não existe mais.'); end if;
  if exists (select 1 from public.checkins where escala_id = p_id) then
    return public._erro('A presença deste turno já foi registrada.');
  end if;
  if p_papel = 'admin' then return null; end if;

  v_faixa := public._faixa(v.data, v.hora_inicio, v.hora_fim);
  if v_agora < lower(v_faixa) - v_antecedencia then
    return public._erro(format('O registro abre às %s do dia %s.',
      to_char(lower(v_faixa) - v_antecedencia, 'HH24:MI'),
      to_char(lower(v_faixa) - v_antecedencia, 'DD/MM')));
  end if;
  if v_agora > upper(v_faixa) then
    return public._erro('Esse turno já terminou. Para registrar agora, fale com a coordenação.');
  end if;
  return null;
end $$;


-- ---------------------------------------------------------------------
--  4. Funções que o site chama
-- ---------------------------------------------------------------------

-- Escolher um horário livre
create or replace function public.reservar_turno(
  p_data date, p_local text, p_inicio time, p_fim time,
  p_nome text, p_pin text, p_vagas int default 1)
returns jsonb language plpgsql security definer
set search_path = public, extensions as $$
declare
  v_nome text := _limpa_nome(p_nome);
  v_conf jsonb;
  v_id uuid;
begin
  if char_length(v_nome) < 3 or char_length(v_nome) > 80 then
    return _erro('Digite seu nome (pelo menos 3 letras).');
  end if;
  if coalesce(p_pin, '') !~ '^[0-9]{4}$' then
    return _erro('O PIN precisa ter exatamente 4 números.');
  end if;
  if coalesce(btrim(p_local), '') = '' or char_length(p_local) > 60
     or p_data is null or p_inicio is null or p_fim is null or p_inicio = p_fim then
    return _erro('Horário inválido.');
  end if;
  if upper(_faixa(p_data, p_inicio, p_fim)) <= _agora_local() then
    return _erro('Esse horário já terminou.');
  end if;

  perform pg_advisory_xact_lock(hashtext(concat_ws('|', p_data, p_local, p_inicio, p_fim)));

  if not _tem_vaga(p_data, p_local, p_inicio, p_fim, p_vagas, null) then
    return _erro('Esse horário acabou de ser preenchido por outra pessoa. Escolha outro.');
  end if;

  v_conf := _conflito(v_nome, p_data, p_inicio, p_fim, null);
  if v_conf is not null then return v_conf; end if;

  insert into escalas (data, local, hora_inicio, hora_fim, nome)
  values (p_data, btrim(p_local), p_inicio, p_fim, v_nome)
  returning id into v_id;

  insert into escala_pins (escala_id, pin_hash) values (v_id, crypt(p_pin, gen_salt('bf')));

  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- Editar nome, dia, local ou horário
create or replace function public.editar_turno(
  p_id uuid, p_pin text, p_data date, p_local text, p_inicio time, p_fim time,
  p_nome text, p_vagas int default 1)
returns jsonb language plpgsql security definer
set search_path = public, extensions as $$
declare
  v_nome  text := _limpa_nome(p_nome);
  v_atual escalas%rowtype;
  v_papel text;
  v_conf  jsonb;
  v_mudou boolean;
begin
  select * into v_atual from escalas where id = p_id;
  if not found then return _erro('Esse turno não existe mais (pode ter sido cancelado).'); end if;

  v_papel := _verificar(p_id, p_pin);
  if v_papel is null or v_papel = 'bloqueado' then return _msg_pin(v_papel); end if;

  if v_papel <> 'admin' and exists (select 1 from checkins where escala_id = p_id) then
    return _erro('Este turno já tem presença registrada. Só a coordenação pode alterar.');
  end if;
  if char_length(v_nome) < 3 or char_length(v_nome) > 80 then
    return _erro('Digite o nome (pelo menos 3 letras).');
  end if;
  if coalesce(btrim(p_local), '') = '' or char_length(p_local) > 60
     or p_data is null or p_inicio is null or p_fim is null or p_inicio = p_fim then
    return _erro('Horário inválido.');
  end if;

  v_mudou := (p_data, btrim(p_local), p_inicio, p_fim)
             is distinct from (v_atual.data, v_atual.local, v_atual.hora_inicio, v_atual.hora_fim);

  if v_mudou then
    if v_papel <> 'admin' then
      if lower(_faixa(v_atual.data, v_atual.hora_inicio, v_atual.hora_fim)) <= _agora_local() then
        return _erro('Esse turno já começou. Para trocar agora, fale com a coordenação.');
      end if;
      if upper(_faixa(p_data, p_inicio, p_fim)) <= _agora_local() then
        return _erro('O novo horário já terminou.');
      end if;
    end if;
    perform pg_advisory_xact_lock(hashtext(concat_ws('|', p_data, btrim(p_local), p_inicio, p_fim)));
    if not _tem_vaga(p_data, btrim(p_local), p_inicio, p_fim, p_vagas, p_id) then
      return _erro('Esse horário já está preenchido. Escolha outro.');
    end if;
  end if;

  v_conf := _conflito(v_nome, p_data, p_inicio, p_fim, p_id);
  if v_conf is not null then return v_conf; end if;

  update escalas
     set data = p_data, local = btrim(p_local), hora_inicio = p_inicio, hora_fim = p_fim,
         nome = v_nome, atualizado_em = now()
   where id = p_id;

  return jsonb_build_object('ok', true, 'id', p_id, 'papel', v_papel);
end $$;

-- Cancelar (liberar o horário)
create or replace function public.cancelar_turno(p_id uuid, p_pin text)
returns jsonb language plpgsql security definer
set search_path = public, extensions as $$
declare
  v_atual escalas%rowtype;
  v_papel text;
begin
  select * into v_atual from escalas where id = p_id;
  if not found then return _erro('Esse turno não existe mais.'); end if;

  v_papel := _verificar(p_id, p_pin);
  if v_papel is null or v_papel = 'bloqueado' then return _msg_pin(v_papel); end if;

  if v_papel <> 'admin' then
    if exists (select 1 from checkins where escala_id = p_id) then
      return _erro('Este turno já tem presença registrada. Só a coordenação pode cancelar.');
    end if;
    if lower(_faixa(v_atual.data, v_atual.hora_inicio, v_atual.hora_fim)) <= _agora_local() then
      return _erro('Esse turno já começou. Para cancelar agora, fale com a coordenação.');
    end if;
  end if;

  delete from escalas where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

-- Antes de enviar a foto: confere PIN e se o registro está aberto
create or replace function public.conferir_checkin(p_id uuid, p_pin text)
returns jsonb language plpgsql security definer
set search_path = public, extensions as $$
declare
  v_papel text;
  v_err jsonb;
begin
  if not exists (select 1 from escalas where id = p_id) then
    return _erro('Esse turno não existe mais.');
  end if;
  v_papel := _verificar(p_id, p_pin);
  if v_papel is null or v_papel = 'bloqueado' then return _msg_pin(v_papel); end if;
  v_err := _checa_checkin(p_id, v_papel);
  if v_err is not null then return v_err; end if;
  return jsonb_build_object('ok', true, 'papel', v_papel);
end $$;

-- Registrar presença (depois que a foto subiu)
create or replace function public.registrar_checkin(
  p_id uuid, p_pin text, p_foto text, p_thumb text, p_obs text default null)
returns jsonb language plpgsql security definer
set search_path = public, extensions as $$
declare
  v_papel text;
  v_err jsonb;
  v_id uuid;
begin
  if not exists (select 1 from escalas where id = p_id) then
    return _erro('Esse turno não existe mais.');
  end if;
  v_papel := _verificar(p_id, p_pin);
  if v_papel is null or v_papel = 'bloqueado' then return _msg_pin(v_papel); end if;
  v_err := _checa_checkin(p_id, v_papel);
  if v_err is not null then return v_err; end if;

  if coalesce(p_foto, '')  !~ ('^' || p_id::text || '/[0-9]+\.jpg$')
  or coalesce(p_thumb, '') !~ ('^' || p_id::text || '/[0-9]+-mini\.jpg$') then
    return _erro('Foto inválida. Tente de novo.');
  end if;

  insert into checkins (escala_id, foto_path, thumb_path, observacao)
  values (p_id, p_foto, p_thumb, nullif(left(btrim(coalesce(p_obs, '')), 200), ''))
  on conflict (escala_id) do nothing
  returning id into v_id;

  if v_id is null then return _erro('A presença deste turno já foi registrada.'); end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- Definir/trocar o PIN da coordenação (só pelo SQL Editor)
create or replace function public.definir_pin_admin(p_pin text)
returns text language plpgsql security definer
set search_path = public, extensions as $$
begin
  if coalesce(p_pin, '') !~ '^[0-9]{6,12}$' then
    raise exception 'O PIN da coordenação precisa ter de 6 a 12 números.';
  end if;
  insert into app_config (chave, valor) values ('admin_pin_hash', crypt(p_pin, gen_salt('bf')))
  on conflict (chave) do update set valor = excluded.valor;
  return 'PIN da coordenação definido.';
end $$;


-- ---------------------------------------------------------------------
--  5. Quem pode chamar o quê
-- ---------------------------------------------------------------------

revoke all on function public._faixa(date, time, time)                         from public, anon, authenticated;
revoke all on function public._agora_local()                                   from public, anon, authenticated;
revoke all on function public._erro(text)                                      from public, anon, authenticated;
revoke all on function public._limpa_nome(text)                                from public, anon, authenticated;
revoke all on function public._verificar(uuid, text)                           from public, anon, authenticated;
revoke all on function public._msg_pin(text)                                   from public, anon, authenticated;
revoke all on function public._tem_vaga(date, text, time, time, int, uuid)     from public, anon, authenticated;
revoke all on function public._conflito(text, date, time, time, uuid)          from public, anon, authenticated;
revoke all on function public._checa_checkin(uuid, text)                       from public, anon, authenticated;
revoke all on function public.definir_pin_admin(text)                          from public, anon, authenticated;

revoke all on function public.reservar_turno(date, text, time, time, text, text, int)        from public;
revoke all on function public.editar_turno(uuid, text, date, text, time, time, text, int)    from public;
revoke all on function public.cancelar_turno(uuid, text)                                     from public;
revoke all on function public.conferir_checkin(uuid, text)                                   from public;
revoke all on function public.registrar_checkin(uuid, text, text, text, text)                from public;

grant execute on function public.reservar_turno(date, text, time, time, text, text, int)     to anon, authenticated;
grant execute on function public.editar_turno(uuid, text, date, text, time, time, text, int) to anon, authenticated;
grant execute on function public.cancelar_turno(uuid, text)                                  to anon, authenticated;
grant execute on function public.conferir_checkin(uuid, text)                                to anon, authenticated;
grant execute on function public.registrar_checkin(uuid, text, text, text, text)             to anon, authenticated;


-- ---------------------------------------------------------------------
--  6. Fotos (Storage): pasta pública "checkins", só JPG até 3 MB
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('checkins', 'checkins', true, 3145728, array['image/jpeg'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "checkins_envio_fotos" on storage.objects;
create policy "checkins_envio_fotos" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'checkins');


-- ---------------------------------------------------------------------
--  7. Tempo real: avisar o site quando algo mudar
-- ---------------------------------------------------------------------

do $$
begin
  begin
    alter publication supabase_realtime add table public.escalas;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.checkins;
  exception when duplicate_object then null;
  end;
end $$;

-- Pronto. Agora rode, numa query separada:
--   select public.definir_pin_admin('SEU_PIN_AQUI');
