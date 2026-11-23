-- Caixa de suporte do Master: lista chamados externos e grava respostas.
-- A chamada fica no servidor da aplicação, autenticada pela chave de suporte
-- existente; nenhuma chave do Supabase é enviada ao navegador.

CREATE OR REPLACE FUNCTION public.suporte_externo_master_listar(p_chave text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_chamados jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM public.suporte_externo_origens o
     WHERE o.ativo
       AND o.chave_hash = encode(sha256(convert_to(coalesce(p_chave, ''), 'UTF8')), 'hex')
  ) THEN
    RAISE EXCEPTION 'Chave de suporte inválida.' USING ERRCODE = '28000';
  END IF;

  SELECT coalesce(jsonb_agg(q.chamado ORDER BY q.criado_em DESC), '[]'::jsonb)
    INTO v_chamados
    FROM (
      SELECT
        s.criado_em,
        jsonb_build_object(
          'id', s.id,
          'empresa_id', s.empresa_id,
          'empresa_nome', e.nome,
          'loja_slug', l.loja_slug,
          'categoria', s.categoria,
          'titulo', s.titulo,
          'descricao', s.descricao,
          'fotos', CASE
            WHEN jsonb_typeof(s.dados->'fotos') = 'array' THEN s.dados->'fotos'
            ELSE '[]'::jsonb
          END,
          'status', s.status,
          'resposta_admin', s.resposta_admin,
          'criado_em', s.criado_em,
          'atualizado_em', s.atualizado_em
        ) AS chamado
      FROM public.empresa_portal_solicitacoes s
      JOIN public.empresas e ON e.id = s.empresa_id
      JOIN public.suporte_externo_lojas l
        ON l.empresa_id = s.empresa_id
       AND l.loja_slug = lower(trim(coalesce(s.dados->>'loja', '')))
       AND l.origem = coalesce(s.dados->>'origem', '')
      ORDER BY s.criado_em DESC
      LIMIT 250
    ) q;

  RETURN coalesce(v_chamados, '[]'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.suporte_externo_master_responder(
  p_chave text,
  p_id uuid,
  p_resposta text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_empresa_id uuid;
  v_resposta text := btrim(coalesce(p_resposta, ''));
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM public.suporte_externo_origens o
     WHERE o.ativo
       AND o.chave_hash = encode(sha256(convert_to(coalesce(p_chave, ''), 'UTF8')), 'hex')
  ) THEN
    RAISE EXCEPTION 'Chave de suporte inválida.' USING ERRCODE = '28000';
  END IF;

  IF char_length(v_resposta) < 1 OR char_length(v_resposta) > 4000 THEN
    RAISE EXCEPTION 'Escreva uma resposta de até 4000 caracteres.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.empresa_portal_solicitacoes s
     SET resposta_admin = v_resposta,
         status = 'aguardando_cliente',
         atualizado_em = now()
   WHERE s.id = p_id
     AND EXISTS (
       SELECT 1
         FROM public.suporte_externo_lojas l
        WHERE l.empresa_id = s.empresa_id
          AND l.loja_slug = lower(trim(coalesce(s.dados->>'loja', '')))
          AND l.origem = coalesce(s.dados->>'origem', '')
     )
   RETURNING s.empresa_id INTO v_empresa_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Chamado não encontrado.' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.empresa_portal_eventos (empresa_id, ator_user_id, tipo, descricao, metadata)
  VALUES (
    v_empresa_id,
    NULL,
    'suporte_resposta',
    'O suporte respondeu ao chamado.',
    jsonb_build_object('solicitacao_id', p_id, 'resposta', v_resposta)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'id', p_id,
    'status', 'aguardando_cliente',
    'resposta_admin', v_resposta
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.suporte_externo_master_listar(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.suporte_externo_master_responder(text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.suporte_externo_master_listar(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.suporte_externo_master_responder(text, uuid, text) TO anon, authenticated, service_role;
