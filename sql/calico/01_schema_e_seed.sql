-- ═══════════════════════════════════════════════════════════════════════════════
-- CALICO — 01. SCHEMA E SEED  (o que o app JÁ usa hoje)
--
-- Rode depois do 00_diagnostico.sql. É idempotente: pode rodar de novo sem
-- duplicar nada.
--
-- O que este script faz:
--   A) garante que characters.system aceite o valor 'calico'
--   B) cria calico_perfis e calico_ocupacoes (conteúdo editável pelo mestre)
--   C) semeia os 3 perfis e as 8 ocupações
--   D) semeia o equipamento inicial no catálogo `items`
--
-- Nada aqui é obrigatório para a ficha funcionar: o app tem os perfis e as
-- ocupações embutidos em src/calico.js como fallback. O banco serve para você
-- editar esse conteúdo sem mexer no código.
-- ═══════════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════════
-- A) characters.system precisa aceitar 'calico'
-- ═══════════════════════════════════════════════════════════════════════════════

-- Caso 1: `system` é um ENUM → adiciona o valor.
-- Caso 2: `system` é text com um CHECK → recria o CHECK incluindo 'calico'.
-- Caso 3: `system` é text sem CHECK → nada a fazer.
do $$
declare
    v_udt      text;
    v_enum     text;
    v_con_name text;
    v_con_def  text;
begin
    select c.udt_name into v_udt
    from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'characters' and c.column_name = 'system';

    if v_udt is null then
        raise notice 'Tabela characters ou coluna system não encontrada — verifique o 00_diagnostico.';
        return;
    end if;

    -- ── Caso 1: ENUM ─────────────────────────────────────────────────────────
    select t.typname into v_enum
    from pg_type t
    where t.typname = v_udt and t.typtype = 'e';

    if v_enum is not null then
        if not exists (
            select 1 from pg_enum e
            join pg_type t on t.oid = e.enumtypid
            where t.typname = v_enum and e.enumlabel = 'calico'
        ) then
            execute format('alter type public.%I add value %L', v_enum, 'calico');
            raise notice 'Valor "calico" adicionado ao enum %', v_enum;
        else
            raise notice 'Enum % já tem o valor "calico".', v_enum;
        end if;
        return;
    end if;

    -- ── Caso 2: CHECK sobre a coluna system ──────────────────────────────────
    select con.conname, pg_get_constraintdef(con.oid)
      into v_con_name, v_con_def
    from pg_constraint con
    where con.conrelid = 'public.characters'::regclass
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%system%'
    limit 1;

    if v_con_name is not null then
        if v_con_def ilike '%calico%' then
            raise notice 'O CHECK % já permite "calico".', v_con_name;
        else
            execute format('alter table public.characters drop constraint %I', v_con_name);
            alter table public.characters
                add constraint characters_system_check
                check (system in ('som-das-seis', 'calico', 'coc', 'dnd', 'op'));
            raise notice 'CHECK % recriado incluindo "calico". Definição anterior: %', v_con_name, v_con_def;
        end if;
    else
        raise notice 'characters.system é texto livre — nada a fazer.';
    end if;
end $$;


-- ═══════════════════════════════════════════════════════════════════════════════
-- B) Conteúdo do Calico — perfis e ocupações
--
-- O app lê estas tabelas ao abrir o criador de personagem (só as linhas com
-- ativo = true, ordenadas por `ordem`). Se a consulta falhar ou voltar vazia,
-- ele cai no seed embutido em src/calico.js e a criação de ficha segue normal.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Perfis (spec §4) — substituem as classes da 1ª edição ────────────────────
create table if not exists public.calico_perfis (
    id                text primary key,
    nome              text not null,
    icon              text,
    descricao         text,
    habilidade_nome   text not null,
    habilidade_texto  text not null,
    -- true = texto provisório, a ser trocado pelo oficial do PDF do playtest.
    -- O app mostra um aviso na ficha enquanto isto for true.
    placeholder       boolean not null default false,
    ordem             integer not null default 0,
    ativo             boolean not null default true,
    created_at        timestamptz not null default now()
);

comment on table public.calico_perfis is
    'Perfis do sistema Calico. Editável pelo mestre; o app usa o seed de src/calico.js como fallback.';
comment on column public.calico_perfis.placeholder is
    'Texto de habilidade provisório (spec §4.1). Troque pelo texto literal do PDF do playtest e marque como false.';


