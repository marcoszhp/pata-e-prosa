/* GitHub Pages has no PHP or MySQL runtime. This adapter provides only the
 * public fictitious catalog. It never saves credentials, users, orders or messages.
 * Cart IDs and quantities remain in the existing app's localStorage cart. */
'use strict';
(() => {
  const products = JSON.parse(document.getElementById('pages-products').textContent);
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
  const unavailable = 'Esta é uma vitrine no GitHub Pages. Para salvar contas, pedidos, mensagens e agendamentos, é necessário executar a versão PHP/MySQL em um servidor compatível.';
  const clone = value => JSON.parse(JSON.stringify(value));

  window.PataProsaPages = Object.freeze({
    async request(action, data, query = {}) {
      if (data !== undefined) throw new Error(unavailable);
      if (action === 'session') return {ok: true, user: null, csrf: '', configured: true, hosting: 'github-pages'};
      if (action === 'products') {
        const category = String(query.categoria || '');
        const term = normalize(query.q).trim();
        const filtered = products.filter(product =>
          (!category || category === 'todos' || category === String(product.categoria_id) || normalize(category) === normalize(product.categoria)) &&
          (!term || normalize(product.nome + ' ' + product.descricao).includes(term)));
        filtered.sort((a, b) => {
          if (['price_asc', 'preco_asc'].includes(query.sort)) return a.preco - b.preco || a.id - b.id;
          if (['price_desc', 'preco_desc'].includes(query.sort)) return b.preco - a.preco || a.id - b.id;
          if (['name', 'nome'].includes(query.sort)) return a.nome.localeCompare(b.nome, 'pt-BR');
          return b.destaque - a.destaque || a.id - b.id;
        });
        return {ok: true, products: clone(filtered)};
      }
      if (action === 'product') {
        const product = products.find(item => item.id === Number(query.id));
        if (!product) throw new Error('Esse mimo não foi encontrado. Explore nosso catálogo para escolher outro.');
        return {ok: true, product: clone(product)};
      }
      throw new Error(unavailable);
    },
    showAccountNotice() {
      // Account markup is replaced at build time, so credentials cannot be entered even without JavaScript.
    },
    showFormNotice() {
      // Controls are disabled at build time. The button only explains the limitation.
      document.querySelectorAll('[data-pages-unavailable]').forEach(button => {
        button.addEventListener('click', () => {
          const feedback = button.closest('form').querySelector('.form-feedback');
          feedback.textContent = unavailable;
          feedback.tabIndex = -1;
          feedback.focus({preventScroll: true});
        });
      });
    },
    showCheckoutNotice() {
      const root = document.getElementById('checkout-content');
      root.innerHTML = '<div class="empty-state pages-checkout"><svg class="icon" aria-hidden="true"><use href="#i-paw"/></svg><span class="eyebrow">SUA SACOLA CONTINUA COM VOCÊ</span><h2>Uma prévia cheia de mimos.</h2><p>Nesta vitrine do GitHub Pages, você pode explorar os produtos e montar sua sacola. A confirmação do pedido e a área do cliente estão disponíveis na versão PHP/MySQL.</p><div class="notice">Nenhum pedido foi criado e nenhum pagamento será solicitado.</div><a class="btn btn-primary" href="carrinho.html">Voltar para minha sacola</a><a class="text-link" href="catalogo.html">Escolher mais mimos</a></div>';
    }
  });
  // Defense in depth: no form other than the public product search transmits data on Pages.
  document.addEventListener('submit', event => {
    if (event.target.matches('form:not(.header-search)')) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
})();
