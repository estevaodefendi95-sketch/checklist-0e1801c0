import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autenticado." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Client autenticado como quem chamou, só pra confirmar identidade e perfil
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user: caller },
      error: callerError,
    } = await callerClient.auth.getUser();

    if (callerError || !caller) {
      return new Response(JSON.stringify({ error: "Sessão inválida." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Client com service role pra checar o perfil do chamador (bypassa RLS) e criar o novo usuário
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: callerProfile, error: profileError } = await adminClient
      .schema("checklist")
      .from("profiles")
      .select("role, is_master")
      .eq("id", caller.id)
      .single();

    if (profileError || !callerProfile || !callerProfile.is_master) {
      return new Response(
        JSON.stringify({ error: "Apenas o administrador master pode criar usuários." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { email, password, nome, role, areas_permitidas } = body ?? {};

    if (!email || !password || !nome || !role) {
      return new Response(
        JSON.stringify({ error: "Campos obrigatórios: email, password, nome, role." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!["admin", "editor", "visualizador"].includes(role)) {
      return new Response(JSON.stringify({ error: "Perfil inválido." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nome },
    });

    if (createError || !created.user) {
      return new Response(
        JSON.stringify({ error: createError?.message ?? "Falha ao criar usuário." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // O trigger on_auth_user_created_checklist já cria o profile como 'visualizador'.
    // Atualizamos aqui com o role e as áreas escolhidas pelo admin.
    const { error: updateError } = await adminClient
      .schema("checklist")
      .from("profiles")
      .update({
        nome,
        role,
        areas_permitidas: role === "admin" ? [] : areas_permitidas ?? [],
      })
      .eq("id", created.user.id);

    if (updateError) {
      return new Response(JSON.stringify({ error: updateError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ id: created.user.id, email, nome, role }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