-- ── Ocupações (spec §5) — substituem as origens/ocupações oficiais ───────────
create table if not exists public.calico_ocupacoes (
    id                text primary key,
    nome              text not null,
    icon              text,
    descricao         text,
    habilidade_nome   text not null,
    habilidade_texto  text not null,
    ordem             integer not null default 0,
    ativo             boolean not null default true,
    created_at        timestamptz not null default now()
);

comment on table public.calico_ocupacoes is
    'Ocupações do sistema Calico (1890). Dados de conteúdo, não código — edite à vontade.';


-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Conteúdo de campanha: todo jogador logado lê; escrita também liberada para
-- logados, porque o Hub-RPG não tem um papel de mestre no banco (o "mestre" é
-- quem abriu a sala, o que é estado de socket, não de autenticação).
--
-- Se quiser travar a escrita só para você, troque `to authenticated` por:
--     to authenticated using (
--       exists (select 1 from public.profiles p
--               where p.id = auth.uid() and p.role = 'master')
--     )
-- e marque o seu profiles.role como 'master'.
--
-- NOTA: se as suas tabelas existentes liberarem para `anon` em vez de
-- `authenticated` (veja a consulta 5 do 00_diagnostico), ajuste aqui também.
alter table public.calico_perfis    enable row level security;
alter table public.calico_ocupacoes enable row level security;

drop policy if exists calico_perfis_leitura on public.calico_perfis;
create policy calico_perfis_leitura on public.calico_perfis
    for select to authenticated using (true);

drop policy if exists calico_perfis_escrita on public.calico_perfis;
create policy calico_perfis_escrita on public.calico_perfis
    for all to authenticated using (true) with check (true);

drop policy if exists calico_ocupacoes_leitura on public.calico_ocupacoes;
create policy calico_ocupacoes_leitura on public.calico_ocupacoes
    for select to authenticated using (true);

drop policy if exists calico_ocupacoes_escrita on public.calico_ocupacoes;
create policy calico_ocupacoes_escrita on public.calico_ocupacoes
    for all to authenticated using (true) with check (true);


-- ═══════════════════════════════════════════════════════════════════════════════
-- C) Seed do conteúdo
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Perfis ───────────────────────────────────────────────────────────────────
-- ATENÇÃO: os três textos de habilidade abaixo são PLACEHOLDER (spec §4.1).
-- O texto oficial está nas fichas prontas do PDF do playtest (Alan, Victor,
-- Eloísa, Edgar, Kênia). Quando tiver o PDF em mãos, rode algo assim:
--
--   update public.calico_perfis
--      set habilidade_nome  = 'Nome oficial',
--          habilidade_texto = 'Texto literal do PDF',
--          placeholder      = false
--    where id = 'executor';
--
insert into public.calico_perfis
    (id, nome, icon, descricao, habilidade_nome, habilidade_texto, placeholder, ordem)
values
    ('executor', 'Executor', '💢',
     'Age primeiro e pensa depois. Impulsivo e perseverante; tira força do fracasso',
     'Tirar Força do Fracasso',
     'Quando falhar em um teste, você pode gastar 1 PD para repetir esse mesmo teste uma vez. Só funciona repetindo a mesma abordagem.',
     true, 1),

    ('analista', 'Analista', '🔬',
     'Observa, entende, se prepara, e só então age. Demora, mas acerta',
     'Estudar o Alvo',
     'Gaste sua ação estudando um alvo, obstáculo ou cena. No seu próximo teste contra ele, você recebe +1 passo.',
     true, 2),

    ('vigilante', 'Vigilante', '👁',
     'Sempre atento. Aproveita brechas, age primeiro, decide sob pressão',
     'Nunca Surpreendido',
     'Você nunca fica surpreendido. Quando seria, você age normalmente na primeira rodada.',
     true, 3)
on conflict (id) do update set
    nome      = excluded.nome,
    icon      = excluded.icon,
    descricao = excluded.descricao,
    ordem     = excluded.ordem;
-- Repare: o ON CONFLICT acima NÃO sobrescreve habilidade_nome/habilidade_texto/
-- placeholder. Assim, rodar este script de novo não apaga os textos oficiais
-- que você já tiver colocado no lugar dos placeholders.


-- ── Ocupações ────────────────────────────────────────────────────────────────
insert into public.calico_ocupacoes
    (id, nome, icon, habilidade_nome, habilidade_texto, ordem)
