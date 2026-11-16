-- ══════════════════════════════════════════════════════════════════════════════
-- D&D 5e — correções nas magias depois da validação contra o Livro do Jogador
-- (2026-11-15). Rode uma vez no SQL Editor do Supabase. Pode rodar de novo
-- sem problema: só acerta estas cinco linhas.
--
--   • Coroa da Loucura também é magia de bruxo;
--   • Patas de Aranha também é magia de feiticeiro;
--   • Mãos Flamejantes pede teste de resistência de Destreza;
--   • Conjurar Rajada causa 3d8 e Conjurar Saraivada 8d8 (o tipo é o da arma
--     ou munição usada).
-- ══════════════════════════════════════════════════════════════════════════════

update public.dnd_magias set classes = array['bardo', 'bruxo', 'feiticeiro', 'mago']::text[], atualizado_em = now() where id = 'coroa-da-loucura';
update public.dnd_magias set classes = array['bruxo', 'feiticeiro', 'mago']::text[], atualizado_em = now() where id = 'patas-de-aranha';
update public.dnd_magias set resistencia = 'des', atualizado_em = now() where id = 'maos-flamejantes';
update public.dnd_magias set dano = '3d8', atualizado_em = now() where id = 'conjurar-rajada';
update public.dnd_magias set dano = '8d8', atualizado_em = now() where id = 'conjurar-saraivada';

-- Conferência: deve listar as cinco, já corrigidas
select id, classes, resistencia, dano from public.dnd_magias
where id in ('coroa-da-loucura', 'patas-de-aranha', 'maos-flamejantes', 'conjurar-rajada', 'conjurar-saraivada')
order by id;
