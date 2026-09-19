-- ═══════════════════════════════════════════════════════════════════════════════
-- CALICO — 00. DIAGNÓSTICO  (rode ISTO primeiro, no SQL Editor do Supabase)
--
-- Nada aqui altera o banco. São só consultas para você conferir o terreno antes
-- de rodar o 01. Olhe cada resultado e compare com o que o comentário diz.
-- ═══════════════════════════════════════════════════════════════════════════════


-- ── 1. A coluna `system` de `characters` aceita um valor novo? ────────────────
-- Se `data_type` for USER-DEFINED, é um ENUM e o script 01 vai adicionar o valor.
-- Se for text/varchar, veja a consulta 2 (pode haver um CHECK limitando os valores).
select column_name, data_type, udt_name, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'characters'
  and column_name = 'system';


-- ── 2. Existe algum CHECK limitando os sistemas aceitos? ─────────────────────
-- Se voltar vazio, qualquer texto passa e não há nada a fazer.
-- Se voltar uma linha citando 'som-das-seis', o script 01 recria o CHECK com
-- 'calico' incluído.
select conname as constraint_name,
       pg_get_constraintdef(oid) as definicao
from pg_constraint
where conrelid = 'public.characters'::regclass
  and contype = 'c';


-- ── 3. Se `system` for ENUM, quais valores ele já tem? ───────────────────────
select t.typname as enum_type, e.enumlabel as valor
from pg_type t
join pg_enum e on e.enumtypid = t.oid
join pg_attribute a on a.atttypid = t.oid
join pg_class c on c.oid = a.attrelid
where c.relname = 'characters'
  and a.attname = 'system'
order by e.enumsortorder;


-- ── 4. Como é a tabela `items`? ──────────────────────────────────────────────
-- O script 01 insere o equipamento inicial do Calico aqui. Confira se `id` tem
-- um DEFAULT (normalmente gen_random_uuid()). Se NÃO tiver, veja a nota no 01.
select column_name, data_type, column_default, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'items'
order by ordinal_position;


-- ── 5. Quais políticas RLS suas tabelas já usam? ─────────────────────────────
-- IMPORTANTE: o script 01 cria políticas para o papel `authenticated`, que é o
-- que o Hub-RPG usa (os jogadores fazem login). Se as suas tabelas existentes
-- liberarem para `anon` em vez disso, ajuste as políticas do 01 para bater.
select tablename, policyname, roles, cmd, qual
from pg_policies
where schemaname = 'public'
  and tablename in ('characters', 'items', 'inventory', 'missions', 'npcs', 'profiles')
order by tablename, policyname;


-- ── 6. RLS está ligado nessas tabelas? ───────────────────────────────────────
select relname as tabela, relrowsecurity as rls_ligado
from pg_class
where relnamespace = 'public'::regnamespace
  and relkind = 'r'
  and relname in ('characters', 'items', 'inventory', 'missions', 'npcs', 'profiles')
order by relname;


-- ── 7. Já existe alguma tabela do Calico? (deve voltar vazio na 1ª vez) ──────
select table_name
from information_schema.tables
where table_schema = 'public' and table_name like 'calico%'
order by table_name;