values
    ('pistoleiro', 'Pistoleiro', '🔫', 'Saque Rápido',
     'Uma vez por cena, ao falhar em um teste de Pontaria, gaste 1 PD para rolar esse teste de novo.', 1),

    ('vaqueiro', 'Vaqueiro', '🤠', 'Lida de Campo',
     '+1 passo em testes de Sobrevivência envolvendo animais, montaria ou terreno aberto.', 2),

    ('trapaceiro', 'Trapaceiro', '🃏', 'Carta na Manga',
     'Uma vez por cena, gaste 1 PD para trocar o resultado de um dos seus dados por 4.', 3),

    ('barbeiro_cirurgiao', 'Barbeiro-cirurgião', '🪒', 'Mão Firme',
     'Fora de combate, gaste 1 PD para restaurar 1d4 PV a um aliado. Uma vez por aliado por descanso.', 4),

    ('batedor', 'Batedor', '🧭', 'Leitura de Terreno',
     'Uma vez por cena, faça uma pergunta ao mestre sobre o ambiente físico. A resposta é verdadeira.', 5),

    ('pregador', 'Pregador', '✝', 'Palavra de Conforto',
     'Uma vez por cena, ajude um aliado em um teste de Disciplina sem gastar sua ação.', 6),

    ('ferroviario', 'Ferroviário', '🚂', 'Homem de Trilho',
     '+1 passo em testes de Maquinário e em qualquer teste feito dentro ou sobre um trem.', 7),

    ('garimpeiro', 'Garimpeiro', '⛏', 'Faro de Rocha',
     '+1 passo em testes de Engenhoca e Atletismo envolvendo rocha, mina, túnel ou explosivo.', 8)
on conflict (id) do update set
    nome  = excluded.nome,
    icon  = excluded.icon,
    ordem = excluded.ordem;


-- ═══════════════════════════════════════════════════════════════════════════════
-- D) Equipamento inicial no catálogo `items`
--
-- Ao criar um personagem Calico, o app procura estes itens PELO NOME e, se os
-- encontrar, já os coloca no inventário do personagem (src/characters.js →
-- seedInventarioInicial). Se não encontrar, não quebra nada: você entrega na mão.
--
-- Os nomes precisam bater EXATAMENTE com os de src/calico.js
-- (EQUIPAMENTO_INICIAL e ARMAS). Se mudar um nome aqui, mude lá também.
--
-- NOTA: o insert abaixo não informa a coluna `id`, contando com o DEFAULT
-- gen_random_uuid() que o Supabase cria por padrão. Se a consulta 4 do
-- diagnóstico mostrar que `items.id` NÃO tem default, rode antes:
--     alter table public.items alter column id set default gen_random_uuid();
-- ═══════════════════════════════════════════════════════════════════════════════

insert into public.items (name, icon, viewable)
select v.name, v.icon, v.viewable
from (values
    -- Armas de fogo iniciais (spec §7.5 e §7.7)
    ('Revólver de ação simples', '🔫', true),
    ('Winchester de alavanca',   '🔫', true),
    ('Escopeta de cano duplo',   '🔫', true),
    ('Fuzil de caça de ferrolho','🔫', true),
    -- Kit padrão de todo personagem (spec §6.3)
    ('Faca',                     '🔪', true),
    ('Roupa de viagem',          '🧥', false),
    ('Chapéu',                   '🎩', false),
    ('Cantil',                   '🫙', false),
    ('Fósforos',                 '🔥', false),
    ('Corda',                    '🪢', false),
    ('Cavalo com sela',          '🐴', true),
    -- Munição — o app cria uma linha por arma escolhida, com este nome exato
    ('Munição de Revólver de ação simples — 2 recargas',  '📦', false),
    ('Munição de Winchester de alavanca — 2 recargas',    '📦', false),
    ('Munição de Escopeta de cano duplo — 2 recargas',    '📦', false),
    ('Munição de Fuzil de caça de ferrolho — 2 recargas', '📦', false),
    -- Itens de cena comuns no arco
    ('Dinamite',                 '🧨', true),
    ('Lampião',                  '🏮', true),
    ('Gazua',                    '🗝', true)
) as v(name, icon, viewable)
where not exists (
    select 1 from public.items i where i.name = v.name
);


-- ═══════════════════════════════════════════════════════════════════════════════
-- CONFERÊNCIA
-- ═══════════════════════════════════════════════════════════════════════════════
select 'perfis'    as tabela, count(*) as linhas from public.calico_perfis
union all
select 'ocupacoes',            count(*)          from public.calico_ocupacoes
union all
select 'itens do calico',      count(*)          from public.items
    where name in ('Revólver de ação simples', 'Faca', 'Cavalo com sela', 'Cantil');
-- Esperado: 3 perfis, 8 ocupações, 4 itens do calico.
