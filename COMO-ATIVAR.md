# Feito em Forma — Planner Studio v12

Esta atualização mantém os pedidos, a Calculadora, os Indicadores, o Financeiro e o Estoque. O acesso é feito exclusivamente com login. O menu de Catálogo e a entrada de visitante foram removidos. Os produtos cadastrados continuam guardados no Supabase para que possam ser reaproveitados no Estoque e na Calculadora.

## Publicar a atualização

1. Faça uma cópia de segurança da versão atual do site e dos dados importantes.
2. Descompacte o ZIP. Publique **o conteúdo de `Planner-main`** na raiz do repositório GitHub Pages (onde fica `index.html`).
3. Mantenha o seu `config.js` com as credenciais publicáveis do mesmo projeto Supabase; **não publique senhas ou chave `service_role`**.
4. Caso ainda não tenha executado a atualização da versão 11, abra o SQL Editor do Supabase e execute `ATIVAR-MODULOS-STUDIO.sql`. É seguro repetir: o script adiciona as tabelas e colunas necessárias **sem apagar orçamentos ou produtos já cadastrados**. Para falhas antigas da calculadora, execute `CORRIGIR-CALCULADORA-LOGIN.sql`.
5. Depois do deploy, recarregue a página. O cache do aplicativo é atualizado automaticamente para v12.

## Todos os orçamentos: filtrar e baixar

1. Acesse **Todos os orçamentos** no menu.
2. Use a busca, a prioridade, o prazo e **Todas as etapas → Finalizado**, conforme necessário.
3. Opcionalmente, escolha o **mês de finalização** que aparece após selecionar a etapa Finalizado. Sem mês definido, o filtro mostra todos os finalizados, independentemente do mês.
4. Clique em **Extrair filtrados (.xlsx)**. A planilha conterá **somente os pedidos mostrados após a combinação dos filtros** (com abas Orçamentos, Resumo Financeiro, Por Etapa e Itens Calculadora).
5. O botão **Backup financeiro Excel (.xlsx)** do menu continua exportando **todos os orçamentos**, sem considerar filtros.

O mês de finalização é calculado pela última entrada na etapa Finalizado no histórico do pedido; se não houver esse histórico, utiliza a data de última atualização. Não substitui conciliação contábil.

## Estoque: selecionar produtos salvos

1. Abra **Estoque → + Cadastrar item**.
2. No campo **Selecionar um produto já cadastrado**, selecione um item salvo anteriormente na Calculadora ou no Quadro de Pedidos. O nome, o tipo e o material são aproveitados; ajuste a quantidade real e os custos antes de salvar.
3. Se o produto já estiver no estoque, o formulário abre o registro existente para edição, evitando duplicações.
4. Para cadastrar um insumo ou peça nova que não exista na lista, deixe **Novo item / preenchimento manual** e preencha os campos.
5. Produtos vinculados sincronizam a **quantidade** com o cadastro usado pela Calculadora. O sistema não subtrai automaticamente a quantidade quando um pedido é finalizado.

**Importante:** o Catálogo não aparece mais como módulo do Planner, mas a tabela interna `studio_products` **não deve ser apagada**. Ela continua armazenando os produtos anteriores e permite a seleção no Estoque.

## Financeiro e Indicadores

- O Financeiro lê os dados dos pedidos diretamente da tabela `quotes`, mostra bruto, custo, lucro estimado, recebido e a receber, além dos lançamentos de caixa.
- Indicadores mostram os gráficos de evolução mensal de pedidos finalizados, margem estimada e distribuição por etapa.
- Os cálculos de lucro dependem dos custos registrados; não representam lucro contábil líquido de impostos ou despesas não lançadas.

## Verificações rápidas

- Entre com sua conta e confirme que não há botão de visitante, nem aba Catálogo.
- Confira o filtro de Finalizado e um mês específico; exporte o Excel e compare o número de linhas com a lista filtrada.
- Abra o Estoque, selecione um produto antigo, preencha a quantidade e salve; verifique o vínculo ao reabrir.
- Confira o Financeiro e os Indicadores sem criar pedidos duplicados.
- No celular, use **☰** para abrir o menu completo. Os atalhos da barra inferior incluem Pedidos, Calcular, Financeiro e Estoque.

A exportação Excel é realizada no navegador e depende do carregamento da biblioteca ExcelJS; requer conexão quando a biblioteca não está em cache. Não publique planilhas com dados de clientes no repositório público.
