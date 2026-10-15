# Planner Feito em Forma 4.0 — calculadora e envio de orçamento

Esta versão une o quadro Kanban de orçamentos online ao sistema de precificação de impressão 3D e propostas para WhatsApp fornecido pelo proprietário.

**Leia `COMO-ATUALIZAR-V4.md` antes de publicar.** Para atualizar um Planner já em funcionamento, mantenha o seu `config.js` e execute `ATUALIZAR-BANCO-V4.sql` no Supabase. Não recrie a tabela `quotes`.

O Planner contém o submenu **Envio de orçamento**. A calculadora permite montar propostas de vários itens, mostrar os custos por peça e imprimir ou preparar a mensagem comercial no WhatsApp. Ao pressionar **Salvar no Planner (nuvem)**, o orçamento entra no quadro de pedidos e é sincronizado no Supabase. As propostas salvas podem ser reabertas na calculadora pelo próprio Planner.

O botão WhatsApp prepara a mensagem e exige envio manual no app. Salvar e abrir o WhatsApp não significa que o cliente recebeu a proposta; o botão **Confirmar envio e marcar como enviado** atualiza essa etapa quando a mensagem já foi enviada.

O cálculo do líquido desconta os custos registrados na calculadora, que incluem fabricação, taxa de venda e custo real do frete informado. Custos e lucros ficam internos, não são enviados pelo WhatsApp. O backup JSON preserva o detalhamento completo; o Excel financeiro tem uma aba adicional **Itens Calculadora**.

Sem build ou bundler. Hospedagem: GitHub Pages. Autenticação e banco: Supabase com Row Level Security pré-existente.
