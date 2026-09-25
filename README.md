# Pata & Prosa — petshop

**[Visite o site](https://marcoszhp.github.io/pata-e-prosa/)**

Petshop fictício com identidade visual própria, catálogo, filtros, páginas de produtos, carrinho e apresentação dos serviços. Layout responsivo, fontes locais, animação de cachorro e produtos ilustrados.

## Demonstração online

A pasta `docs` contém a versão estática publicada no GitHub Pages. O catálogo e o carrinho funcionam no navegador. Login, cadastro, pedidos, agendamento e envio de mensagens dependem do servidor PHP/MySQL e estão identificados como indisponíveis nesta demonstração. Não há cobrança nem processamento de pagamentos.

## Código completo PHP + MySQL

Baixe **[Pata-e-Prosa-Completo.zip](Pata-e-Prosa-Completo.zip)** e extraia a pasta `petshop`. O pacote contém os fontes organizados em `public`, `includes`, `assets`, `sql`, `scripts` e `tests`, incluindo:

- Cadastro/login com senha criptografada, sessões e proteção CSRF.
- Catálogo, carrinho, checkout simulado, histórico e edição dos dados.
- Agendamento de banho, tosa e consulta e formulário de contato.
- `sql/schema.sql` com tabelas MySQL e produtos fictícios.
- `README.md` com instalação no XAMPP/WAMP e configuração da conexão.
- Exportador `scripts/build-pages.php` para regenerar a demonstração.

O pacote não inclui credenciais, configurações locais ou banco com dados pessoais. Os nomes, preços, depoimentos e informações da loja são fictícios.

## Instalação local

1. Extraia `petshop` em `C:\xampp\htdocs` ou `C:\wamp64\www`.
2. Inicie Apache e MySQL e importe `petshop/sql/schema.sql` no phpMyAdmin.
3. Copie `includes/config.example.php` para `includes/config.local.php` e configure seu banco.
4. Abra `http://localhost/petshop/public/`.

As instruções detalhadas, validações e créditos das imagens e fontes acompanham o pacote.
