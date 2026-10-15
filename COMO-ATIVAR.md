# Feito em Forma — Planner Online (v3)

Aplicativo web para acompanhar orçamentos e pedidos usando o mesmo login no celular e no computador.

## 1. Criar o banco de dados

1. Abra <https://supabase.com/dashboard>, crie sua conta e depois um **New project**.
2. Selecione a região do banco, crie uma senha forte para o banco e **guarde-a fora do site**.
3. No painel do projeto, entre em **SQL Editor**, crie uma consulta e cole TODO o conteúdo de `BANCO-DE-DADOS.sql`.
4. Clique em **Run**. O script cria a tabela de orçamentos, regras de acesso por usuário e ativa eventos de sincronização.
5. Em **Authentication > Providers**, mantenha o login por e-mail habilitado. No primeiro uso, o botão *Criar conta* permite cadastrar seu e-mail. Se for uso individual, você pode depois desativar novos cadastros nas configurações de Authentication, mantendo a conta existente.

## 2. Conectar o aplicativo

1. No Supabase, localize **Project URL** e **Publishable key** (às vezes aparecem em *Project Settings > API Keys* ou *Connect*).
2. **Instalação nova:** copie `config.exemplo.js` para um arquivo chamado `config.js` e preencha os dois valores abaixo. **Site existente:** mantenha seu `config.js` já conectado, sem alterações:

```js
window.FEITO_SUPABASE = {
  url: 'https://SEU-PROJETO.supabase.co',
  publishableKey: 'COLE_SUA_CHAVE_PUBLICAVEL_AQUI'
};
```

3. **Só use uma chave publicável/anon do Supabase.** É normal ela aparecer no código do navegador; a segurança dos orçamentos depende das regras RLS no banco.
4. **NUNCA** publique a `service_role`, uma *secret key*, a senha do banco, tokens pessoais ou qualquer chave privada.

## 3. Publicar no GitHub Pages

1. Extraia o arquivo ZIP desta entrega.
2. Crie um repositório no GitHub e envie para a **raiz** todos os arquivos da pasta, incluindo `index.html`, `app.js`, `style.css`, `service-worker.js` e o arquivo `config.js` que você criou/que já usa no site.
3. Em **Settings > Pages**, selecione **Deploy from a branch**, `main`, `/ (root)` e salve.
4. Aguarde o GitHub mostrar a URL do seu site, por exemplo `https://seuusuario.github.io/planner/`.
5. Volte ao Supabase, entre em **Authentication > URL Configuration** e configure:
   - **Site URL:** URL exata do seu GitHub Pages, incluindo o caminho do repositório, caso exista.
   - **Redirect URLs:** adicione esta mesma URL (e a URL final com `/` se houver diferença).
6. Abra o site publicado e clique em **Criar conta**. Confirme o e-mail se o seu projeto exigir.
7. Entre com o mesmo e-mail e a mesma senha no computador e no celular. Os pedidos aparecerão nos dois.

## 4. Importar os pedidos da versão anterior

- Se usar o endereço antigo no mesmo navegador, o programa tentará detectar os orçamentos guardados localmente e mostrará o botão **Importar para a nuvem**. Isso **não exclui os originais**.
- Se trocou o endereço ou dispositivo, na versão anterior clique em **Fazer backup**, baixe o arquivo JSON; depois clique em **Importar dados** na versão online.
- Também é possível importar CSV. As importações **adicionam** os registros sem apagar os pedidos já existentes.
- Se uma importação for interrompida, alguns lotes podem ter sido inseridos. Reabra e confira a lista antes de importar novamente.

## 5. Segurança, sincronização e limites

- Cada conta tem dados separados (por regras RLS no PostgreSQL). **Contas diferentes não compartilham o mesmo Kanban.** Para ver os mesmos pedidos, entre com o MESMO login em todos os aparelhos.
- O site exibe dados da nuvem; o GitHub hospeda apenas os arquivos do sistema. Dados de clientes e orçamentos ficam no seu projeto Supabase.
- As alterações precisam de internet. No modo offline, é possível que a interface abra com um quadro vazio, mas **nenhum pedido será salvo offline**.
- As atualizações chegam automaticamente com o Realtime; se o canal não estiver disponível, o aplicativo verifica novamente ao voltar para a aba e periodicamente, enquanto estiver aberto.
- Se duas pessoas alterarem o mesmo pedido ao mesmo tempo, o sistema procura impedir sobrescrita silenciosa e pede para atualizar.
- O backup por JSON continua disponível e é recomendado. O aplicativo não faz cópias automáticas fora da infraestrutura do Supabase.
- O plano gratuito do Supabase pode ter limites, pausa por inatividade e mudanças de preço. Consulte os detalhes do seu projeto.
- Contas e projetos criados diretamente no Supabase são necessários para a ativação; os arquivos entregues aqui não contêm credenciais nem um banco já hospedado.

## 6. Problemas comuns

- **Tela de configuração:** confira o arquivo `config.js` e se publicou a versão atualizada.
- **Tabela não encontrada / acesso negado:** execute o arquivo SQL inteiro e confira as políticas RLS.
- **E-mail de confirmação não chega:** confira o spam e a configuração de Auth/SMTP no Supabase. O envio padrão pode ter limites.
- **Link de recuperação não abre o site:** confira Site URL e Redirect URLs em Supabase Authentication.
- **Não sincroniza no segundo aparelho:** confira se ambos estão com o mesmo login, internet e se o Realtime foi habilitado para a tabela `quotes`.
- **Arquivo aberto como `file:///`:** publique no GitHub Pages ou utilize um servidor local como `python -m http.server 8000`. Links de autenticação funcionam melhor em HTTPS num site real.

**Feito em Forma — Feito para lembrar.**


## 7. Atualizar do Planner Online v2 para v3 (bruto, custo e líquido + Excel)

Se o site já funciona, não reinstale. Leia **COMO-ATUALIZAR-V3.md**.

- Execute **ATUALIZAR-BANCO-V3.sql** no Supabase existente.
- Publique os novos arquivos no GitHub **sem substituir o `config.js` existente**.
- O backup financeiro em XLSX pode ser exportado, aberto no Excel e importado novamente.
- A versão v3 utiliza a biblioteca ExcelJS em CDN para gerar/ler XLSX; a internet é necessária.
