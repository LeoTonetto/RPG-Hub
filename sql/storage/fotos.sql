-- ═══════════════════════════════════════════════════════════════════════════════
-- FOTOS DE PERSONAGEM — policies do bucket CharactersAndItems
--
-- Diagnóstico: trocar a foto não funcionava para quem não é mestre. O app subia
-- a imagem, o Storage recusava por policy, e o código engolia o erro e mantinha
-- a foto antiga — a tela dizia "atualizado" e nada mudava. O engolir já foi
-- corrigido (src/characters.js agora mostra o motivo). Este script arruma a
-- causa: a permissão de escrita no bucket.
--
-- O app grava em:  {user_id}/{character_id}/photo.{ext}
-- ou seja, o PRIMEIRO nível de pasta é o id do usuário. É nisso que as policies
-- abaixo se apoiam para deixar cada jogador escrever só na própria pasta.
--
-- IMPORTANTE: `upsert: true` faz UPDATE quando o arquivo já existe. Sem a policy
-- de UPDATE, o primeiro envio funciona e toda TROCA depois falha — sintoma
-- clássico de "a primeira foto foi, mas não consigo mudar".
-- ═══════════════════════════════════════════════════════════════════════════════


-- ── 1. Diagnóstico: o que existe hoje? ───────────────────────────────────────
select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
order by policyname;

-- O bucket existe e é público para leitura?
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'CharactersAndItems';


-- ── 2. O bucket precisa ser público para as fotos aparecerem ─────────────────
-- O app usa getPublicUrl(), então a leitura tem que ser aberta.
update storage.buckets
   set public = true
 where id = 'CharactersAndItems';


-- ── 3. Policies de escrita, por pasta de usuário ─────────────────────────────
-- Recriadas do zero para ficar previsível. Se você tiver policies próprias com
-- outros nomes, confira a consulta 1 antes de rodar e apague as duplicadas.

drop policy if exists "chars_leitura_publica" on storage.objects;
create policy "chars_leitura_publica" on storage.objects
    for select
    to public
    using (bucket_id = 'CharactersAndItems');

-- INSERT: primeira vez que a foto é enviada
drop policy if exists "chars_insere_na_propria_pasta" on storage.objects;
create policy "chars_insere_na_propria_pasta" on storage.objects
    for insert
    to authenticated
    with check (
        bucket_id = 'CharactersAndItems'
        and (storage.foldername(name))[1] = auth.uid()::text
    );

-- UPDATE: é ESTA que faltava. `upsert: true` cai aqui ao trocar a foto.
drop policy if exists "chars_atualiza_na_propria_pasta" on storage.objects;
create policy "chars_atualiza_na_propria_pasta" on storage.objects
    for update
    to authenticated
    using (
        bucket_id = 'CharactersAndItems'
        and (storage.foldername(name))[1] = auth.uid()::text
    )
    with check (
        bucket_id = 'CharactersAndItems'
        and (storage.foldername(name))[1] = auth.uid()::text
    );

-- DELETE: para o jogador poder limpar as próprias imagens
drop policy if exists "chars_apaga_na_propria_pasta" on storage.objects;
create policy "chars_apaga_na_propria_pasta" on storage.objects
    for delete
    to authenticated
    using (
        bucket_id = 'CharactersAndItems'
        and (storage.foldername(name))[1] = auth.uid()::text
    );


-- ── 4. E as fotos que o MESTRE sobe para NPCs e itens? ───────────────────────
-- Se você usa este mesmo bucket para NPCs e itens e sobe tudo pela sua conta,
-- as policies acima já cobrem (você escreve na sua própria pasta). Se o caminho
-- desses arquivos NÃO começar pelo seu user_id, descomente o bloco abaixo para
-- dar ao mestre escrita livre no bucket — ele depende de profiles.role = 'master'.
--
-- drop policy if exists "chars_mestre_escreve_tudo" on storage.objects;
-- create policy "chars_mestre_escreve_tudo" on storage.objects
--     for all
--     to authenticated
--     using (
--         bucket_id = 'CharactersAndItems'
--         and exists (select 1 from public.profiles p
--                     where p.id = auth.uid() and p.role = 'master')
--     )
--     with check (
--         bucket_id = 'CharactersAndItems'
--         and exists (select 1 from public.profiles p
--                     where p.id = auth.uid() and p.role = 'master')
--     );
--
-- E marque a sua conta como mestre:
--     update public.profiles set role = 'master' where "user" = 'SEU_USUARIO';


-- ── 5. Conferência ───────────────────────────────────────────────────────────
select policyname, cmd
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and policyname like 'chars_%'
order by cmd;
-- Esperado: SELECT, INSERT, UPDATE e DELETE.


-- ── Se ainda falhar ──────────────────────────────────────────────────────────
-- Agora o app mostra o motivo exato no modal de personagem. Peça ao jogador o
-- texto do erro e abra o Console (Ctrl+Shift+I) para ver o objeto completo em
-- "[Photo] Falha no upload:". Os suspeitos mais comuns:
--   • "new row violates row-level security policy" → a policy não bateu; confira
--     se o caminho realmente começa com o user_id daquele jogador
--   • "The resource already exists" → falta a policy de UPDATE (seção 3)
--   • "Payload too large" → file_size_limit do bucket (consulta 1)
