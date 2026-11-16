/* =====================================================================
   CONFIGURAÇÃO DA ESCALA — é só este arquivo que você precisa editar.
   ===================================================================== */
window.ESCALA_CONFIG = {

  /* Textos do topo */
  titulo: "Escala do Turismo",
  subtitulo: "Carrossel e Chapéu Mexicano · Guarapuava",

  /* Supabase (Project Settings > API).
     Enquanto estiver vazio, o site abre em MODO TESTE: os dados ficam só
     no navegador de quem está usando. Preencha para ficar online. */
  supabaseUrl: "",   // ex.: "https://abcdefgh.supabase.co"
  supabaseKey: "",   // chave "publishable" ou "anon public" (nunca a secret/service_role)

  /* Período da escala (AAAA-MM-DD) */
  periodo: { inicio: "2026-11-20", fim: "2026-12-31" },

  /* Dias da semana que funcionam: 0 = domingo, 1 = segunda ... 6 = sábado */
  diasDaSemana: [0, 1, 2, 3, 4, 5, 6],

  /* Datas sem funcionamento dentro do período */
  diasFechados: [
    // "2026-12-25",
  ],

  /* Horários padrão (valem para todos os locais) */
  turnos: [
    { inicio: "14:00", fim: "17:00" },
    { inicio: "17:00", fim: "20:00" },
    { inicio: "20:00", fim: "23:00" },
  ],

  /* Locais / brinquedos.
     - id: nunca mude depois que a escala começar (é o que fica salvo no banco)
     - vagas: quantas pessoas por horário nesse local
     - turnos: opcional; se colocar, substitui os horários padrão só nesse local */
  locais: [
    { id: "carrossel",       nome: "Carrossel",       cor: "#C2410C", vagas: 1, icone: "carrossel" },
    { id: "chapeu-mexicano", nome: "Chapéu Mexicano", cor: "#0F766E", vagas: 1, icone: "chapeu" },
  ],

  /* "Estou no local" libera quantos minutos antes do turno começar.
     Se mudar aqui, mude também v_antecedencia no supabase/setup.sql. */
  checkinAntecedenciaMin: 60,

  /* Fuso de Guarapuava */
  fusoHorario: "-03:00",
};
