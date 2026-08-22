// ============================================================
  // Product chip input (shared logic for purchase form + new customer form)
  // ============================================================
  function setupChipInput(boxId, inputId, countId, maxItems = 10) {
    const box = document.getElementById(boxId);
    const input = document.getElementById(inputId);
    const countEl = document.getElementById(countId);
    let items = [];

    function render() {
      box.querySelectorAll('.chip').forEach(c => c.remove());
      items.forEach((item, idx) => {
        const chip = document.createElement('span');
        chip.className = 'chip';
        chip.innerHTML = `${item} <button type="button" data-idx="${idx}">×</button>`;
        box.insertBefore(chip, input);
      });
      countEl.textContent = uiLang === 'hi' ? `${items.length} / ${maxItems} सामान` : `${items.length} / ${maxItems} products`;
      input.disabled = items.length >= maxItems;
      input.placeholder = items.length >= maxItems
        ? (uiLang === 'hi' ? 'सीमा पूरी हो गई' : 'Limit reached')
        : (uiLang === 'hi' ? 'सामान लिखें, Enter दबाएं' : 'Type a product, press Enter');
    }

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const val = input.value.trim();
        if (val && items.length < maxItems && !items.includes(val)) {
          items.push(val);
          input.value = '';
          render();
        }
      }
    });

    box.addEventListener('click', (e) => {
      if (e.target.tagName === 'BUTTON') {
        items.splice(Number(e.target.dataset.idx), 1);
        render();
      }
    });

    render();
    return {
      getItems: () => items,
      reset: () => { items = []; input.value = ''; render(); },
    };
  }


  // ============================================================
  // Product catalog + purchase picker
  // ============================================================
  let shopProducts = [];      // cached catalog, refreshed on scan/customer view + Products page

  async function loadShopProducts() {
    try {
      const res = await fetch('/products');
      shopProducts = await res.json();
    } catch (err) {
      shopProducts = [];
    }
  }

  // Reusable picker factory — mounted once for the "add credit" panel and
  // once for the new-customer registration form, each with its own
  function createProductPicker(ids) {
    let cart = [];        // [{product_id, name, price, quantity}]
    let customItems = []; // [{name, price, quantity}]

    function render(filter = '') {
      const resultsEl = document.getElementById(ids.results);
      const q = filter.trim().toLowerCase();
      const matches = shopProducts.filter(p => p.name.toLowerCase().includes(q));

      if (!matches.length) {
        resultsEl.innerHTML = `<div style="padding:12px;font-size:12px;color:var(--ink-dim);">${uiLang === 'hi' ? 'कोई सामान नहीं मिला। पहले अपने उत्पाद जोड़ें।' : 'No products found. Add some from My Products first.'}</div>`;
        return;
      }

      resultsEl.innerHTML = matches.map(p => {
        const outOfStock = !p.in_stock;
        const stockBadge = outOfStock ? `<span class="product-stock-badge">${uiLang === 'hi' ? 'स्टॉक खत्म' : 'Out of stock'}</span>` : '';
        return `<div class="product-picker-item ${outOfStock ? 'disabled' : ''}" data-product-id="${p.id}">
          <span>${p.name}${stockBadge}</span>
          <span class="product-picker-price">${fmtMoney(p.price)}</span>
        </div>`;
      }).join('');

      resultsEl.querySelectorAll('.product-picker-item:not(.disabled)').forEach(el => {
        el.addEventListener('click', () => {
          const product = shopProducts.find(p => p.id === el.dataset.productId);
          if (!product) return;
          const existing = cart.find(c => c.product_id === product.id);
          if (existing) existing.quantity += 1;
          else cart.push({ product_id: product.id, name: product.name, price: product.price, quantity: 1 });
          renderCart();
        });
      });
    }

    function renderCart() {
      const cartEl = document.getElementById(ids.cart);
      const totalEl = document.getElementById(ids.total);
      let total = 0;
      const rows = [];

      cart.forEach((item, idx) => {
        const subtotal = item.price * item.quantity;
        total += subtotal;
        rows.push(`<div class="product-cart-item">
          <span class="product-cart-name">${item.name} × ${item.quantity}</span>
          <button type="button" class="product-cart-qty-btn" data-type="cart" data-idx="${idx}" data-delta="-1">−</button>
          <button type="button" class="product-cart-qty-btn" data-type="cart" data-idx="${idx}" data-delta="1">+</button>
          <span class="product-cart-subtotal">${fmtMoney(subtotal)}</span>
          <span class="product-cart-remove" data-type="cart-remove" data-idx="${idx}">×</span>
        </div>`);
      });
      customItems.forEach((item, idx) => {
        const subtotal = item.price * item.quantity;
        total += subtotal;
        rows.push(`<div class="product-cart-item">
          <span class="product-cart-name">${item.name} × ${item.quantity} <span style="color:var(--ink-dim);font-size:11px;">(${uiLang === 'hi' ? 'कस्टम' : 'custom'})</span></span>
          <button type="button" class="product-cart-qty-btn" data-type="custom" data-idx="${idx}" data-delta="-1">−</button>
          <button type="button" class="product-cart-qty-btn" data-type="custom" data-idx="${idx}" data-delta="1">+</button>
          <span class="product-cart-subtotal">${fmtMoney(subtotal)}</span>
          <span class="product-cart-remove" data-type="custom-remove" data-idx="${idx}">×</span>
        </div>`);
      });

      cartEl.innerHTML = rows.join('');
      totalEl.textContent = fmtMoney(total);

      cartEl.querySelectorAll('[data-type="cart"]').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = Number(btn.dataset.idx);
          cart[idx].quantity += Number(btn.dataset.delta);
          if (cart[idx].quantity <= 0) cart.splice(idx, 1);
          renderCart();
        });
      });
      cartEl.querySelectorAll('[data-type="custom"]').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = Number(btn.dataset.idx);
          customItems[idx].quantity += Number(btn.dataset.delta);
          if (customItems[idx].quantity <= 0) customItems.splice(idx, 1);
          renderCart();
        });
      });
      cartEl.querySelectorAll('[data-type="cart-remove"]').forEach(btn => {
        btn.addEventListener('click', () => { cart.splice(Number(btn.dataset.idx), 1); renderCart(); });
      });
      cartEl.querySelectorAll('[data-type="custom-remove"]').forEach(btn => {
        btn.addEventListener('click', () => { customItems.splice(Number(btn.dataset.idx), 1); renderCart(); });
      });
    }

    function reset() {
      cart = [];
      customItems = [];
      document.getElementById(ids.search).value = '';
      if (ids.customRow) document.getElementById(ids.customRow).classList.remove('open');
      if (ids.customName) document.getElementById(ids.customName).value = '';
      if (ids.customPrice) document.getElementById(ids.customPrice).value = '';
      render();
      renderCart();
    }

    document.getElementById(ids.search).addEventListener('input', (e) => render(e.target.value));

    if (ids.customToggle) {
      document.getElementById(ids.customToggle).addEventListener('click', () => {
        document.getElementById(ids.customRow).classList.toggle('open');
      });
      document.getElementById(ids.customAddBtn).addEventListener('click', () => {
        const name = document.getElementById(ids.customName).value.trim();
        const price = parseFloat(document.getElementById(ids.customPrice).value);
        if (!name || !price || price <= 0) return;
        customItems.push({ name, price, quantity: 1 });
        document.getElementById(ids.customName).value = '';
        document.getElementById(ids.customPrice).value = '';
        document.getElementById(ids.customRow).classList.remove('open');
        renderCart();
      });
    }

    return {
      render, renderCart, reset,
      isEmpty: () => cart.length === 0 && customItems.length === 0,
      getPayload: () => ({
        items: cart.map(c => ({ product_id: c.product_id, quantity: c.quantity })),
        custom_items: customItems.map(c => ({ name: c.name, price: c.price, quantity: c.quantity })),
      }),
    };
  }

  const purchasePicker = createProductPicker({
    search: 'purchasePickerSearch', results: 'purchasePickerResults',
    cart: 'purchaseCart', total: 'purchaseCartTotal',
    customToggle: 'showCustomItemBtn', customRow: 'customItemRow',
    customName: 'customItemName', customPrice: 'customItemPrice', customAddBtn: 'addCustomItemBtn',
  });

  const newCustomerPicker = createProductPicker({
    search: 'newCustomerPickerSearch', results: 'newCustomerPickerResults',
    cart: 'newCustomerCart', total: 'newCustomerCartTotal',
  });

  // ============================================================
  // Mobile number validation (max 10 digits, numeric only)
  // ============================================================
  const mobileInput = document.getElementById('mobileInput');
  const mobileHint = document.getElementById('mobileHint');
  mobileInput.addEventListener('input', () => {
    let digits = mobileInput.value.replace(/\D/g, '').slice(0, 10);
    mobileInput.value = digits;
    mobileHint.textContent = digits.length > 0 && digits.length < 10
      ? (uiLang === 'hi' ? `${digits.length}/10 अंक` : `${digits.length}/10 digits`)
      : '';
  });

  // ============================================================
  // Core app logic
  // ============================================================
  const video = document.getElementById('video');
  const canvas = document.getElementById('canvas');
  const scanBtn = document.getElementById('scanBtn');
  const statusLine = document.getElementById('statusLine');

  const views = {
    scan: document.getElementById('scanView'),
    customer: document.getElementById('customerView'),
    cleared: document.getElementById('clearedView'),
    newCustomer: document.getElementById('newCustomerView'),
    dashboard: document.getElementById('dashboardView'),
  };

  let lastPhotoBlob = null;
  let currentCustomerId = null;

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      video.srcObject = stream;
    } catch (err) {
      statusLine.textContent = "Couldn't access the camera.";
    }
  }

  let mainAppStarted = false;
  function initMainApp() {
    if (mainAppStarted) return; 
    mainAppStarted = true;
    startCamera();
    loadSummary();
    loadDueList();
    loadCreditLimit();
    loadShopProducts();
    loadRequestBadge();
    loadPaymentBadge();
    setInterval(loadRequestBadge, 25000); 
    setInterval(loadPaymentBadge, 25000);
  }

  async function loadCreditLimit() {
    try {
      const res = await fetch('/shopkeeper/session');
      const s = await res.json();
      document.getElementById('creditLimitDisplay').textContent = fmtMoney(s.default_credit_limit || 0);
    } catch (err) {
      document.getElementById('creditLimitDisplay').textContent = '—';
    }
  }

  document.getElementById('editCreditLimitBtn').addEventListener('click', () => {
    const current = document.getElementById('creditLimitDisplay').textContent.replace(/[^0-9.]/g, '');
    document.getElementById('creditLimitInput').value = current;
    document.getElementById('creditLimitEditor').classList.remove('hidden');
  });
  document.getElementById('cancelCreditLimitBtn').addEventListener('click', () => {
    document.getElementById('creditLimitEditor').classList.add('hidden');
  });
  document.getElementById('saveCreditLimitBtn').addEventListener('click', async () => {
    const newLimit = parseFloat(document.getElementById('creditLimitInput').value);
    if (isNaN(newLimit) || newLimit < 0) return;

    try {
      const res = await fetch('/shop/credit-limit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credit_limit: newLimit }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message || 'Failed to update');

      document.getElementById('creditLimitDisplay').textContent = fmtMoney(result.credit_limit);
      document.getElementById('creditLimitEditor').classList.add('hidden');
      speak(uiLang === 'hi'
        ? `क्रेडिट सीमा सभी ग्राहकों के लिए ${Math.round(result.credit_limit)} रुपये कर दी गई।`
        : `Credit limit updated to ${Math.round(result.credit_limit)} rupees for all customers.`);
      loadDueList(); // statuses may have shifted (e.g. Credit Limit Reached)
    } catch (err) {
      alert(err.message);
    }
  });

  // ============================================================
  // Products management page
  // ============================================================
  let allProducts = [];

  async function loadProductsPage() {
    const listEl = document.getElementById('productsList');
    listEl.innerHTML = `<div class="dues-empty">${uiLang === 'hi' ? 'लोड हो रहा है...' : 'Loading…'}</div>`;
    try {
      const res = await fetch('/products');
      allProducts = await res.json();
      renderProductsList(allProducts);
    } catch (err) {
      listEl.innerHTML = `<div class="dues-empty">${uiLang === 'hi' ? 'लोड नहीं हो सका।' : "Couldn't load products."}</div>`;
    }
  }

  function renderProductsList(products) {
    const listEl = document.getElementById('productsList');
    if (!products.length) {
      listEl.innerHTML = `<div class="dues-empty">${uiLang === 'hi' ? 'अभी कोई उत्पाद नहीं। ऊपर से जोड़ें।' : 'No products yet. Add one above.'}</div>`;
      return;
    }

    listEl.innerHTML = products.map(p => `
      <div class="product-row ${p.in_stock ? '' : 'out-of-stock'}">
        <div class="product-row-main">
          <div class="product-row-name">${p.name}${p.in_stock ? '' : `<span class="product-stock-badge">${uiLang === 'hi' ? 'स्टॉक खत्म' : 'Out of stock'}</span>`}</div>
          <div class="product-row-price">${fmtMoney(p.price)}</div>
        </div>
        <div class="product-row-actions">
          <button class="product-icon-btn" data-action="stock" data-id="${p.id}" title="${uiLang === 'hi' ? 'स्टॉक बदलें' : 'Toggle stock'}">${p.in_stock ? '✓' : '✕'}</button>
          <button class="product-icon-btn" data-action="edit" data-id="${p.id}">✏️</button>
          <button class="product-icon-btn danger" data-action="delete" data-id="${p.id}">🗑️</button>
        </div>
      </div>
      <div class="product-edit-row" id="editRow-${p.id}">
        <input type="text" id="editName-${p.id}" value="${p.name}">
        <input type="number" id="editPrice-${p.id}" value="${p.price}" min="0.01" step="0.01">
        <button data-action="save-edit" data-id="${p.id}" style="background:var(--paid-green);color:#fff;">${uiLang === 'hi' ? 'सहेजें' : 'Save'}</button>
        <button data-action="cancel-edit" data-id="${p.id}" style="background:transparent;border:1px solid var(--rule);color:var(--ink-dim);">${uiLang === 'hi' ? 'रद्द करें' : 'Cancel'}</button>
      </div>
    `).join('');

    listEl.querySelectorAll('[data-action="stock"]').forEach(btn => {
      btn.addEventListener('click', () => toggleProductStock(btn.dataset.id));
    });
    listEl.querySelectorAll('[data-action="edit"]').forEach(btn => {
      btn.addEventListener('click', () => document.getElementById(`editRow-${btn.dataset.id}`).classList.add('open'));
    });
    listEl.querySelectorAll('[data-action="cancel-edit"]').forEach(btn => {
      btn.addEventListener('click', () => document.getElementById(`editRow-${btn.dataset.id}`).classList.remove('open'));
    });
    listEl.querySelectorAll('[data-action="save-edit"]').forEach(btn => {
      btn.addEventListener('click', () => saveProductEdit(btn.dataset.id));
    });
    listEl.querySelectorAll('[data-action="delete"]').forEach(btn => {
      btn.addEventListener('click', () => deleteProduct(btn.dataset.id));
    });
  }

  async function toggleProductStock(id) {
    const product = allProducts.find(p => p.id === id);
    if (!product) return;
    try {
      const res = await fetch(`/products/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ in_stock: !product.in_stock }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message);
      loadProductsPage();
    } catch (err) {
      alert(err.message);
    }
  }

  async function saveProductEdit(id) {
    const name = document.getElementById(`editName-${id}`).value.trim();
    const price = parseFloat(document.getElementById(`editPrice-${id}`).value);
    if (!name || !price || price <= 0) return;
    try {
      const res = await fetch(`/products/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, price }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message);
      loadProductsPage();
    } catch (err) {
      alert(err.message);
    }
  }

  async function deleteProduct(id) {
    const product = allProducts.find(p => p.id === id);
    const confirmMsg = uiLang === 'hi'
      ? `क्या आप वाकई "${product?.name}" हटाना चाहते हैं?`
      : `Delete "${product?.name}"?`;
    if (!confirm(confirmMsg)) return;
    try {
      const res = await fetch(`/products/${id}`, { method: 'DELETE' });
      if (!res.ok) { const r = await res.json(); throw new Error(r.message); }
      loadProductsPage();
    } catch (err) {
      alert(err.message);
    }
  }

  document.getElementById('showAddProductBtn').addEventListener('click', () => {
    document.getElementById('addProductForm').classList.toggle('open');
  });
  document.getElementById('confirmAddProduct').addEventListener('click', async () => {
    const errorEl = document.getElementById('addProductError');
    errorEl.classList.add('hidden');
    const name = document.getElementById('newProductName').value.trim();
    const price = parseFloat(document.getElementById('newProductPrice').value);

    if (!name) {
      errorEl.textContent = uiLang === 'hi' ? "उत्पाद का नाम आवश्यक है।" : "Product name is required.";
      errorEl.classList.remove('hidden');
      return;
    }
    if (!price || price <= 0) {
      errorEl.textContent = uiLang === 'hi' ? "कीमत 0 से अधिक होनी चाहिए।" : "Price must be greater than 0.";
      errorEl.classList.remove('hidden');
      return;
    }

    try {
      const res = await fetch('/products', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, price }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message);

      document.getElementById('newProductName').value = '';
      document.getElementById('newProductPrice').value = '';
      document.getElementById('addProductForm').classList.remove('open');
      loadProductsPage();
      speak(uiLang === 'hi' ? `${name} जोड़ा गया।` : `${name} added.`);
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.remove('hidden');
    }
  });

  document.getElementById('productSearchInput').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    if (!q) { renderProductsList(allProducts); return; }
    renderProductsList(allProducts.filter(p => p.name.toLowerCase().includes(q)));
  });

  // ============================================================
  // Dashboard page (Today's Snapshot + Customers Left To Pay)
  // ============================================================
  document.getElementById('manageDashboardBtn').addEventListener('click', () => {
    showView('dashboard');
    loadSummary();
    loadDueList();
    loadGrowthChart();
    loadDueVsClearChart();
    loadProductsPage();
    loadRequestsPage();
    loadPaymentsPage();
    loadOnlinePaymentsPage();
    loadComplaintsPage();
    resetPaymentSettingsView();
    loadBankDetails();
  });

  // ---- Dashboard sidebar navigation ----
  document.querySelectorAll('.dash-nav-link').forEach(link => {
    link.addEventListener('click', () => {
      const target = document.getElementById(link.dataset.dashAnchor);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      document.querySelectorAll('.dash-nav-link').forEach(l => l.classList.remove('active'));
      link.classList.add('active');
    });
  });

  // Highlight the sidebar link matching whichever section is currently
  // in view, so it stays in sync while the shop owner just scrolls too.
  (function setupDashScrollSpy() {
    const dashMain = document.querySelector('.dash-main');
    if (!dashMain || typeof IntersectionObserver === 'undefined') return;
    const sectionIds = ['dash-anchor-overview', 'dash-anchor-products', 'dash-anchor-requests', 'dash-anchor-payments', 'dash-anchor-history', 'dash-anchor-feedback', 'dash-anchor-settings'];
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          document.querySelectorAll('.dash-nav-link').forEach(l => l.classList.remove('active'));
          const activeLink = document.querySelector(`.dash-nav-link[data-dash-anchor="${entry.target.id}"]`);
          if (activeLink) activeLink.classList.add('active');
        }
      });
    }, { root: null, rootMargin: '-20% 0px -70% 0px', threshold: 0 });
    sectionIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
  })();

  // ============================================================
  // Dashboard graphs
  // ============================================================
  let growthChartInstance = null;
  let dueChartInstance = null;

  async function loadGrowthChart() {
    const canvas = document.getElementById('growthChartCanvas');
    if (typeof Chart === 'undefined' || !canvas) return;
    try {
      const res = await fetch('/shop/growth-stats');
      const data = await res.json();

      if (growthChartInstance) growthChartInstance.destroy();
      growthChartInstance = new Chart(canvas, {
        type: 'line',
        data: {
          labels: data.map(d => d.month),
          datasets: [
            {
              label: dt('creditExtended'),
              data: data.map(d => d.credit_extended),
              borderColor: '#C08A2E', backgroundColor: 'rgba(192,138,46,0.15)',
              tension: 0.3, fill: true,
            },
            {
              label: dt('collected'),
              data: data.map(d => d.collected),
              borderColor: '#3F6B4A', backgroundColor: 'rgba(63,107,74,0.15)',
              tension: 0.3, fill: true,
            },
          ],
        },
        options: {
          responsive: true,
          plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } },
          scales: { y: { beginAtZero: true, ticks: { callback: v => '₹' + v } } },
        },
      });
    } catch (err) { /* chart just won't render this cycle */ }
  }

  async function loadDueVsClearChart() {
    const canvas = document.getElementById('dueChartCanvas');
    if (typeof Chart === 'undefined' || !canvas) return;
    try {
      const res = await fetch('/shop/due-vs-clear');
      const data = await res.json();

      if (dueChartInstance) dueChartInstance.destroy();
      dueChartInstance = new Chart(canvas, {
        type: 'bar',
        data: {
          labels: [dt('hasDues'), dt('clear')],
          datasets: [{
            label: dt('numberOfCustomers'),
            data: [data.with_due, data.clear],
            backgroundColor: ['#A33B2E', '#3F6B4A'],
            borderRadius: 6,
            maxBarThickness: 90,
          }],
        },
        options: {
          responsive: true,
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true, ticks: { stepSize: 1, precision: 0 } } },
        },
      });
    } catch (err) { /* chart just won't render this cycle */ }
  }

  // ============================================================
  // Customer feedback / complaints
  // ============================================================
  async function loadComplaintsPage() {
    const listEl = document.getElementById('complaintsList');
    listEl.innerHTML = `<div class="dues-empty">${uiLang === 'hi' ? 'लोड हो रहा है...' : 'Loading…'}</div>`;
    try {
      const res = await fetch('/shop/complaints');
      const complaints = await res.json();
      renderComplaintsList(complaints);
    } catch (err) {
      listEl.innerHTML = `<div class="dues-empty">${uiLang === 'hi' ? 'लोड नहीं हो सका।' : "Couldn't load feedback."}</div>`;
    }
  }

  function renderComplaintsList(complaints) {
    const listEl = document.getElementById('complaintsList');
    if (!complaints.length) {
      listEl.innerHTML = `<div class="dues-empty">${uiLang === 'hi' ? 'अभी तक कोई प्रतिक्रिया नहीं।' : 'No feedback yet.'}</div>`;
      return;
    }
    const categoryLabels = {
      shop: uiLang === 'hi' ? 'दुकान' : 'Shop',
      product: uiLang === 'hi' ? 'उत्पाद' : 'Product',
      staff: uiLang === 'hi' ? 'स्टाफ' : 'Staff',
      other: uiLang === 'hi' ? 'अन्य' : 'Other',
    };
    listEl.innerHTML = complaints.map(c => `
      <div class="complaint-card">
        <div class="complaint-card-head">
          <span class="complaint-card-name">${c.customer_name}</span>
          <span class="complaint-card-date">${fmtDate(c.created_at)}</span>
        </div>
        <span class="complaint-card-category">${categoryLabels[c.category] || c.category}</span>
        <div class="complaint-card-message">${c.message}</div>
        <button class="complaint-card-delete" data-id="${c.id}">${uiLang === 'hi' ? 'हटाएं' : 'Delete'}</button>
      </div>
    `).join('');

    listEl.querySelectorAll('.complaint-card-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          const res = await fetch(`/shop/complaints/${btn.dataset.id}`, { method: 'DELETE' });
          if (!res.ok) { const r = await res.json(); throw new Error(r.message); }
          loadComplaintsPage();
        } catch (err) {
          alert(err.message);
        }
      });
    });
  }

  // ============================================================
  // Credit requests page (customer-submitted, shop-owner approved)
  // ============================================================
  let lastKnownRequestCount = null; // null = haven't checked yet, so the first result is just a baseline, no sound
  let currentPendingRequestCount = 0;
  let currentPendingPaymentCount = 0;

  function updateDashboardBadge() {
    const badge = document.getElementById('dashboardBadge');
    const total = currentPendingRequestCount + currentPendingPaymentCount;
    if (total > 0) {
      badge.textContent = total > 9 ? '9+' : total;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }

  async function loadRequestBadge() {
    try {
      const res = await fetch('/shop/credit-requests');
      const requests = await res.json();
      currentPendingRequestCount = requests.length;
      updateDashboardBadge();

      if (lastKnownRequestCount !== null && requests.length > lastKnownRequestCount) {
        playRequestAlertSound();
        speak(dt('newCreditRequestArrived'));
      }
      lastKnownRequestCount = requests.length;
    } catch (err) { /* silent — badge just won't update this cycle */ }
  }

  async function loadRequestsPage() {
    const listEl = document.getElementById('requestsList');
    listEl.innerHTML = `<div class="dues-empty">${uiLang === 'hi' ? 'लोड हो रहा है...' : 'Loading…'}</div>`;
    try {
      const res = await fetch('/shop/credit-requests');
      const requests = await res.json();
      renderRequestsList(requests);
      loadRequestBadge();
    } catch (err) {
      listEl.innerHTML = `<div class="dues-empty">${uiLang === 'hi' ? 'लोड नहीं हो सका।' : "Couldn't load requests."}</div>`;
    }
  }

  function renderRequestsList(requests) {
    const listEl = document.getElementById('requestsList');
    if (!requests.length) {
      listEl.innerHTML = `<div class="dues-empty">${uiLang === 'hi' ? 'अभी कोई नई अनुरोध नहीं।' : 'No pending requests right now.'}</div>`;
      return;
    }

    listEl.innerHTML = requests.map(r => {
      const itemsText = r.items.map(i => `${i.name} × ${i.quantity} (${fmtMoney(i.price)})`).join(', ');
      return `<div class="request-card">
        <div class="request-card-head">
          <img class="request-card-photo" src="${r.customer_photo_url || ''}" alt="">
          <div>
            <div class="request-card-name">${r.customer_name}</div>
            <div class="request-card-mobile">${r.customer_mobile || ''}</div>
          </div>
        </div>
        <div class="request-card-items">${itemsText}</div>
        <div class="request-card-total">${fmtMoney(r.amount)}</div>
        <div class="request-card-actions">
          <button class="request-confirm-btn" data-action="confirm" data-id="${r.id}">${uiLang === 'hi' ? 'स्वीकार करें' : 'Confirm'}</button>
          <button class="request-cancel-btn" data-action="cancel" data-id="${r.id}">${uiLang === 'hi' ? 'रद्द करें' : 'Cancel'}</button>
        </div>
      </div>`;
    }).join('');

    listEl.querySelectorAll('[data-action="confirm"]').forEach(btn => {
      btn.addEventListener('click', () => resolveRequest(btn.dataset.id, 'confirm'));
    });
    listEl.querySelectorAll('[data-action="cancel"]').forEach(btn => {
      btn.addEventListener('click', () => resolveRequest(btn.dataset.id, 'cancel'));
    });
  }

  async function resolveRequest(requestId, action) {
    try {
      const res = await fetch(`/shop/credit-requests/${requestId}/${action}`, { method: 'POST' });
      const result = await res.json();

      if (res.status === 400 && result.status === 'limit_exceeded') {
        alert(result.message);
        return;
      }
      if (!res.ok) throw new Error(result.message || 'Failed');

      if (action === 'confirm') {
        speak(uiLang === 'hi' ? 'उधार स्वीकार किया गया।' : 'Credit request confirmed.');
      } else {
        speak(uiLang === 'hi' ? 'अनुरोध रद्द किया गया।' : 'Request cancelled.');
      }
      loadRequestsPage();
      loadSummary();
      loadDueList();
    } catch (err) {
      alert(err.message);
    }
  }

  // ============================================================
  // Payment claims page (customer says "I've paid", shop owner confirms)
  // No real payment gateway is wired in — this only reflects what the
  // shop owner has actually seen land in their account.
  // ============================================================
  let lastKnownPaymentCount = null;

  async function loadPaymentBadge() {
    try {
      const res = await fetch('/shop/payment-requests');
      const payments = await res.json();
      currentPendingPaymentCount = payments.length;
      updateDashboardBadge();

      if (lastKnownPaymentCount !== null && payments.length > lastKnownPaymentCount) {
        playRequestAlertSound();
        speak(dt('customerClaimedPayment'));
      }
      lastKnownPaymentCount = payments.length;
    } catch (err) { /* silent — badge just won't update this cycle */ }
  }

  async function loadPaymentsPage() {
    const listEl = document.getElementById('paymentsList');
    listEl.innerHTML = `<div class="dues-empty">${uiLang === 'hi' ? 'लोड हो रहा है...' : 'Loading…'}</div>`;
    try {
      const res = await fetch('/shop/payment-requests');
      const payments = await res.json();
      renderPaymentsList(payments);
      loadPaymentBadge();
    } catch (err) {
      listEl.innerHTML = `<div class="dues-empty">${uiLang === 'hi' ? 'लोड नहीं हो सका।' : "Couldn't load payment claims."}</div>`;
    }
  }

  function renderPaymentsList(payments) {
    const listEl = document.getElementById('paymentsList');
    if (!payments.length) {
      listEl.innerHTML = `<div class="dues-empty">${uiLang === 'hi' ? 'अभी कोई भुगतान दावा नहीं।' : 'No pending payment claims right now.'}</div>`;
      return;
    }

    const methodLabel = { upi: uiLang === 'hi' ? 'UPI' : 'UPI', bank: uiLang === 'hi' ? 'बैंक ट्रांसफर' : 'Bank transfer' };

    listEl.innerHTML = payments.map(p => `
      <div class="request-card">
        <div class="request-card-head">
          <img class="request-card-photo" src="${p.customer_photo_url || ''}" alt="">
          <div>
            <div class="request-card-name">${p.customer_name}</div>
            <div class="request-card-mobile">${p.customer_mobile || ''}</div>
          </div>
        </div>
        <div class="request-card-items">${uiLang === 'hi' ? 'तरीका' : 'Method'}: ${methodLabel[p.method] || p.method}${p.customer_due != null ? ` · ${uiLang === 'hi' ? 'कुल बकाया' : 'total due'}: ${fmtMoney(p.customer_due)}` : ''}</div>
        <div class="request-card-total">${fmtMoney(p.amount)}</div>
        ${p.screenshot_url ? `
          <a href="${p.screenshot_url}" target="_blank" rel="noopener" style="display:block; margin-bottom:12px;">
            <img src="${p.screenshot_url}" alt="${uiLang === 'hi' ? 'भुगतान स्क्रीनशॉट' : 'Payment screenshot'}" style="max-width:160px; border:1.5px solid var(--rule); border-radius:4px; display:block;">
            <span style="font-size:11px; color:var(--ink-dim); text-decoration:underline;">${dt('tapToViewFullSize')}</span>
          </a>
        ` : `<div class="error-text" style="margin-bottom:12px;">${dt('noScreenshotAttached')}</div>`}
        <div class="request-card-actions">
          <button class="request-confirm-btn" data-action="confirm" data-id="${p.id}">${uiLang === 'hi' ? "पैसा मिल गया — पुष्टि करें" : "Money received — Confirm"}</button>
          <button class="request-cancel-btn" data-action="cancel" data-id="${p.id}">${uiLang === 'hi' ? "पैसा नहीं मिला" : "Didn't arrive"}</button>
        </div>
      </div>
    `).join('');

    listEl.querySelectorAll('[data-action="confirm"]').forEach(btn => {
      btn.addEventListener('click', () => resolvePaymentRequest(btn.dataset.id, 'confirm'));
    });
    listEl.querySelectorAll('[data-action="cancel"]').forEach(btn => {
      btn.addEventListener('click', () => resolvePaymentRequest(btn.dataset.id, 'cancel'));
    });
  }

  async function resolvePaymentRequest(paymentId, action) {
    try {
      const res = await fetch(`/shop/payment-requests/${paymentId}/${action}`, { method: 'POST' });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message || 'Failed');

      if (action === 'confirm') {
        speak(uiLang === 'hi' ? 'भुगतान की पुष्टि हो गई।' : 'Payment confirmed.');
      } else {
        speak(uiLang === 'hi' ? 'दावा अस्वीकार किया गया।' : 'Claim rejected.');
      }
      loadPaymentsPage();
      loadSummary();
      loadDueList();
    } catch (err) {
      alert(err.message);
    }
  }

  // ============================================================
  // Online Payment History page (shop owner) — permanent, searchable,
  // online-confirmed payments only (in-person payments excluded)
  // ============================================================
  let allOnlinePayments = [];

  async function loadOnlinePaymentsPage() {
    const listEl = document.getElementById('onlinePaymentsList');
    listEl.innerHTML = `<div class="dues-empty">${uiLang === 'hi' ? 'लोड हो रहा है...' : 'Loading…'}</div>`;
    try {
      const res = await fetch('/shop/online-payments');
      allOnlinePayments = await res.json();
      renderOnlinePaymentsList(allOnlinePayments);
    } catch (err) {
      listEl.innerHTML = `<div class="dues-empty">${dt('couldntLoadPaymentHistory')}</div>`;
    }
  }

  function renderOnlinePaymentsList(payments) {
    const listEl = document.getElementById('onlinePaymentsList');
    if (!payments.length) {
      listEl.innerHTML = `<div class="dues-empty">${uiLang === 'hi' ? 'अभी तक कोई ऑनलाइन भुगतान नहीं।' : 'No online payments yet.'}</div>`;
      return;
    }

    listEl.innerHTML = payments.map(p => `
      <div class="history-row" style="align-items:flex-start; padding:12px 0;">
        <div>
          <div><b>${p.customer_name}</b> ${p.customer_mobile ? `<span style="color:var(--ink-dim); font-size:11px;">(${p.customer_mobile})</span>` : ''}</div>
          <div style="font-size:11px; color:var(--ink-dim); margin-top:2px;">${fmtDate(p.created_at)}</div>
          ${p.screenshot_url ? `<a href="${p.screenshot_url}" target="_blank" rel="noopener" style="font-size:11px; text-decoration:underline; color:var(--mustard);">${dt('viewScreenshot')}</a>` : ''}
        </div>
        <span class="h-payment">${fmtMoney(p.amount)}</span>
      </div>
    `).join('');
  }

  document.getElementById('onlinePaymentsSearchInput').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    if (!q) { renderOnlinePaymentsList(allOnlinePayments); return; }
    const filtered = allOnlinePayments.filter(p => {
      const dateStr = fmtDate(p.created_at).toLowerCase();
      const amountStr = String(p.amount);
      const nameStr = (p.customer_name || '').toLowerCase();
      return dateStr.includes(q) || amountStr.includes(q) || nameStr.includes(q);
    });
    renderOnlinePaymentsList(filtered);
  });

  // ============================================================
  // Payment Settings page — view details, re-authenticate, edit
  // ============================================================
  function resetPaymentSettingsView() {
    document.getElementById('bankDetailsView').classList.remove('hidden');
    document.getElementById('bankReauthView').classList.add('hidden');
    document.getElementById('bankEditView').classList.add('hidden');
    document.getElementById('reauthError').classList.add('hidden');
    document.getElementById('reauthPasswordInput').value = '';
    document.getElementById('reauthUniqueIdInput').value = '';
  }

  async function loadBankDetails() {
    const displayEl = document.getElementById('bankDetailsDisplay');
    displayEl.innerHTML = `<div class="dues-empty">${uiLang === 'hi' ? 'लोड हो रहा है...' : 'Loading…'}</div>`;
    try {
      const res = await fetch('/shopkeeper/bank-details');
      const d = await res.json();
      if (!res.ok) throw new Error(d.message || 'Failed to load');

      if (!d.configured) {
        displayEl.innerHTML = `<div class="important-box"><span class="ib-title">⚠ ${uiLang === 'hi' ? 'भुगतान विवरण सेट नहीं है' : 'Payment details not set up'}</span>${uiLang === 'hi' ? 'ग्राहक तब तक भुगतान नहीं कर पाएंगे जब तक आप नीचे विवरण नहीं जोड़ते।' : "Customers won't be able to pay you until you add details below."}</div>`;
        return;
      }

      displayEl.innerHTML = `
        <div class="shop-card-row"><span>UPI ID</span><b>${d.upi_id}</b></div>
        <div class="shop-card-row"><span>${uiLang === 'hi' ? 'फोन नंबर' : 'Phone number'}</span><b>${d.phone || '—'}</b></div>
      `;
    } catch (err) {
      displayEl.innerHTML = `<div class="dues-empty">${uiLang === 'hi' ? 'लोड नहीं हो सका।' : "Couldn't load payment details."}</div>`;
    }
  }

  document.getElementById('showReauthBtn').addEventListener('click', () => {
    document.getElementById('bankReauthView').classList.remove('hidden');
    document.getElementById('bankEditView').classList.add('hidden');
  });

  // ---- Re-auth tabs ----
  document.querySelectorAll('[data-reauth-tab]').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('[data-reauth-tab]').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const mode = tab.dataset.reauthTab;
      document.getElementById('reauthPasswordPanel').classList.toggle('hidden', mode !== 'password');
      document.getElementById('reauthScanPanel').classList.toggle('hidden', mode !== 'scan');
      document.getElementById('reauthUniqueIdPanel').classList.toggle('hidden', mode !== 'uniqueid');
      if (mode === 'scan') startCameraOn('reauthVideo');
    });
  });

  async function onReauthSuccess() {
    document.getElementById('bankReauthView').classList.add('hidden');
    document.getElementById('bankEditView').classList.remove('hidden');
    speak(uiLang === 'hi' ? 'पहचान सत्यापित हो गई।' : 'Identity verified.');

    // Pre-fill the edit form with current values so the owner isn't
    // retyping details they're not actually changing.
    try {
      const res = await fetch('/shopkeeper/bank-details');
      const d = await res.json();
      if (res.ok && d.configured) {
        document.getElementById('editUpi').value = d.upi_id || '';
      }
    } catch (err) { /* leave blank — not fatal, owner can still fill it in */ }
  }

  document.getElementById('reauthPasswordBtn').addEventListener('click', async () => {
    const errorEl = document.getElementById('reauthError');
    errorEl.classList.add('hidden');
    const password = document.getElementById('reauthPasswordInput').value;
    try {
      const res = await fetch('/shopkeeper/reauth/password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message || 'Verification failed');
      onReauthSuccess();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.remove('hidden');
    }
  });

  document.getElementById('reauthUniqueIdBtn').addEventListener('click', async () => {
    const errorEl = document.getElementById('reauthError');
    errorEl.classList.add('hidden');
    const unique_id = document.getElementById('reauthUniqueIdInput').value.trim();
    try {
      const res = await fetch('/shopkeeper/reauth/unique-id', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unique_id }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message || 'Verification failed');
      onReauthSuccess();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.remove('hidden');
    }
  });

  document.getElementById('reauthScanBtn').addEventListener('click', async () => {
    const errorEl = document.getElementById('reauthError');
    errorEl.classList.add('hidden');
    const video = document.getElementById('reauthVideo');
    const canvas = document.getElementById('reauthCanvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    canvas.toBlob(async (blob) => {
      const formData = new FormData();
      formData.append('photo', blob, 'reauth.jpg');
      try {
        const res = await fetch('/shopkeeper/reauth/scan', { method: 'POST', body: formData });
        const result = await res.json();
        if (result.status === 'no_face_detected') {
          errorEl.textContent = uiLang === 'hi' ? 'चेहरा नहीं मिला — फिर से कोशिश करें।' : 'No face detected — try again.';
          errorEl.classList.remove('hidden');
          return;
        }
        if (!res.ok) throw new Error(result.message || 'Verification failed');
        onReauthSuccess();
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.classList.remove('hidden');
      }
    }, 'image/jpeg', 0.92);
  });

  document.getElementById('cancelBankEditBtn').addEventListener('click', () => {
    resetPaymentSettingsView();
  });

  document.getElementById('saveBankEditBtn').addEventListener('click', async () => {
    const errorEl = document.getElementById('bankEditError');
    errorEl.classList.add('hidden');

    const upiId = document.getElementById('editUpi').value.trim();

    if (!/^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,64}$/.test(upiId)) {
      errorEl.textContent = uiLang === 'hi' ? "UPI ID सही नहीं लग रही।" : "UPI ID doesn't look right.";
      errorEl.classList.remove('hidden');
      return;
    }

    const formData = new FormData();
    formData.append('upi_id', upiId);

    try {
      const res = await fetch('/shopkeeper/bank-details', { method: 'PUT', body: formData });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message || 'Failed to save');

      speak(uiLang === 'hi' ? 'भुगतान विवरण अपडेट हो गया।' : 'Payment details updated.');
      resetPaymentSettingsView();
      loadBankDetails();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.remove('hidden');
    }
  });

  let allDues = [];

  function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });
  }

  async function loadDueList() {
    const tbody = document.getElementById('duesTableBody');
    try {
      const res = await fetch('/customers/due-list');
      allDues = await res.json();
      renderDueList(allDues);
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="6" class="dues-empty">${uiLang === 'hi' ? 'ग्राहक सूची लोड नहीं हो सकी।' : "Couldn't load customer list."}</td></tr>`;
    }
  }

  function renderDueList(list) {
    const tbody = document.getElementById('duesTableBody');
    document.getElementById('duesCount').textContent = list.length;

    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="dues-empty">${uiLang === 'hi' ? 'कोई बकाया ग्राहक नहीं।' : 'No customers with pending dues.'}</td></tr>`;
      return;
    }

    tbody.innerHTML = list.map(c => `
      <tr>
        <td class="name-cell">${c.name}</td>
        <td>${c.mobile || '—'}</td>
        <td>${fmtMoney(c.amount_took)}</td>
        <td class="amount-paid">${fmtMoney(c.amount_paid)}</td>
        <td class="amount-left">${fmtMoney(c.amount_left)}</td>
        <td>${fmtDate(c.last_purchase_at)}</td>
      </tr>
    `).join('');
  }

  document.getElementById('dueSearchInput').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    if (!q) { renderDueList(allDues); return; }
    const filtered = allDues.filter(c =>
      c.name.toLowerCase().includes(q) || (c.mobile || '').includes(q)
    );
    renderDueList(filtered);
  });

  function showView(name) {
    Object.values(views).forEach(v => v.classList.add('hidden'));
    const el = views[name];
    el.classList.remove('hidden');
    el.classList.remove('view-fade');
    void el.offsetWidth;
    el.classList.add('view-fade');
    updateNavBack(MAIN_BACK_MAP[name]);
  }

  function fmtMoney(n) {
    return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  async function loadSummary() {
    const kpiRow = document.getElementById('dashKpiRow');
    try {
      const res = await fetch('/summary');
      const s = await res.json();
      const labels = { total: dt('totalOutstanding'), customers: dt('customersWithDues'), collected: dt('collectedToday') };
      kpiRow.innerHTML = `
        <div class="dash-kpi-card kpi-red">
          <div class="dash-kpi-label">${labels.total}</div>
          <div class="dash-kpi-value">${fmtMoney(s.total_due)}</div>
        </div>
        <div class="dash-kpi-card">
          <div class="dash-kpi-label">${labels.customers}</div>
          <div class="dash-kpi-value">${s.customers_with_due}</div>
        </div>
        <div class="dash-kpi-card kpi-green">
          <div class="dash-kpi-label">${labels.collected}</div>
          <div class="dash-kpi-value">${fmtMoney(s.collected_today)}</div>
        </div>
      `;
    } catch (err) {
      kpiRow.innerHTML = `<div class="dues-empty">${dt('snapshotUnavailable')}</div>`;
    }
  }

  scanBtn.addEventListener('click', () => {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    canvas.toBlob(blob => {
      lastPhotoBlob = blob;
      identifyPhoto(blob);
    }, 'image/jpeg', 0.92);
  });

  async function identifyPhoto(blob) {
    scanBtn.disabled = true;
    statusLine.textContent = uiLang === 'hi' ? "स्कैन हो रहा है..." : "Scanning...";
    const formData = new FormData();
    formData.append('photo', blob, 'capture.jpg');

    try {
      const res = await fetch('/identify', { method: 'POST', body: formData });
      const result = await res.json();
      scanBtn.disabled = false;

      if (result.status === 'no_face_detected') {
        statusLine.textContent = uiLang === 'hi' ? "चेहरा नहीं मिला — फिर से कोशिश करें।" : "No face detected — try again.";
        return;
      }
      if (result.status === 'error') {
        statusLine.textContent = result.message || (uiLang === 'hi' ? "स्कैन में समस्या हुई।" : "Something went wrong while scanning.");
        console.error('Scan error from server:', result.message);
        return;
      }
      statusLine.textContent = "";

      if (result.status === 'known_customer') {
        renderCustomer(result.data, blob);
        showView('customer');
      } else if (result.status === 'new_customer') {
        document.getElementById('newPhoto').src = URL.createObjectURL(blob);
        document.getElementById('newCustomerForm').reset();
        document.getElementById('formError').classList.add('hidden');
        newCustomerPicker.reset();
        loadShopProducts().then(() => newCustomerPicker.render());
        showView('newCustomer');
      }
    } catch (err) {
      scanBtn.disabled = false;
      statusLine.textContent = uiLang === 'hi' ? "सर्वर से संपर्क नहीं हो सका।" : "Couldn't reach the server.";
      console.error('Scan request failed:', err);
    }
  }

  function renderPendingItems(items) {
    const block = document.getElementById('pendingItemsBlock');
    const tags = document.getElementById('pendingItemsTags');
    if (!items || !items.length) {
      block.classList.add('hidden');
      return;
    }
    block.classList.remove('hidden');
    tags.innerHTML = items.map(i => `<span class="item-tag">${i}</span>`).join('');
  }

  const STATUS_LABELS = {
    'Clear': { en: 'Clear', hi: 'साफ' },
    'Due': { en: 'Due', hi: 'बकाया' },
    'Overdue': { en: 'Overdue', hi: 'अतिदेय' },
    'Credit Limit Reached': { en: 'Credit Limit Reached', hi: 'क्रेडिट सीमा पूर्ण' },
  };

  let currentCustomerRaw = null;

  function renderCustomer(c, blob) {
    currentCustomerId = c.id;
    currentCustomerRaw = c;
    document.getElementById('cPhoto').src = URL.createObjectURL(blob);
    document.getElementById('cName').textContent = c.name;
    document.getElementById('cMobile').textContent = c.mobile || '';
    document.getElementById('cAddress').textContent = c.address || '';
    document.getElementById('cDue').textContent = fmtMoney(c.due_amount);
    renderPendingItems(c.pending_items);

    const statusEl = document.getElementById('cStatus');
    const statusLabel = STATUS_LABELS[c.status] ? STATUS_LABELS[c.status][uiLang] : c.status;
    statusEl.textContent = statusLabel;
    statusEl.className = 'status-badge status-' + c.status.replace(/\s/g, '');

    document.getElementById('purchaseForm').classList.remove('open');
    document.getElementById('paymentForm').classList.remove('open');
    document.getElementById('paymentAmount').value = '';
    purchasePicker.reset();
    loadShopProducts().then(() => purchasePicker.render());

    speakEvent('welcome', c.name, Math.round(c.due_amount));
    loadHistory(c.id);
  }

  async function loadHistory(customerId) {
    const listEl = document.getElementById('historyList');
    listEl.innerHTML = `<div style="font-size:12px;color:var(--ink-dim);">${dt('loadingDots')}</div>`;
    try {
      const res = await fetch(`/customers/${customerId}/transactions`);
      const rows = await res.json();
      if (!rows.length) {
        listEl.innerHTML = `<div style="font-size:12px;color:var(--ink-dim);">${uiLang === 'hi' ? 'अभी कोई गतिविधि नहीं।' : 'No activity yet.'}</div>`;
        return;
      }
      listEl.innerHTML = rows.map(r => {
        const date = new Date(r.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
        const sign = r.type === 'purchase' ? '+' : '−';
        const cls = r.type === 'purchase' ? 'h-purchase' : 'h-payment';
        const typeLabel = r.type === 'purchase' ? dt('purchaseType') : dt('paymentType');
        const productsText = (r.products && r.products.length) ? ' <span class="h-note">(' + r.products.join(', ') + ')</span>' : '';
        return `<div class="history-row">
          <span>${date} — ${typeLabel}${productsText}</span>
          <span class="${cls}">${sign}${fmtMoney(r.amount)}</span>
        </div>`;
      }).join('');
    } catch (err) {
      listEl.innerHTML = `<div style="font-size:12px;color:var(--ink-dim);">${dt('couldntLoadHistory')}</div>`;
    }
  }

  document.getElementById('showPurchaseForm').addEventListener('click', () => {
    document.getElementById('purchaseForm').classList.toggle('open');
    document.getElementById('paymentForm').classList.remove('open');
  });
  document.getElementById('showPaymentForm').addEventListener('click', () => {
    document.getElementById('paymentForm').classList.toggle('open');
    document.getElementById('purchaseForm').classList.remove('open');
  });

  document.getElementById('confirmPurchase').addEventListener('click', async () => {
    const errorEl = document.getElementById('purchaseError');
    errorEl.classList.add('hidden');

    if (purchasePicker.isEmpty()) {
      errorEl.textContent = uiLang === 'hi' ? "कम से कम एक सामान चुनें।" : "Select at least one product.";
      errorEl.classList.remove('hidden');
      return;
    }

    const customerName = document.getElementById('cName').textContent;
    const payload = purchasePicker.getPayload();

    const res = await fetch(`/customers/${currentCustomerId}/purchase`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await res.json();

    if (res.status === 400 && result.status === 'limit_exceeded') {
      errorEl.textContent = uiLang === 'hi'
        ? `यह दुकान की ₹${Math.round(result.credit_limit)} की क्रेडिट सीमा से अधिक हो जाएगा। इस ग्राहक को अधिकतम ₹${Math.round(result.remaining_room)} और उधार दिया जा सकता है।`
        : result.message;
      errorEl.classList.remove('hidden');
      speak(uiLang === 'hi' ? 'क्रेडिट सीमा पार हो जाएगी।' : 'This would exceed the credit limit.');
      return;
    }
    if (res.status === 400) {
      errorEl.textContent = result.message || (uiLang === 'hi' ? "कुछ गलत हो गया।" : "Something went wrong.");
      errorEl.classList.remove('hidden');
      return;
    }

    document.getElementById('cDue').textContent = fmtMoney(result.due_amount);
    const statusEl = document.getElementById('cStatus');
    statusEl.textContent = STATUS_LABELS[result.customer_status] ? STATUS_LABELS[result.customer_status][uiLang] : result.customer_status;
    statusEl.className = 'status-badge status-' + result.customer_status.replace(/\s/g, '');
    renderPendingItems(result.pending_items);
    document.getElementById('purchaseForm').classList.remove('open');
    purchasePicker.reset();
    loadHistory(currentCustomerId);
    loadSummary();
    loadDueList();

    speakEvent('credited', Math.round(result.amount_charged), customerName);
  });

  document.getElementById('confirmPayment').addEventListener('click', async () => {
    const amount = parseFloat(document.getElementById('paymentAmount').value);
    if (!amount || amount <= 0) return;
    const customerName = document.getElementById('cName').textContent;

    const res = await fetch(`/customers/${currentCustomerId}/payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount }),
    });
    const result = await res.json();

    if (result.status === 'cleared') {
      document.getElementById('clearedMessage').textContent = uiLang === 'hi'
        ? `${customerName} की बकाया राशि अब ₹0 है।`
        : `${customerName}'s balance is now ₹0.`;
      showView('cleared');
      loadSummary();
      loadDueList();
      playHappyChime();
      setTimeout(() => speakEvent('cleared', Math.round(amount)), 500);
      return;
    }

    document.getElementById('cDue').textContent = fmtMoney(result.due_amount);
    const statusEl = document.getElementById('cStatus');
    statusEl.textContent = STATUS_LABELS[result.customer_status] ? STATUS_LABELS[result.customer_status][uiLang] : result.customer_status;
    statusEl.className = 'status-badge status-' + result.customer_status.replace(/\s/g, '');
    renderPendingItems(result.pending_items);
    document.getElementById('paymentForm').classList.remove('open');
    loadHistory(currentCustomerId);
    loadSummary();
    loadDueList();

    speakEvent('paid', Math.round(amount), Math.round(result.due_amount));
  });

  document.getElementById('newCustomerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('formError');
    const form = e.target;
    const name = form.name.value.trim();
    const mobile = form.mobile.value.trim();

    if (!name) {
      errorEl.textContent = uiLang === 'hi' ? "नाम आवश्यक है।" : "Name is required.";
      errorEl.classList.remove('hidden');
      return;
    }
    if (mobile && mobile.length > 10) {
      errorEl.textContent = uiLang === 'hi' ? "मोबाइल नंबर 10 अंकों से अधिक नहीं हो सकता।" : "Mobile number cannot be more than 10 digits.";
      errorEl.classList.remove('hidden');
      return;
    }
    errorEl.classList.add('hidden');

    const formData = new FormData(form);
    formData.append('photo', lastPhotoBlob, 'capture.jpg');
    const payload = newCustomerPicker.getPayload();
    formData.append('items', JSON.stringify(payload.items));
    formData.append('custom_items', JSON.stringify(payload.custom_items));

    try {
      const res = await fetch('/customers', { method: 'POST', body: formData });
      const result = await res.json();

      if (res.status === 409 && result.status === 'duplicate_phone') {
        errorEl.textContent = result.message || "You have been already registered.";
        errorEl.classList.remove('hidden');
        speakEvent('duplicate');
        return;
      }
      if (res.status === 400 && result.status === 'limit_exceeded') {
        errorEl.textContent = uiLang === 'hi'
          ? `शुरुआती बकाया राशि दुकान की ₹${Math.round(result.credit_limit)} की क्रेडिट सीमा से अधिक है।`
          : result.message;
        errorEl.classList.remove('hidden');
        return;
      }
      if (!res.ok) throw new Error(result.message || 'save failed');

      statusLine.textContent = uiLang === 'hi' ? `${name} खाते में जोड़ा गया।` : `${name} added to khata.`;
      showView('scan');
      loadSummary();
      loadDueList();
      speakEvent('created', name);
    } catch (err) {
      errorEl.textContent = err.message || (uiLang === 'hi' ? "सेव नहीं हुआ। कनेक्शन जांचें।" : "Couldn't save. Check your connection.");
      errorEl.classList.remove('hidden');
    }
  });


  let savedLang = 'en';
  try {
    savedLang = sessionStorage.getItem('khataLang') || 'en';
  } catch (e) { /* storage unavailable — default to English */ }
  applyPageLanguage(savedLang);
