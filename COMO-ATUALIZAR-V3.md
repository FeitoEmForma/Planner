# Feito em Forma — Planner Online v3.0
## Atualização do sistema que você JÁ está usando no GitHub Pages

**Não precisa recriar o Supabase, redefinir login nem apagar nenhum orçamento.**

### Etapa 0 — Proteja os dados existentes
1. Entre na versão atual do Planner.
2. Clique em **Backup JSON (ou Fazer backup, na versão antiga)** e guarde o arquivo `.json` antes da mudança.
3. Confira que o arquivo foi baixado. O backup JSON serve para restaurar os dados no app; o Excel é para acompanhamento financeiro e também pode ser importado na v3.

### Etapa 1 — Atualize o banco (obrigatório antes de usar a v3)
1. Acesse o **mesmo projeto Supabase** que o Planner já utiliza.
2. Abra **SQL Editor > New query**.
3. Cole TODO o conteúdo de `ATUALIZAR-BANCO-V3.sql`.
4. Clique em **Run**. O resultado exibirá a coluna `unit_cost` do tipo `numeric`.
5. Os orçamentos existentes são preservados. Todos começam com `unit_cost = 0` até você editar cada um.

**Importante:** você deve executar `ATUALIZAR-BANCO-V3.sql`, e NÃO recriar as tabelas ou trocar de projeto. Se a nova versão for publicada antes do SQL, o banco não reconhecerá `unit_cost` e o Planner poderá dar erro ao salvar.

### Etapa 2 — Atualize os arquivos no GitHub Pages
1. Extraia o ZIP da v3.
2. No repositório GitHub que JÁ hospeda o Planner, atualize/substitua os arquivos `index.html`, `app.js`, `style.css`, `service-worker.js` e os demais arquivos do pacote.
3. **NÃO apague, substitua ou edite o seu `config.js` atual.** Esse arquivo contém a URL e a chave pública já conectadas ao SEU projeto Supabase. Por segurança, ele não está dentro do ZIP de atualização.
4. Salve/commit no GitHub e aguarde a publicação do Pages.
5. Abra o mesmo endereço público de sempre e pressione `Ctrl + Shift + R`. Se o navegador mostrar a versão antiga, feche as abas do Planner, espere um minuto e abra novamente.

### Etapa 3 — Use os novos campos financeiros
No cadastro de um orçamento, preencha:
- **Quantidade**
- **Preço de venda unitário:** o que o cliente paga por peça
- **Custo de fabricação por peça:** seu custo de material, energia, embalagem etc., conforme queira descontar

O sistema calcula automaticamente:
- **Bruto** = quantidade × preço de venda unitário
- **Custo total** = quantidade × custo por peça
- **Líquido estimado** = bruto − custo total
- **Margem sobre a venda** = líquido ÷ bruto × 100 (quando bruto > 0)

**Exemplo:** 10 chaveiros, R$ 12,50 por unidade, custo R$ 4,20 por unidade → bruto **R$ 125,00**, custo **R$ 42,00**, líquido estimado **R$ 83,00**, margem **66,4%**.

`Líquido estimado` é lucro bruto menos o custo de fabricação informado, não é o valor já recebido em dinheiro. Fretes, impostos, comissões e taxas não informados no custo não são descontados.

### Etapa 4 — Baixe o backup financeiro XLSX
1. Entre no Planner com seu login de sempre.
2. No menu lateral, clique em **Backup financeiro Excel (.xlsx)**.
3. Baixe `feito-em-forma-backup-financeiro-AAAA-MM-DD.xlsx`.
4. Abra no Excel ou programa compatível. As abas são **Orcamentos**, **Resumo Financeiro**, **Por Etapa**, **LEIA-ME**.
5. A aba de orçamentos inclui filtros, datas, bruto, custo, líquido e margem. Os cálculos são fórmulas do Excel.

**Para restaurar de uma planilha v3:** clique em **Importar dados**, selecione o `.xlsx` exportado. Os pedidos que já existem com o mesmo ID serão ignorados, nunca substituídos. O Excel e o JSON contêm dados de clientes: guarde com cuidado.

### Se aparecer erro
- **Falta atualizar o banco / `unit_cost`**: execute `ATUALIZAR-BANCO-V3.sql` no projeto correto.
- **Sem conexão**: confirme o Supabase e a conexão à internet; não altere seu `config.js`.
- **Excel não baixa**: verifique se a internet permite carregar a biblioteca ExcelJS do CDN `cdn.jsdelivr.net` e atualize a página.
- **Página antiga**: atualize forçadamente o navegador; o Service Worker mudou de versão para recarregar o site.
- **Orçamentos antigos não apareceram**: verifique se entrou no mesmo login, e só então restaure o JSON caso necessário.

---

Feito em Forma — Feito para lembrar.
