# Escala do Turismo — Carrossel e Chapéu Mexicano

Site para a equipe escolher dia e horário de trabalho, ver o que está livre e quem está em cada turno, e registrar presença com foto ("Estou no local"). Tudo atualiza em tempo real para quem estiver com o site aberto.

- **Escala**: dias em faixa no topo (com quantas vagas faltam), turnos de cada brinquedo, botão *Escolher* nos horários livres.
- **Visão geral**: tabela do período inteiro, busca por nome, botão de imprimir.
- **No local**: mural público com as fotos de presença. Link direto: `.../#no-local`.

Hospedagem: **GitHub Pages** (site) + **Supabase** (banco, fotos e tempo real), os dois no plano gratuito.

---

## 1. Testar antes de configurar

Abra o `index.html` no navegador. Sem Supabase configurado ele entra em **modo teste**: funciona igual, mas os dados ficam só naquele navegador. O PIN da coordenação no teste é `00000000`.

## 2. Criar o banco no Supabase

1. Entre em <https://supabase.com> com a conta do GitHub e crie um projeto (região **South America — São Paulo**).
2. No menu lateral, abra **SQL Editor → New query**, cole todo o arquivo `supabase/setup.sql` e clique em **Run**.
3. Ainda no SQL Editor, numa query nova, defina o PIN da coordenação (6 a 12 números):
   ```sql
   select public.definir_pin_admin('SEU_PIN_AQUI');
   ```
   **Não coloque esse PIN em nenhum arquivo do GitHub.** Para trocar, é só rodar de novo com outro número.
4. Em **Project Settings → API Keys** (ou **API**), copie:
   - a **Project URL** (`https://xxxx.supabase.co`)
   - a chave **publishable** (`sb_publishable_...`) ou, em projetos mais antigos, a **anon public**

   Nunca use a chave *secret* / *service_role* no site.

## 3. Configurar o site

Edite o `config.js`:

| Campo | O que é |
|---|---|
| `supabaseUrl`, `supabaseKey` | o que você copiou no passo anterior |
| `periodo` | primeiro e último dia da escala |
| `diasDaSemana` / `diasFechados` | dias que funcionam e datas sem expediente |
| `turnos` | horários padrão (pode passar da meia-noite, ex.: `22:00`–`02:00`) |
| `locais` | nome, cor, vagas por horário e, se quiser, turnos próprios de cada brinquedo |
| `checkinAntecedenciaMin` | quanto tempo antes do turno o "Estou no local" libera (se mudar, mude também `v_antecedencia` no `setup.sql` e rode o SQL de novo) |

> Não troque o `id` de um local depois que a escala começar: é ele que fica salvo no banco.

## 4. Publicar no GitHub Pages

1. Crie um repositório **público** no GitHub (ex.: `escala-turismo`).
2. **Add file → Upload files** e arraste todos os arquivos desta pasta (incluindo a pasta `supabase`). Commit.
3. **Settings → Pages → Build and deployment**: *Deploy from a branch*, branch `main`, pasta `/ (root)`. Salve.
4. Em um ou dois minutos o site fica em `https://SEU-USUARIO.github.io/escala-turismo/`.

A chave publishable fica visível no `config.js`, e isso é esperado: ela só permite ler a escala e chamar as funções do banco, que conferem o PIN antes de gravar qualquer coisa.

---

## Como a equipe usa

1. Abre o site, escolhe o dia e toca em **Escolher** num horário livre.
2. Digita o nome e cria um **PIN de 4 números** (pode ser o mesmo em todos os turnos).
3. Para trocar ou cancelar: toca no próprio nome → **Editar** ou **Cancelar turno** → PIN.
4. No dia, a partir de 1 hora antes do turno até o fim dele, aparece o botão **Estou no local**: tira a foto, digita o PIN e registra. A foto sai com nome, local, data e hora carimbados, e o horário oficial é o do servidor.

### Regras automáticas

- Horário lotado não aceita mais ninguém (mesmo se duas pessoas tentarem ao mesmo tempo).
- A mesma pessoa não pode estar em dois lugares no mesmo horário.
- 5 PINs errados seguidos bloqueiam aquele turno por 10 minutos.
- Depois que o turno começa, ou depois do registro de presença, só a **coordenação** troca ou cancela.

### Coordenação

O PIN da coordenação funciona em qualquer campo de PIN: edita e cancela qualquer turno a qualquer momento, e registra presença fora do horário (ex.: celular da pessoa sem bateria).

Para apagar uma foto ou exportar a escala em planilha: Supabase → **Table Editor** → tabela `escalas` ou `checkins` → *Export to CSV*. As fotos ficam em **Storage → checkins**.

## Bom saber

- **Plano grátis do Supabase**: 1 GB para fotos (cada registro usa cerca de 0,3 MB) e 5 GB de tráfego por mês. O projeto **pausa depois de 1 semana sem nenhum acesso**. Se acontecer, entre no painel do Supabase e clique em *Restore*.
- **Tudo é público para quem tiver o link**: nomes na escala e fotos no mural. Combine isso com a equipe antes de divulgar.
- O nome digitado fica guardado no aparelho para destacar "Seus próximos turnos". O link *não é você?* limpa.

## Arquivos

```
index.html          estrutura da página
style.css           visual
app.js              funcionamento (Supabase + modo teste)
config.js           ← o que você edita
supabase/setup.sql  banco, regras e permissões (rodar no Supabase)
```
