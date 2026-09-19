-- ═══════════════════════════════════════════════════════════════════════════════
-- CALICO — 99. ROLLBACK
--
-- Desfaz o que os scripts 01 e 02 criaram. Rode só se quiser começar do zero.
--
-- ⚠ DESTRUTIVO: apaga perfis, ocupações, cenas, pontos de interesse,
--   adversários, notoriedade e o log de rolagens do Calico.
--
-- NÃO apaga:
--   • personagens (public.characters) — inclusive os do sistema 'calico'
--   • inventários
--   • os itens do catálogo (veja a seção opcional no fim)
--
-- Cada bloco está comentado. Descomente só o que quiser desfazer.
-- ═══════════════════════════════════════════════════════════════════════════════


-- ── 1. Tabelas das próximas etapas (script 02) ───────────────────────────────
-- drop table if exists public.calico_rolagens        cascade;
-- drop table if exists public.calico_pontos_interesse cascade;
-- drop table if exists public.calico_cenas           cascade;
-- drop table if exists public.calico_adversarios     cascade;
-- drop table if exists public.calico_notoriedade_log cascade;
-- drop table if exists public.calico_mesa            cascade;


-- ── 2. Conteúdo do sistema (script 01) ───────────────────────────────────────
-- Cuidado: se você já substituiu os textos placeholder pelos oficiais do
-- playtest, este drop perde esse trabalho. Faça uma cópia antes:
--     create table calico_perfis_backup as select * from public.calico_perfis;
--
-- drop table if exists public.calico_ocupacoes cascade;
-- drop table if exists public.calico_perfis    cascade;


-- ── 3. Itens do equipamento inicial (opcional) ───────────────────────────────
-- Só rode se ninguém tiver esses itens no inventário — a FK de `inventory`
-- bloqueia o delete, ou apaga em cascata, dependendo de como ela foi criada.
-- Confira antes quem está usando:
--
-- select i.name, count(inv.id) as em_inventarios
-- from public.items i
-- left join public.inventory inv on inv.item_id = i.id
-- where i.name in (
--     'Revólver de ação simples', 'Winchester de alavanca', 'Escopeta de cano duplo',
--     'Fuzil de caça de ferrolho', 'Faca', 'Roupa de viagem', 'Chapéu', 'Cantil',
--     'Fósforos', 'Corda', 'Cavalo com sela', 'Dinamite', 'Lampião', 'Gazua'
-- )
-- group by i.name
-- order by i.name;
--
-- delete from public.items where name in (
--     'Munição de Revólver de ação simples — 2 recargas',
--     'Munição de Winchester de alavanca — 2 recargas',
--     'Munição de Escopeta de cano duplo — 2 recargas',
--     'Munição de Fuzil de caça de ferrolho — 2 recargas'
-- );


-- ── 4. Voltar o CHECK de characters.system ao que era ────────────────────────
-- Só faz sentido se o script 01 tiver recriado um CHECK (ele avisa isso no
-- NOTICE). Remover 'calico' da lista com fichas Calico já salvas faz o ALTER
-- falhar — apague-as antes, se for o caso:
--     delete from public.characters where system = 'calico';
--
-- alter table public.characters drop constraint if exists characters_system_check;
-- alter table public.characters
--     add constraint characters_system_check
--     check (system in ('som-das-seis', 'coc', 'dnd', 'op'));
--
-- Se `system` for um ENUM, saiba que o Postgres NÃO permite remover um valor de
-- enum. Para reverter de verdade seria preciso recriar o tipo inteiro — na
-- prática, deixe 'calico' lá; um valor a mais não atrapalha nada.
