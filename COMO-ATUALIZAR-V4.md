# Feito em Forma — Planner 4.0 com Calculadora e Envio de Orçamento

Esta atualização integra ao Planner online a calculadora de precificação 3D enviada pelo proprietário. **Ela usa o seu projeto Supabase atual; não crie outro projeto.**

## Antes de atualizar

1. Entre no Planner que já está funcionando e clique em **Backup JSON (restaurável)**. Guarde o arquivo fora do GitHub.
2. Confirme que a versão 3.0 está funcionando, inclusive **custo de fabricação por peça**. Se ainda não estiver, execute primeiro `ATUALIZAR-BANCO-V3.sql` no Supabase.
3. Mantenha uma cópia dos arquivos atuais do GitHub por segurança.

## Passo 1 — atualizar seu banco existente

1. Abra [Supabase](https://supabase.com/dashboard), seu projeto da Feito em Forma, **SQL Editor**.
2. Abra o arquivo `ATUALIZAR-BANCO-V4.sql` incluído no ZIP. Copie todo o texto e execute-o.
3. Você deve ver o campo `calculator_data` na linha de resultado. Se o editor mostrar **Success, no rows returned**, confira em **Table Editor → quotes** a nova coluna ou execute a consulta final do script separadamente.
4. O comando é repetível (`IF NOT EXISTS`) e **não apaga registros nem interfere nas políticas RLS**.

## Passo 2 — atualizar o GitHub Pages

1. Extraia `Feito-em-Forma-Planner-v4-Calculadora-Integrada.zip`.
2. No repositório **que já hospeda seu Planner**, envie para a **raiz** os arquivos `index.html`, `app.js`, `style.css`, `service-worker.js` e a nova pasta `calculadora/` com suas subpastas `assets/`. Substitua os arquivos correspondentes quando o GitHub perguntar. Os demais arquivos do ZIP são manuais e scripts SQL.
3. **NÃO apague, edite ou substitua seu `config.js`** atual. O ZIP NÃO inclui esse arquivo de credenciais publicáveis; a conexão que já funciona fica preservada.
4. Confira se no GitHub existe `calculadora/index.html` e `calculadora/assets/js/app.js`. É importante manter exatamente essa estrutura.
5. Aguarde o GitHub Pages atualizar, abra seu site e recarregue a página com `Ctrl + Shift + R` (no celular, reabra a página ou limpe apenas o cache do site, sem apagar os dados da conta).

### Estrutura dos arquivos publicados

```text
index.html
app.js
style.css
service-worker.js
config.js                    <-- JÁ EXISTE NO GITHUB, NÃO SUBSTITUIR
manifest.webmanifest
icone.svg
icone-192.png
icone-512.png
calculadora/
    index.html
    assets/
        css/
            styles.css
            redesign.css
            embedded.css
        js/
            app.js
        img/
            logo-feito-em-forma.png
            favicon.png
```

## Passo 3 — como usar

1. Entre com o login de sempre. No menu **ESPAÇO DE TRABALHO**, clique **Envio de orçamento**.
2. Na seção **Calculadora**, informe o nome da peça, filamento, peso, tempo, embalagem, canal e margem. Clique **Adicionar ao orçamento**; repita para cada peça diferente.
3. Na seção **Orçamento**, informe o **nome do cliente** e, se possível, o WhatsApp. Defina desconto, frete, prazo e pagamento.
4. Clique **Salvar no Planner (nuvem)** para registrar na etapa **Orçamentos a fazer**. O mesmo número de proposta é atualizado se você salvar outra vez.
5. Clique **Enviar pelo WhatsApp**: primeiro o sistema aguarda a confirmação de gravação no Supabase, depois abre a conversa com a proposta comercial preenchida. **Você ainda precisa enviar a mensagem pelo WhatsApp**.
6. Depois de enviar de fato, clique **Confirmar envio e marcar como enviado**. O pedido passará à etapa **Enviado ao cliente**, salvo se já tiver uma etapa mais avançada.
7. Acesse **Quadro de pedidos** ou **Todos os orçamentos** para acompanhar sua proposta. Ao abrir uma proposta criada pela calculadora, clique **Editar na calculadora** para retomar todos os itens e recalcular.

## Como funcionam os valores

- **Bruto:** total cobrado do cliente, após desconto e incluindo frete cobrado.
- **Custo total:** fabricação de todas as peças, comissões/taxas e custo real do frete informado na calculadora.
- **Líquido estimado:** bruto menos custo total (inclui eventuais despesas da calculadora, mas não inclui impostos ou despesas que você não informou).
- Propostas com várias peças mantêm **totais exatos** no Planner mesmo quando o valor médio por peça não tem centavos exatos. O campo de preço unitário no formulário do Planner será um **valor médio aproximado**; para atualizar os números, utilize **Editar na calculadora**.
- No Excel financeiro agora existe a aba **Itens Calculadora**, com detalhes por peça além do quadro financeiro existente. O backup **JSON** continua sendo a forma adequada de preservar e restaurar o detalhamento completo.

## Atenção

- Nunca publique planilhas com clientes ou custos internos em repositório público.
- Nunca coloque a chave `service_role`, chaves `secret` ou senhas no `config.js`.
- Esta atualização não importa automaticamente as propostas do histórico LOCAL da antiga calculadora; os pedidos novos salvos dentro do Planner são registrados na nuvem.
- Você não precisa criar contas novas nem modificar a URL/chave pública do Supabase.
- Se aparecer erro dizendo que falta `calculator_data`, execute `ATUALIZAR-BANCO-V4.sql` e recarregue o site.
- Não altere manualmente no GitHub os scripts do banco após executá-los no Supabase; o GitHub Pages não executa SQL.
