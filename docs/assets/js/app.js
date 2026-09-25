/* Pata & Prosa — vanilla JavaScript. Cart stores only IDs and quantities.
 * All prices, stock, discounts and orders are validated again by PHP/MySQL.
 * Replace the commented placeholder URLs in includes/demo-products.html / sql/schema.sql
 * with licensed product photographs when preparing a real catalog. */
'use strict';
(() => {
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const ico = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const money = n => new Intl.NumberFormat('pt-BR', {style:'currency',currency:'BRL'}).format(Number(n));
  const cents = n => Math.round(Number(n) * 100);
  const page = document.body.dataset.page;
  const params = new URLSearchParams(location.search);
  const storageKey = 'pata-prosa-cart-v1';
  const state = {user:null,csrf:'',configured:true,products:[],cart:[],coupon:'',canUseCoupon:false};
  let cartStorageAvailable = true;
  let catalogRequest = 0;
  const safeImage = url => /^\.\/assets\/images\/[a-zA-Z0-9._-]+$/.test(url) || /^https:\/\//.test(url) ? esc(url) : './assets/images/food-salmon.svg';

  function readCart() {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || '[]');
      if (!Array.isArray(stored)) return [];
      const merged = new Map();
      stored.slice(0,100).forEach(item => {
        if (Number.isInteger(item?.id) && item.id > 0 && Number.isInteger(item?.quantidade) && item.quantidade > 0) {
          merged.set(item.id, Math.min(99, (merged.get(item.id) || 0) + item.quantidade));
        }
      });
      return [...merged].map(([id,quantidade]) => ({id,quantidade}));
    } catch { cartStorageAvailable = false; return []; }
  }
  function saveCart() {
    try { localStorage.setItem(storageKey,JSON.stringify(state.cart)); }
    catch { cartStorageAvailable = false; }
    updateCartCount();
  }
  function updateCartCount() {
    const count = state.cart.reduce((sum,item) => sum + item.quantidade, 0);
    $$('[data-cart-count]').forEach(el => el.textContent = count);
    $('.cart-link')?.setAttribute('aria-label',`Ver carrinho, ${count} itens`);
  }
  function updateUser() {
    const label = $('[data-user-label]');
    if (label) label.textContent = state.user ? `Olá, ${state.user.nome.split(' ')[0]}` : 'Entre ou cadastre-se';
  }
  async function api(action, data, query = {}) {
    if (window.PataProsaPages) return window.PataProsaPages.request(action, data, query);
    const url = new URL('api.html',location.href);
    url.search = new URLSearchParams({action,...query}).toString();
    let response, result;
    try {
      response = await fetch(url,{method:data ? 'POST' : 'GET',credentials:'same-origin',headers:data ? {'Content-Type':'application/json','X-CSRF-Token':state.csrf} : {},body:data ? JSON.stringify(data) : undefined});
      result = await response.json();
    } catch { throw new Error('Não conseguimos conversar com a loja. Verifique sua conexão e tente novamente.'); }
    if (result.csrf) state.csrf = result.csrf;
    if (!response.ok || !result.ok) {
      const error = new Error(result.message || 'Não foi possível concluir. Tente novamente.');
      error.fields = result.errors || {};
      error.status = response.status;
      if (response.status === 419) { try { const fresh = await api('session'); state.csrf = fresh.csrf; } catch {} }
      throw error;
    }
    return result;
  }
  function toast(message, error = false, cartLink = false) {
    const el = document.createElement('div');
    el.className = `toast${error ? ' error' : ''}`;
    el.innerHTML = `${ico(error ? 'close' : 'check')}<span>${esc(message)}</span>${cartLink ? '<a href="carrinho.html">Ver sacola</a>' : ''}<button aria-label="Fechar mensagem">${ico('close')}</button>`;
    $('#toasts').append(el);
    $('button',el).onclick = () => el.remove();
    setTimeout(() => el.remove(), 6500);
  }
  function dialog(title,message) {
    $('#confirm-title').textContent = title;
    $('#confirm-message').textContent = message;
    $('#confirm-dialog').showModal();
  }
  function empty(title,description,href='catalogo.html',cta='Explorar os produtos') {
    return `<div class="empty-state">${ico('paw')}<h2>${esc(title)}</h2><p>${esc(description)}</p><a class="btn btn-primary" href="${href}">${esc(cta)} ${ico('arrow')}</a></div>`;
  }
  function formError(form,error) {
    const target = $('.form-feedback',form);
    if (target) {
      target.className = 'form-feedback';
      const details = Object.values(error.fields || {}).join(' ');
      target.textContent = details || error.message;
      target.setAttribute('tabindex','-1'); target.focus({preventScroll:true});
    } else toast(error.message,true);
    $$('[aria-invalid]',form).forEach(el=>el.removeAttribute('aria-invalid'));
    Object.keys(error.fields || {}).forEach(key => { const input = form.elements.namedItem(key); if (input instanceof HTMLElement) input.setAttribute('aria-invalid','true'); });
  }
  function bindForm(id,handler) {
    const form = $(id); if (!form) return;
    form.addEventListener('submit',async event => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const button = $('button[type="submit"]',form);
      if (button.disabled) return;
      const text = button.innerHTML;
      button.disabled = true; button.textContent = 'Só um instante…';
      const feedback = $('.form-feedback',form); if (feedback) feedback.textContent = '';
      try { await handler(Object.fromEntries(new FormData(form)), form); }
      catch(error) { formError(form,error); }
      finally { button.disabled = false; button.innerHTML = text; }
    });
  }
  function demoNotice(target) {
    if (!state.configured && $(target)) $(target).innerHTML = '<div class="notice">Você está explorando a vitrine de demonstração. Para salvar cadastros, pedidos e agendamentos, configure o banco conforme o README do projeto.</div>';
  }
  function loginNotice(target,description='Entre na sua conta para confirmar este cuidado.') {
    if (!state.user && $(target)) $(target).innerHTML = `<div class="notice">${esc(description)} <a href="login.html?next=${page === 'checkout' ? 'checkout.html' : 'agendamento.html'}">Entrar ou criar conta</a></div>`;
  }
  function productCard(product) {
    const discount = product.preco_anterior && product.preco_anterior > product.preco ? Math.round((1-product.preco/product.preco_anterior)*100) : 0;
    return `<article class="product-card"><a class="product-image" href="produto.html?id=${product.id}" aria-label="Ver ${esc(product.nome)}">${discount ? `<span class="product-badge sale">${discount}% OFF</span>` : '<span class="product-badge">ESCOLHIDO COM CARINHO</span>'}<img src="${safeImage(product.imagem_url)}" alt="${esc(product.nome)} — imagem ilustrativa" loading="lazy" width="280" height="280"></a><div class="product-content"><span class="product-category">${esc(product.categoria)}</span><h3><a href="produto.html?id=${product.id}">${esc(product.nome)}</a></h3><div class="product-price"><b>${money(product.preco)}</b>${product.preco_anterior ? `<del>${money(product.preco_anterior)}</del>` : ''}</div><small class="installments">Um mimo que vale cada carinho.</small><button class="btn add-cart" data-add="${product.id}" ${product.estoque < 1 ? 'disabled' : ''}>${ico('bag')} ${product.estoque > 0 ? 'Adicionar à sacola' : 'Esgotado'}</button></div></article>`;
  }
  function addToCart(id,quantity=1) {
    const product = state.products.find(p=>p.id===id);
    if (!product) return toast('Não encontramos esse mimo. Atualize a página.',true);
    const existing = state.cart.find(item=>item.id===id);
    if ((existing?.quantidade || 0) + quantity > Math.min(99,product.estoque)) return toast(`Temos ${product.estoque} unidades desse mimo em estoque.`,true);
    if (existing) existing.quantidade += quantity;
    else state.cart.push({id,quantidade:quantity});
    saveCart();
    if (!cartStorageAvailable) toast('Seu navegador bloqueou o armazenamento. Permita os dados deste site para manter a sacola.',true);
    else toast('Um novo mimo na sua sacola!',false,true);
  }
  function cartProducts() { return state.cart.map(item=>({...item,product:state.products.find(p=>p.id===item.id)})).filter(item=>item.product); }
  function totals() {
    const subtotal = cartProducts().reduce((sum,item)=>sum + cents(item.product.preco)*item.quantidade,0);
    const discount = state.coupon ? Math.round(subtotal*.1) : 0;
    const shipping = subtotal===0 || subtotal-discount>=14900 ? 0 : 1490;
    return {subtotal,discount,shipping,total:subtotal-discount+shipping};
  }
  function summaryLines() {
    const t = totals();
    return `<div class="summary-line"><span>Produtos</span><strong>${money(t.subtotal/100)}</strong></div>${t.discount ? `<div class="summary-line"><span>Seu primeiro mimo (10%)</span><strong>− ${money(t.discount/100)}</strong></div>` : ''}<div class="summary-line"><span>Entrega</span><strong>${t.shipping ? money(t.shipping/100) : 'Grátis'}</strong></div><div class="summary-line total"><span>Total</span><strong>${money(t.total/100)}</strong></div>`;
  }
  function quantityControl(id,count,max) {
    return `<div class="quantity-control"><button data-qty="${id}" data-delta="-1" aria-label="Diminuir quantidade" ${count<=1?'disabled':''}>−</button><output aria-label="Quantidade">${count}</output><button data-qty="${id}" data-delta="1" aria-label="Aumentar quantidade" ${count>=Math.min(max,99)?'disabled':''}>+</button></div>`;
  }
  function renderCart() {
    const items = cartProducts(); const root = $('#cart-content');
    if (!items.length) { root.innerHTML=empty('Sua sacola está esperando um mimo.','Que tal descobrir o próximo favorito do seu melhor amigo?'); return; }
    const t = totals();
    const remaining = Math.max(0,14900-t.subtotal);
    root.innerHTML = `<div class="cart-layout"><div>${items.map(item=>`<article class="cart-row"><img src="${safeImage(item.product.imagem_url)}" alt="${esc(item.product.nome)}"><div><h3><a href="produto.html?id=${item.id}">${esc(item.product.nome)}</a></h3><small>${esc(item.product.categoria)} · ${money(item.product.preco)} / unidade</small>${quantityControl(item.id,item.quantidade,item.product.estoque)}</div><div class="cart-row-price"><strong>${money(item.quantidade*item.product.preco)}</strong><button class="remove-item" data-remove="${item.id}">Remover</button></div></article>`).join('')}<a class="text-link continue-shopping" href="catalogo.html">Escolher mais mimos ${ico('arrow')}</a></div><aside class="order-summary"><h2>Uma sacola de felicidade.</h2><div class="shipping-progress"><span style="width:${Math.min(100,t.subtotal/14900*100)}%"></span></div><p class="shipping-text">${remaining ? `Faltam ${money(remaining/100)} para o frete grátis.` : 'Oba! Seu pedido ganhou frete grátis.'}</p>${summaryLines()}<a class="btn btn-primary" href="checkout.html">Continuar para finalizar ${ico('arrow')}</a><small>${ico('shield')} Finalização simulada. Nenhuma cobrança real.</small><small>Tem um cupom? Use na próxima etapa.</small></aside></div>`;
  }
  async function renderCatalog() {
    const request = ++catalogRequest;
    const root = $('#catalog-products');
    const category = params.get('categoria') || '';
    const q = (params.get('q') || '').trim();
    const sort = params.get('sort') || 'featured';
    $$('.filter-chip').forEach(el=>{el.classList.toggle('active',el.dataset.category===category); el.setAttribute('aria-pressed',String(el.dataset.category===category));});
    $('#product-sort').value = sort;
    $('#search').value = q;
    $('#clear-search').classList.toggle('hidden',!q && !category);
    const products = (await api('products',undefined,{categoria:category,q,sort:sort==='name'?'nome':sort})).products;
    if (request !== catalogRequest) return;
    $('#product-count').textContent = `${products.length} ${products.length===1?'mimo encontrado':'mimos encontrados'}${q ? ` para “${q}”` : ''}`;
    root.innerHTML = products.length ? products.map(productCard).join('') : empty('Ainda não encontramos esse mimo.','Tente outro nome ou explore todas as categorias.','catalogo.html','Ver todos os produtos');
  }
  function updateCatalogParam(key,value) {
    if (value) params.set(key,value); else params.delete(key);
    history.replaceState(null,'',`${location.pathname}${params.size?'?'+params:''}`);
    renderCatalog().catch(error=>toast(error.message,true));
  }
  async function renderProduct() {
    const root = $('#product-detail');
    try {
      const product = (await api('product',undefined,{id:params.get('id') || ''})).product;
      $('#product-breadcrumb').textContent = product.nome;
      document.title = `${product.nome} · Pata & Prosa`;
      root.innerHTML = `<div class="product-detail-grid"><div class="product-detail-image"><img src="${safeImage(product.imagem_url)}" alt="${esc(product.nome)} — embalagem ilustrativa" width="500" height="500"></div><div class="product-info"><a class="eyebrow" href="catalogo.html?categoria=${product.categoria_id}">${esc(product.categoria)}</a><h1>${esc(product.nome)}</h1><span class="status-pill">ESCOLHIDO COM CARINHO</span><div class="product-price"><b>${money(product.preco)}</b>${product.preco_anterior ? `<del>${money(product.preco_anterior)}</del>` : ''}</div><p class="product-description">${esc(product.descricao)}</p><p class="stock">${ico('check')} ${product.estoque>0 ? `${product.estoque} unidades prontinhas para o seu pet` : 'Esse mimo está esgotado no momento'}</p><div class="buy-row">${quantityControl('detail',1,product.estoque)}<button class="btn btn-primary" id="buy-product" data-id="${product.id}" ${product.estoque<1?'disabled':''}>${ico('bag')} Adicionar à sacola</button></div><div class="product-promises"><span>${ico('truck')} Frete grátis a partir de R$ 149 após descontos</span><span>${ico('heart')} Produtos selecionados para quem é família</span><span>${ico('shield')} Compra demonstrativa, sem cobrança real</span></div><div class="details-block"><h3>Um cuidado a mais</h3><p>Confira a descrição e o tamanho antes de escolher. As imagens e os produtos desta loja são ilustrativos. Precisa de ajuda? <a class="text-link" href="contato.html?assunto=Produtos">Converse com a gente</a>.</p></div></div></div>`;
      let quantity=1;
      root.addEventListener('click',event=>{
        const qty=event.target.closest('[data-qty="detail"]');
        if (qty) { quantity=Math.max(1,Math.min(product.estoque,99,quantity+Number(qty.dataset.delta))); const control=qty.closest('.quantity-control'); $('output',control).textContent=quantity; $('[data-delta="-1"]',control).disabled=quantity<=1; $('[data-delta="1"]',control).disabled=quantity>=Math.min(99,product.estoque); }
        if (event.target.closest('#buy-product')) addToCart(product.id,quantity);
      });
    } catch(error) { root.innerHTML=empty('Esse mimo não foi encontrado.',error.message); }
  }
  function authTab(name,focus=false) {
    $$('[data-auth-tab]').forEach(button=>{ const active=button.dataset.authTab===name; button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1; if (active&&focus) button.focus(); });
    $('#login-panel').hidden=name!=='login'; $('#register-panel').hidden=name!=='register';
  }
  function setupAuth() {
    const next = ['conta.html','checkout.html','agendamento.html'].includes(params.get('next')) ? params.get('next') : 'conta.html';
    if (state.user) { location.replace(next); return; }
    demoNotice('#auth-notice');
    authTab(params.has('cadastro')?'register':'login');
    $$('[data-auth-tab]').forEach(button=>{
      button.onclick=()=>authTab(button.dataset.authTab);
      button.onkeydown=event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();authTab(button.dataset.authTab==='login'?'register':'login',true);}};
    });
    $$('.password-toggle').forEach(button=>button.onclick=()=>{const input=$('input',button.parentElement);const show=input.type==='password';input.type=show?'text':'password';button.textContent=show?'Ocultar':'Mostrar';button.setAttribute('aria-label',show?'Ocultar senha':'Mostrar senha');});
    const password=$('#register-form [name="senha"]');
    password.addEventListener('input',()=>{const value=password.value;const score=[value.length>=8,/[A-Z]/.test(value),/[a-z]/.test(value),/\d/.test(value),/[^A-Za-z0-9\s]/.test(value)].filter(Boolean).length;$('.password-strength span').style.width=`${score*20}%`;$('.password-strength span').style.background=score===5?'#659348':'#ed8a46';});
    ['login','register'].forEach(action=>bindForm(`#${action}-form`,async data=>{const result=await api(action,data);state.user=result.user;updateUser();location.assign(next);}));
  }
  function dateLabel(date,withTime=false) {
    const parsed = new Date(String(date).replace(' ','T'));
    if (Number.isNaN(parsed.valueOf())) return 'Data indisponível';
    return parsed.toLocaleString('pt-BR',withTime ? {day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'} : {day:'2-digit',month:'short',year:'numeric'});
  }
  async function renderAccount() {
    if (!state.user) { location.replace('login.html?next=conta.html'); return; }
    const data=await api('account');state.user=data.user;
    $('#account-greeting').textContent=`Que bom te ver, ${state.user.nome.split(' ')[0]}.`;
    $('#account-content').innerHTML=`<div class="account-layout"><aside class="account-sidebar"><a href="#pedidos">${ico('bag')} Meus pedidos</a><a href="#agendamentos">${ico('calendar')} Meus agendamentos</a><a href="#dados">${ico('user')} Meus dados</a><button id="logout-button">${ico('arrow')} Sair da conta</button></aside><div class="account-sections"><section class="panel" id="pedidos"><h2>Seus mimos, suas histórias.</h2>${data.orders.length ? data.orders.map(order=>`<article class="order-card"><div class="order-head"><div><b>Pedido #${String(order.id).padStart(5,'0')}</b><small>${dateLabel(order.data)}</small></div><span class="status-pill">${esc(order.status)}</span></div><ul class="order-items">${order.items.map(item=>`<li><span>${item.quantidade} × ${esc(item.nome)}</span><span>${money(item.quantidade*item.preco_unitario)}</span></li>`).join('')}</ul><div class="order-total">Total ${money(order.total)}</div></article>`).join('') : '<p class="small-empty">Seu primeiro mimo está esperando. <a href="catalogo.html">Explore a loja.</a></p>'}</section><section class="panel" id="agendamentos"><h2>Próximos encontros de carinho.</h2>${data.appointments.length ? data.appointments.map(item=>`<article class="order-card"><div class="order-head"><div><b>${esc(item.servico)} · ${esc(item.pet_nome)}</b><small>${dateLabel(item.data_hora,true)}</small></div><span class="status-pill">${esc(item.status)}</span></div></article>`).join('') : '<p class="small-empty">Nenhum cuidado agendado por enquanto. <a href="agendamento.html">Vamos marcar?</a></p>'}</section><section class="panel" id="dados"><h2>Seu jeito de fazer parte.</h2><form id="profile-form" class="form-stack"><label>Nome completo<input name="nome" autocomplete="name" required minlength="3" maxlength="100" value="${esc(state.user.nome)}"></label><label>E-mail<input type="email" value="${esc(state.user.email)}" disabled><small>Seu e-mail identifica sua conta e não pode ser alterado aqui.</small></label><label>Telefone<input name="telefone" type="tel" autocomplete="tel" maxlength="20" value="${esc(state.user.telefone)}"></label><label>Endereço completo<textarea name="endereco" rows="3" autocomplete="street-address" maxlength="1000" placeholder="Rua, número, complemento, bairro, cidade, estado e CEP">${esc(state.user.endereco)}</textarea></label><p class="form-feedback" role="status"></p><button type="submit" class="btn btn-primary">Salvar meus dados ${ico('check')}</button></form></section></div></div>`;
    bindForm('#profile-form',async(data,form)=>{const result=await api('profile',data);state.user=result.user;updateUser();$('.form-feedback',form).className='form-feedback success';$('.form-feedback',form).textContent=result.message;$('#account-greeting').textContent=`Que bom te ver, ${state.user.nome.split(' ')[0]}.`;});
    $('#logout-button').onclick=async()=>{try{await api('logout',{});state.user=null;location.assign('index.html');}catch(error){toast(error.message,true);}};
    if (['#pedidos','#agendamentos','#dados'].includes(location.hash)) $(location.hash)?.scrollIntoView();
  }
  function setupBooking() {
    const today=new Date();
    const localDate=date=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
    const last=new Date(today);last.setDate(last.getDate()+90);
    const input=$('#booking-form [name="data"]');input.min=localDate(today);input.max=localDate(last);
    loginNotice('#booking-notice');demoNotice('#booking-notice');
    bindForm('#booking-form',async(data,form)=>{
      if(!state.user){location.assign('login.html?next=agendamento.html');return;}
      const chosen=new Date(`${data.data}T${data.hora}:00`);
      if(chosen.getDay()===0) throw new Error('Aos domingos descansamos as patinhas. Escolha um dia de segunda a sábado.');
      if(chosen<=new Date()) throw new Error('Esse horário já passou. Escolha um horário futuro.');
      const result=await api('appointment',{servico:data.servico,pet_nome:data.pet_nome,data_hora:`${data.data}T${data.hora}`,observacoes:data.observacoes});
      form.reset();dialog('Um encontro marcado com o carinho.',`${result.appointment.pet_nome} tem ${result.appointment.servico.toLowerCase()} em ${dateLabel(result.appointment.data_hora,true)}. Você pode consultar os detalhes na sua conta.`);
    });
  }
  function setupContact() {
    if(state.user){$('#contact-form [name="nome"]').value=state.user.nome;$('#contact-form [name="email"]').value=state.user.email;}
    if(params.has('assunto')) $('#contact-form [name="assunto"]').value=params.get('assunto');
    bindForm('#contact-form',async(data,form)=>{const result=await api('contact',data);form.reset();dialog('Recado recebido com carinho.',result.message);});
  }
  function showOrderSuccess(root,order,purchasedItems) {
    // A recovered confirmation must not discard mimos added after that attempt.
    const purchased=new Map((purchasedItems||[]).map(item=>[item.id,item.quantidade]));
    state.cart=state.cart.map(item=>({...item,quantidade:Math.max(0,item.quantidade-(purchased.get(item.id)||0))})).filter(item=>item.quantidade>0);
    state.coupon='';saveCart();try{sessionStorage.removeItem('pata-prosa-order');}catch{}
    root.innerHTML=`<div class="checkout-success">${ico('paw')}<span class="eyebrow">MAIS UMA HISTÓRIA BOA PARA CONTAR</span><h2>Pedido feito.<br>Rabinho em festa!</h2><p>Seu pedido <strong>#${String(order.id).padStart(5,'0')}</strong> foi salvo com carinho.<br>Total: <strong>${money(order.total)}</strong>.<br>Esta foi uma simulação. Nenhum pagamento foi cobrado.</p><a class="btn btn-primary" href="conta.html#pedidos">Acompanhar meus pedidos ${ico('arrow')}</a><a class="btn btn-outline" href="catalogo.html">Escolher mais mimos</a></div>`;
    root.scrollIntoView({behavior:'smooth',block:'start'});
  }
  async function renderCheckout() {
    const root=$('#checkout-content');
    if(!state.user){root.innerHTML=empty('Seu mimo merece um endereço certo.','Entre ou crie sua conta para acompanhar o pedido. Sua sacola fica guardada aqui.','login.html?next=checkout.html','Entrar para continuar');return;}
    const account=await api('account');state.canUseCoupon=account.orders.length===0;
    let previousAttempt;
    try { previousAttempt=JSON.parse(sessionStorage.getItem('pata-prosa-order')||'null'); } catch {}
    if(previousAttempt?.userId===state.user.id){
      const registered=account.orders.find(order=>order.request_id===previousAttempt.key);
      if(registered){showOrderSuccess(root,registered,previousAttempt.payload?.items);return;}
      // The server returned no matching order: restore the draft for a safe retry.
      if(previousAttempt.payload){
        state.coupon=state.canUseCoupon&&previousAttempt.payload.cupom==='PRIMEIROPASSEIO'?'PRIMEIROPASSEIO':'';
      }
    }
    if(!cartProducts().length){root.innerHTML=empty('Primeiro, escolha um pouquinho de carinho.','Sua sacola ainda está vazia. Temos muitos mimos esperando.');return;}
    root.innerHTML=`<div class="checkout-layout"><div><form id="checkout-form" class="form-stack" style="margin-top:0"><section class="panel"><h2>1. Onde o carinho vai chegar?</h2><p>${esc(state.user.nome)} · ${esc(state.user.email)}</p><label style="display:block;margin-top:20px">Endereço completo<textarea name="endereco" autocomplete="street-address" rows="3" minlength="10" maxlength="1000" required placeholder="Rua, número, complemento, bairro, cidade, estado e CEP">${esc(state.user.endereco)}</textarea></label></section><section class="panel"><h2>2. Como prefere pagar?</h2><div class="notice">Esta é uma compra simulada. Nenhum valor será cobrado e não pedimos dados financeiros.</div><label class="payment-option"><input type="radio" name="forma_pagamento" value="pix" checked><span>Pix<small>Simulação, sem QR code ou transferência</small></span></label><label class="payment-option"><input type="radio" name="forma_pagamento" value="cartao"><span>Cartão de crédito<small>Simulação, sem solicitar número do cartão</small></span></label><label class="payment-option"><input type="radio" name="forma_pagamento" value="boleto"><span>Boleto bancário<small>Simulação, sem emissão de boleto</small></span></label></section><p class="form-feedback" role="status"></p><button type="submit" class="btn btn-primary">Confirmar pedido simulado ${ico('check')}</button><a class="text-link" href="carrinho.html">Voltar para minha sacola</a></form></div><aside class="order-summary"><h2>Seus mimos escolhidos.</h2>${cartProducts().map(item=>`<div class="summary-product"><img src="${safeImage(item.product.imagem_url)}" alt=""><div><p>${esc(item.product.nome)}</p><small>${item.quantidade} × ${money(item.product.preco)}</small></div></div>`).join('')}<form class="coupon-row" id="coupon-form"><label class="sr-only" for="coupon-input">Cupom de desconto</label><input id="coupon-input" placeholder="Seu cupom de carinho" maxlength="30" autocomplete="off"><button type="submit">Aplicar</button></form><p class="coupon-status" id="coupon-status" role="status"></p><div id="checkout-totals">${summaryLines()}</div><small>${ico('shield')} Os valores são conferidos pela loja antes de confirmar.</small></aside></div>`;
    if(previousAttempt?.userId===state.user.id&&previousAttempt.payload){
      $('#checkout-form [name="endereco"]').value=previousAttempt.payload.endereco||state.user.endereco||'';
      const payment=previousAttempt.payload.forma_pagamento;
      if(['pix','cartao','boleto'].includes(payment)) $(`#checkout-form [value="${payment}"]`).checked=true;
      $('#coupon-input').value=state.coupon;
      if(state.coupon) $('#coupon-status').textContent='Seu desconto foi restaurado para continuar a compra.';
    }
    $('#coupon-form').onsubmit=event=>{event.preventDefault();const code=$('#coupon-input').value.trim().toUpperCase();const feedback=$('#coupon-status');if(!code){state.coupon='';feedback.textContent='Cupom removido.';}else if(code!=='PRIMEIROPASSEIO'){feedback.textContent='Esse cupom não foi encontrado.';return;}else if(!state.canUseCoupon){feedback.textContent='Este cupom é exclusivo para o primeiro pedido.';return;}else{state.coupon=code;feedback.textContent='Oba! 10% de desconto aplicado aos produtos.';}$('#checkout-totals').innerHTML=summaryLines();};
    bindForm('#checkout-form',async data=>{
      const payload={items:state.cart.map(item=>({id:item.id,quantidade:item.quantidade})),endereco:data.endereco,forma_pagamento:data.forma_pagamento,cupom:state.coupon};
      // A stable key makes a retry safe after a network interruption or page reload.
      const signature=JSON.stringify({...payload,userId:state.user.id});let pending;
      try{pending=JSON.parse(sessionStorage.getItem('pata-prosa-order')||'null');}catch{}
      if(pending?.userId===state.user.id){
        // Resolve a lost response before allowing edits to start a new order.
        const latest=await api('account');
        const registered=latest.orders.find(order=>order.request_id===pending.key);
        if(registered){showOrderSuccess(root,registered,pending.payload?.items);return;}
      }
      if(!pending||pending.signature!==signature){
        const key=typeof crypto.randomUUID==='function'?crypto.randomUUID():Array.from(crypto.getRandomValues(new Uint8Array(24)),byte=>byte.toString(16).padStart(2,'0')).join('');
        pending={signature,key,userId:state.user.id,payload};try{sessionStorage.setItem('pata-prosa-order',JSON.stringify(pending));}catch{}
      }
      const result=await api('checkout',{...payload,request_id:pending.key});
      showOrderSuccess(root,result.order,payload.items);
    });
  }

  // Shared interactions use delegation, so dynamically loaded product cards work too.
  document.addEventListener('click',event=>{
    const add=event.target.closest('[data-add]');if(add&&!add.disabled)addToCart(Number(add.dataset.add));
    const remove=event.target.closest('[data-remove]');if(remove){state.cart=state.cart.filter(item=>item.id!==Number(remove.dataset.remove));saveCart();renderCart();toast('Mimo removido da sacola.');}
    const qty=event.target.closest('[data-qty]');if(qty&&qty.dataset.qty!=='detail'){const item=state.cart.find(item=>item.id===Number(qty.dataset.qty));const product=state.products.find(p=>p.id===item?.id);if(item&&product){item.quantidade=Math.max(1,Math.min(99,product.estoque,item.quantidade+Number(qty.dataset.delta)));saveCart();renderCart();}}
    const copy=event.target.closest('[data-copy]');if(copy){navigator.clipboard?.writeText(copy.dataset.copy).then(()=>toast('Cupom copiado! Use na sua primeira compra.')).catch(()=>toast('Use o cupom PRIMEIROPASSEIO no checkout.'));if(!navigator.clipboard)toast('Use o cupom PRIMEIROPASSEIO no checkout.');}
  });
  $('.menu-toggle')?.addEventListener('click',()=>{const open=$('#main-nav').classList.toggle('open');$('.menu-toggle').setAttribute('aria-expanded',String(open));$('.menu-toggle').setAttribute('aria-label',open?'Fechar menu':'Abrir menu');});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){$('#main-nav').classList.remove('open');$('.menu-toggle')?.setAttribute('aria-expanded','false');}});
  $('.gif-pause')?.addEventListener('click',event=>{const button=event.currentTarget;const paused=button.getAttribute('aria-pressed')==='true';$('.hero-gif-card img').src=`./assets/images/hero-dog${paused?'.gif':'-poster.jpg'}`;button.setAttribute('aria-pressed',String(!paused));button.setAttribute('aria-label',paused?'Pausar animação do cachorro':'Reproduzir animação do cachorro');button.textContent=paused?'Ⅱ':'▷';});
  window.addEventListener('storage',event=>{if(event.key===storageKey){state.cart=readCart();updateCartCount();if(page==='cart')renderCart();if(page==='checkout')location.reload();}});

  async function init() {
    state.cart=readCart();updateCartCount();
    const wantsProducts=['home','catalog','product','cart','checkout'].includes(page);
    const [sessionResult,productResult]=await Promise.allSettled([api('session'),wantsProducts?api('products'):Promise.resolve({products:[]})]);
    if(sessionResult.status==='fulfilled')Object.assign(state,sessionResult.value);
    else if(['auth','account','booking','checkout','contact'].includes(page))throw sessionResult.reason;
    updateUser();
    if(productResult.status==='fulfilled')state.products=productResult.value.products;
    else throw productResult.reason;
    if(wantsProducts){
      let adjusted=false;
      state.cart=state.cart.map(item=>{const product=state.products.find(p=>p.id===item.id);const quantity=Math.min(item.quantidade,product?.estoque||0);if(quantity!==item.quantidade)adjusted=true;return{...item,quantidade:quantity};}).filter(item=>item.quantidade>0);
      saveCart();if(adjusted)toast('Atualizamos as quantidades da sacola conforme o estoque atual.');
    }
    if(page==='home')$('#featured-products').innerHTML=state.products.filter(product=>product.destaque).slice(0,4).map(productCard).join('');
    if(page==='catalog'){
      $$('.filter-chip').forEach(button=>button.onclick=()=>updateCatalogParam('categoria',button.dataset.category));
      $('#product-sort').onchange=event=>updateCatalogParam('sort',event.target.value);
      $('#clear-search').onclick=()=>{params.delete('q');params.delete('categoria');updateCatalogParam('sort',params.get('sort')||'');};
      await renderCatalog();
    }
    if(page==='product')await renderProduct();
    if(page==='cart')renderCart();
    if(page==='auth')window.PataProsaPages.showAccountNotice();
    if(page==='account')await renderAccount();
    if(page==='booking')window.PataProsaPages.showFormNotice();
    if(page==='contact')window.PataProsaPages.showFormNotice();
    if(page==='checkout')window.PataProsaPages.showCheckoutNotice();
  }
  init().catch(error=>{
    toast(error.message,true);
    const root=$('#featured-products,#catalog-products,#product-detail,#cart-content,#account-content,#checkout-content');
    if(root)root.innerHTML=empty('Vamos tentar de novo?',error.message,esc(location.pathname),'Atualizar a página');
    // Never leave an unbound form able to submit credentials in a URL after startup failure.
    $$('form:not(.header-search)').forEach(form=>{form.addEventListener('submit',event=>{event.preventDefault();toast('Recarregue a página para restabelecer sua conexão com a loja.',true);});});
  });
})();
