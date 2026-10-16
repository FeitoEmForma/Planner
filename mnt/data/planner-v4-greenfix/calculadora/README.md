# Feito em Forma — Calculadora & Orçamentos 3D

Site estático para precificar impressões 3D, calcular lucro e montar propostas que podem ser enviadas pelo WhatsApp. Adaptado e ampliado a partir do HTML original fornecido pelo proprietário da Feito em Forma. Interface renovada com base no segundo exemplo fornecido, com cartões azul-marinho, destaque laranja e campos numéricos em amarelo-claro. Usa a logomarca FeitoEmForma com o slogan original fornecida em arquivos anteriores.

## Funcionalidades

- Custos de filamento (padrão ou específico por peça), perdas, energia, depreciação, mão de obra, embalagem e acessórios.
- Venda direta ou marketplace (comissão percentual e taxa fixa por **unidade**).
- Meta de **margem sobre o preço de venda**, não markup sobre custo.
- Preço sugerido arredondado para cima em centavos, preço manual, alertas de margem e simulação mensal.
- Orçamento com vários produtos, quantidades, descontos, frete cobrado e custo interno do frete.
- Prévia comercial sem revelar custos, lucros nem margens.
- Mensagem pronta para WhatsApp, cópia de texto e impressão/salvamento em PDF pelo navegador.
- Número estável por proposta e botão **Novo orçamento** que preserva o histórico.
- Histórico e rascunho salvos **somente no navegador atual** (`localStorage`); exportação de backup Excel (.xlsx) com todos os campos e importação XLSX ou JSON anterior.
- Layout responsivo para celular e computador, com logo real também na proposta imprimível.
- Prévia atualizada do texto que será enviado ao WhatsApp, sem exibir dados internos de custos e lucros.

## Publicação gratuita no GitHub Pages

1. Crie um repositório no GitHub (por exemplo, `calculadora-feito-em-forma`).
2. Envie o conteúdo desta pasta para a raiz do repositório: `index.html`, `assets/`, `README.md` e `.nojekyll`.
3. Vá em **Settings → Pages → Build and deployment**.
4. Escolha **Deploy from a branch**, branch **main**, diretório **/(root)** e clique em **Save**.
5. Abra o endereço disponibilizado pelo GitHub Pages (geralmente `https://SEU-USUARIO.github.io/calculadora-feito-em-forma/`).

Também é possível abrir `index.html` localmente para usar a calculadora, embora alguns recursos do navegador, como copiar com um clique, funcionem melhor pelo site HTTPS publicado.

## Como enviar orçamento pelo WhatsApp

1. Em **Calculadora**, escolha **Venda direta / WhatsApp** ou **Marketplace**, configure uma peça e clique em **Adicionar ao orçamento**. Repita para incluir várias peças. O modo inicial é Marketplace para preservar o seu script original.
2. Em **Orçamento**, informe o cliente, condições e valores.
3. Se souber o número do cliente, preencha o celular com DDD. Sem número, o link abre o fluxo de seleção de conversa do WhatsApp; se esse fluxo não aparecer em seu dispositivo, use **Copiar mensagem** e cole na conversa pelo WhatsApp Business.
4. Clique em **Enviar pelo WhatsApp**, confira o destinatário e pressione enviar no aplicativo.

**Importante:** o site **não envia mensagens automaticamente** e não pode forçar a abertura da versão Business se o dispositivo tiver mais de um WhatsApp. Ele abre o WhatsApp com a mensagem preparada para envio manual. O link privado `wa.me/message/...` da empresa serve para clientes iniciarem contato com a Feito em Forma, mas não é apropriado para enviar propostas **aos clientes**; por isso o aplicativo usa o telefone do destinatário ou seleção manual.

## Privacidade e persistência

O site não armazena seus orçamentos em servidor próprio; quando você abre o WhatsApp, o texto da proposta é entregue ao WhatsApp para preenchimento da conversa. O histórico é gravado no armazenamento local do navegador, não sincroniza computadores e pode sumir se você apagar os dados do site, usar navegação anônima ou trocar de aparelho. Use **Histórico → Exportar backup** regularmente e guarde o XLSX com segurança, pois ele contém nomes e números de clientes. **Não publique** backups no repositório do GitHub nem compartilhe este site como painel público com dados de clientes.

## Fórmula de preço

```text
material = (peso em g ÷ 1000) × custo/kg × (1 + perdas%)
energia = horas de impressão × (consumo W ÷ 1000) × tarifa/kWh
produção = material + energia + manutenção + mão de obra + embalagem + extras
preço sugerido = (produção + taxa fixa por unidade) ÷ (1 − comissão% − margem%)
lucro/unidade = preço − produção − (preço × comissão%) − taxa fixa
margem real = lucro ÷ preço × 100
```

No orçamento, descontos reduzem a receita e a comissão percentual é recalculada sobre o preço descontado. Frete cobrado entra na receita e custo real do frete entra nos custos. A fórmula não considera automaticamente impostos específicos, custo financeiro ou frete não informado; preencha taxas e despesas aplicáveis antes de fechar o preço.

## Estrutura de arquivos

```text
index.html
assets/css/styles.css
assets/css/redesign.css
assets/js/app.js
assets/img/logo-feito-em-forma.png
assets/img/favicon.png
.nojekyll
README.md
```

Não necessita de framework, build nem chave de API.

Crédito do código-base original fornecido: **Gabriel Santos**.

## Identidade visual

A pasta `assets/img/` inclui a imagem original da logomarca da Feito em Forma (versão com o slogan «Feito em Forma, Feito para lembrar»), recortada apenas para retirar margens brancas excessivas. O ícone da aba é um recorte do símbolo original, não uma marca desenhada novamente.

## Histórico e backup (.xlsx)

- Na aba **Histórico**, altere o status de cada proposta; o status é salvo automaticamente no navegador.
- **Exportar backup (.xlsx)** gera as abas **Orçamentos** (dados comerciais, status, datas, custos totais, faturamento e lucro) e **Itens e custos** (todos os itens, insumos, parâmetros e gastos detalhados disponíveis).
- **Importar backup** aceita um XLSX gerado pelo próprio site e continua aceitando arquivos JSON de versões anteriores.
- Orçamentos antigos mantêm os dados realmente registrados à época; gastos que não eram salvos separadamente ficam em branco na planilha, sem estimativas inventadas.
- Nunca publique a planilha com dados internos e contatos de clientes em um repositório público.
