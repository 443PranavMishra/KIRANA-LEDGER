// ============================================================
  // Customer portal — cross-shop dues lookup
  // ============================================================
  function fmtMoneyCp(n) {
    return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }
  function fmtDateCp(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  let lastCpBlob = null;

  document.getElementById('cpScanBtn').addEventListener('click', () => {
    const video = document.getElementById('cpVideo');
    const canvas = document.getElementById('cpCanvas');
    const statusEl = document.getElementById('cpStatusLine');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    canvas.toBlob(async (blob) => {
      lastCpBlob = blob;
      statusEl.textContent = uiLang === 'hi' ? 'खोजा जा रहा है...' : 'Looking you up...';
      const formData = new FormData();
      formData.append('photo', blob, 'customer.jpg');
      try {
        const res = await fetch('/customer-portal/identify', { method: 'POST', body: formData });
        const result = await res.json();
        statusEl.textContent = '';
        handleCpResult(result);
      } catch (err) {
        statusEl.textContent = uiLang === 'hi' ? "सर्वर से संपर्क नहीं हो सका।" : "Couldn't reach the server.";
      }
    }, 'image/jpeg', 0.92);
  });

  document.getElementById('cpShowFallbackBtn').addEventListener('click', () => {
    showAuthView('cpFallback');
  });

  document.getElementById('cpFallbackForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('cpFallbackError');
    const name = document.getElementById('cpNameInput').value.trim();
    const phone = document.getElementById('cpPhoneInput').value.trim();
    errorEl.classList.add('hidden');

    try {
      const res = await fetch('/customer-portal/lookup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message || 'Lookup failed');
      handleCpResult(result);
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.remove('hidden');
    }
  });

  function handleCpResult(result) {
    if (result.status === 'no_face_detected') {
      document.getElementById('cpStatusLine').textContent = uiLang === 'hi' ? "चेहरा नहीं मिला — फिर से कोशिश करें।" : "No face detected — try again.";
      return;
    }
    if (result.status === 'error') {
      document.getElementById('cpStatusLine').textContent = result.message || (uiLang === 'hi' ? "कुछ गलत हो गया।" : "Something went wrong.");
      return;
    }
    if (result.status === 'not_found') {
      showAuthView('cpNotFound');
      if (typeof speak === 'function') {
        speak(uiLang === 'hi' ? 'कोई बकाया नहीं मिला। आप साफ हैं।' : 'No dues found. You are all clear.');
      }
      return;
    }
    if (result.status === 'found') {
      renderCpResults(result.customer_name, result.shops);
      showAuthView('cpResults');
    }
  }

  let cpRequestCarts = {};       
  let cpShopProductsCache = {}; 
  let lastCpCustomerName = null; 
  let lastCpShops = null;

  function renderCpResults(customerName, shops) {
    lastCpCustomerName = customerName;
    lastCpShops = shops;
    document.getElementById('cpResultsName').textContent = dt('cpResultsTitle', customerName);

    const container = document.getElementById('cpShopCards');
    const took = dt('took');
    const paid = dt('paidLabel');
    const lastPurchase = dt('lastPurchase');
    const lastPayment = dt('lastPayment');
    const viewHistory = dt('viewHistory');
    const hideHistory = dt('hideHistory');
    const requestMore = dt('requestMore');
    const hideRequest = dt('closeLabel');
    const payDues = dt('payDues');
    const hidePay = dt('closeLabel');
    const leaveFeedback = dt('leaveFeedback');
    const hideFeedback = dt('closeLabel');

    cpRequestCarts = {};

    container.innerHTML = shops.map((s, idx) => `
      <div class="shop-card">
        <div class="shop-card-head">
          <span class="shop-card-name">${s.shop_name}</span>
          <span class="shop-card-due">${fmtMoneyCp(s.due_amount)}</span>
        </div>
        <div class="shop-card-row"><span>${took}</span><b>${fmtMoneyCp(s.total_purchases)}</b></div>
        <div class="shop-card-row"><span>${paid}</span><b>${fmtMoneyCp(s.total_purchases - s.due_amount)}</b></div>
        <div class="shop-card-row"><span>${lastPurchase}</span><b>${fmtDateCp(s.last_purchase_at)}</b></div>
        <div class="shop-card-row"><span>${lastPayment}</span><b>${fmtDateCp(s.last_payment_at)}</b></div>
        <button class="shop-card-toggle" data-action="history" data-customer-id="${s.customer_id}" data-idx="${idx}">${viewHistory}</button>
        <div class="shop-card-history" id="cpHistory${idx}">
          <input type="text" id="cpHistorySearch${idx}" class="dues-search" style="margin:8px 0; border-radius:8px; border:1px solid var(--rule);" placeholder="${dt('searchDateAmount')}">
          <div id="cpHistoryList${idx}"></div>
        </div>
        ${s.due_amount > 0 ? `
        <button class="shop-card-toggle" data-action="pay" data-shop-id="${s.shopkeeper_id}" data-customer-id="${s.customer_id}" data-due="${s.due_amount}" data-idx="${idx}" style="margin-top:8px; color:var(--paid-green); border-color:var(--paid-green);">${payDues}</button>
        <div class="shop-card-history" id="cpPay${idx}"></div>
        ` : ''}
        <button class="shop-card-toggle" data-action="request" data-shop-id="${s.shopkeeper_id}" data-customer-id="${s.customer_id}" data-idx="${idx}" style="margin-top:8px; color:var(--mustard); border-color:var(--mustard);">${requestMore}</button>
        <div class="shop-card-history" id="cpRequest${idx}">
          <div class="product-picker-box">
            <input type="text" class="product-picker-search" id="cpReqSearch${idx}" placeholder="${dt('searchProductsPlaceholder')}">
            <div class="product-picker-results" id="cpReqResults${idx}"></div>
          </div>
          <div class="product-cart" id="cpReqCart${idx}"></div>
          <div class="product-total-row"><span>${dt('totalLabel')}</span><span id="cpReqTotal${idx}">₹0</span></div>
          <p class="error-text hidden" id="cpReqError${idx}"></p>
          <button class="scan-btn" id="cpReqSubmit${idx}" style="margin-top:8px; padding:12px;">${dt('sendRequestBtn')}</button>
          <div class="status-line" id="cpReqStatus${idx}" style="margin-top:8px;"></div>
        </div>
        <button class="shop-card-toggle" data-action="feedback" data-shop-id="${s.shopkeeper_id}" data-customer-id="${s.customer_id}" data-idx="${idx}" style="margin-top:8px;">${leaveFeedback}</button>
        <div class="shop-card-history" id="cpFeedback${idx}">
          <label style="margin-top:0;">${dt('whatIsThisAbout')}</label>
          <select id="cpFeedbackCategory${idx}" style="width:100%; padding:11px 12px; font-size:15px; border:1px solid var(--rule); border-radius:3px; background:#fff; color:var(--ink); margin-bottom:10px;">
            <option value="shop">${dt('categoryShop')}</option>
            <option value="product">${dt('categoryProduct')}</option>
            <option value="staff">${dt('categoryStaff')}</option>
            <option value="other">${dt('categoryOther')}</option>
          </select>
          <label>${dt('yourFeedback')}</label>
          <textarea id="cpFeedbackMessage${idx}" rows="3" style="width:100%; padding:11px 12px; font-size:15px; border:1px solid var(--rule); border-radius:3px; font-family:inherit; resize:vertical;" placeholder="${dt('writeHere')}"></textarea>
          <p class="error-text hidden" id="cpFeedbackError${idx}"></p>
          <button class="scan-btn" id="cpFeedbackSubmit${idx}" style="margin-top:10px; padding:12px;">${dt('submitBtn')}</button>
          <div class="status-line" id="cpFeedbackStatus${idx}" style="margin-top:8px;"></div>
        </div>
      </div>
    `).join('');

    let cpHistoryCache = {}; // idx -> fetched transaction rows, for client-side search

    function renderCpHistoryRows(idx, rows) {
      const listEl = document.getElementById(`cpHistoryList${idx}`);
      if (!rows.length) {
        listEl.innerHTML = `<div style="font-size:12px;color:var(--ink-dim);padding:8px 0;">${uiLang === 'hi' ? 'कोई गतिविधि नहीं मिली।' : 'No matching activity.'}</div>`;
        return;
      }
      listEl.innerHTML = rows.map(r => {
        const date = fmtDateCp(r.created_at);
        const sign = r.type === 'purchase' ? '+' : '−';
        const cls = r.type === 'purchase' ? 'h-purchase' : 'h-payment';
        const typeLabel = r.type === 'purchase' ? dt('purchaseType') : dt('paymentType');
        const productsText = (r.products && r.products.length) ? ' <span class="h-note">(' + r.products.join(', ') + ')</span>' : '';
        const screenshotLink = r.screenshot_url ? ` <a href="${r.screenshot_url}" target="_blank" rel="noopener" style="font-size:10.5px; text-decoration:underline; color:var(--mustard);">${dt('screenshotWord')}</a>` : '';
        return `<div class="history-row"><span>${date} — ${typeLabel}${productsText}${screenshotLink}</span><span class="${cls}">${sign}${fmtMoneyCp(r.amount)}</span></div>`;
      }).join('');
    }

    container.querySelectorAll('[data-action="history"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const idx = btn.dataset.idx;
        const historyEl = document.getElementById(`cpHistory${idx}`);
        const isOpen = historyEl.classList.contains('open');

        if (isOpen) {
          historyEl.classList.remove('open');
          btn.textContent = viewHistory;
          return;
        }

        btn.textContent = hideHistory;
        historyEl.classList.add('open');
        document.getElementById(`cpHistoryList${idx}`).innerHTML = `<div style="font-size:12px;color:var(--ink-dim);padding:8px 0;">${dt('loadingDots')}</div>`;

        try {
          const res = await fetch(`/customer-portal/transactions/${btn.dataset.customerId}`);
          const rows = await res.json();
          cpHistoryCache[idx] = rows;
          renderCpHistoryRows(idx, rows);
        } catch (err) {
          document.getElementById(`cpHistoryList${idx}`).innerHTML = `<div style="font-size:12px;color:var(--ink-dim);padding:8px 0;">${dt('couldntLoad')}</div>`;
        }
      });
    });

    container.querySelectorAll('[id^="cpHistorySearch"]').forEach(input => {
      input.addEventListener('input', (e) => {
        const idx = e.target.id.replace('cpHistorySearch', '');
        const q = e.target.value.trim().toLowerCase();
        const rows = cpHistoryCache[idx] || [];
        if (!q) { renderCpHistoryRows(idx, rows); return; }
        const filtered = rows.filter(r => {
          const dateStr = fmtDateCp(r.created_at).toLowerCase();
          const amountStr = String(r.amount);
          return dateStr.includes(q) || amountStr.includes(q);
        });
        renderCpHistoryRows(idx, filtered);
      });
    });

    container.querySelectorAll('[data-action="request"]').forEach(btn => {
      btn.addEventListener('click', () => toggleCpRequestPicker(btn.dataset.idx, btn.dataset.shopId, btn.dataset.customerId, btn, requestMore, hideRequest));
    });

    container.querySelectorAll('[data-action="pay"]').forEach(btn => {
      btn.addEventListener('click', () => toggleCpPayPanel(btn.dataset.idx, btn.dataset.shopId, btn.dataset.customerId, parseFloat(btn.dataset.due), btn, payDues, hidePay));
    });

    container.querySelectorAll('[data-action="feedback"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = btn.dataset.idx;
        const panel = document.getElementById(`cpFeedback${idx}`);
        const isOpen = panel.classList.contains('open');
        if (isOpen) {
          panel.classList.remove('open');
          btn.textContent = leaveFeedback;
          return;
        }
        btn.textContent = hideFeedback;
        panel.classList.add('open');

        document.getElementById(`cpFeedbackSubmit${idx}`).onclick = async () => {
          const errorEl = document.getElementById(`cpFeedbackError${idx}`);
          const statusEl = document.getElementById(`cpFeedbackStatus${idx}`);
          errorEl.classList.add('hidden');
          const category = document.getElementById(`cpFeedbackCategory${idx}`).value;
          const message = document.getElementById(`cpFeedbackMessage${idx}`).value.trim();

          if (message.length < 3) {
            errorEl.textContent = dt('pleaseWriteSomething');
            errorEl.classList.remove('hidden');
            return;
          }

          try {
            const res = await fetch('/customer-portal/complaints', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                customer_id: btn.dataset.customerId,
                shopkeeper_id: btn.dataset.shopId,
                category, message,
              }),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.message || 'Failed to submit');

            document.getElementById(`cpFeedbackMessage${idx}`).value = '';
            statusEl.textContent = dt('feedbackSentThanks');
            speak(dt('feedbackSentSpoken'));
          } catch (err) {
            errorEl.textContent = err.message;
            errorEl.classList.remove('hidden');
          }
        };
      });
    });
  }

  let cpPaymentDetailsCache = {}; // shopkeeper_id -> payment details, fetched lazily per shop

  async function toggleCpPayPanel(idx, shopkeeperId, customerId, dueAmount, btn, payDues, hidePay) {
    const panel = document.getElementById(`cpPay${idx}`);
    const isOpen = panel.classList.contains('open');

    if (isOpen) {
      panel.classList.remove('open');
      btn.textContent = payDues;
      return;
    }

    btn.textContent = hidePay;
    panel.classList.add('open');
    panel.innerHTML = `<div style="padding:12px 0;font-size:12px;color:var(--ink-dim);">${dt('loadingDots')}</div>`;

    if (!cpPaymentDetailsCache[shopkeeperId]) {
      try {
        const res = await fetch(`/customer-portal/shop-payment-details/${shopkeeperId}`);
        const details = await res.json();
        if (!res.ok || details.status === 'not_configured') {
          panel.innerHTML = `<div class="error-text">${details.message || (uiLang === 'hi' ? 'इस दुकान ने अभी भुगतान विवरण सेट नहीं किया है।' : "This shop hasn't set up payment details yet.")}</div>`;
          return;
        }
        cpPaymentDetailsCache[shopkeeperId] = details;
      } catch (err) {
        panel.innerHTML = `<div class="error-text">${uiLang === 'hi' ? 'लोड नहीं हो सका।' : "Couldn't load payment details."}</div>`;
        return;
      }
    }

    const d = cpPaymentDetailsCache[shopkeeperId];
    panel.innerHTML = `
      <div class="important-box" style="margin:8px 0;">
        <span class="ib-title">ℹ ${dt('payNoteTitle')}</span>
        ${dt('payNoteBody')}
      </div>
      <label>${dt('amountMaxLabel')} ${fmtMoneyCp(dueAmount)})</label>
      <input type="number" id="cpPayAmount${idx}" min="0.01" max="${dueAmount}" step="0.01" value="${dueAmount}">

      <button type="button" class="scan-btn" id="cpUpiAppBtn${idx}" style="margin-top:10px; padding:13px; background:linear-gradient(135deg,#4CAF50,#3F6B4A);">
        ${dt('payViaUpiBtn')}
      </button>
      <div class="hint-text" style="text-align:center; margin-top:4px;">${dt('payViaUpiHint')}</div>

      <div style="margin-top:14px; padding-top:12px; border-top:1px dashed var(--rule);">
        <div class="shop-card-row"><span>UPI ID</span><b>${d.upi_id}</b></div>
        <div class="shop-card-row"><span>${dt('phoneNumberLabel')}</span><b>${d.phone || '—'}</b></div>
      </div>

      <label style="margin-top:14px;">${dt('paymentScreenshotLabel')}</label>
      <input type="file" id="cpPayScreenshot${idx}" accept="image/*">
      <div class="hint-text">${dt('paymentScreenshotHint')}</div>
      <img id="cpPayScreenshotPreview${idx}" class="hidden" style="max-width:140px; margin-top:8px; border:1px solid var(--rule); border-radius:4px;" alt="Screenshot preview">

      <p class="error-text hidden" id="cpPayError${idx}"></p>
      <button class="scan-btn" id="cpPaySubmit${idx}" style="margin-top:14px; padding:12px;">${dt('completedPaymentBtn')}</button>
      <div class="status-line" id="cpPayStatus${idx}" style="margin-top:8px;"></div>
    `;

    const selectedMethod = 'upi'; // only method now

    document.getElementById(`cpUpiAppBtn${idx}`).addEventListener('click', () => {
      const amount = parseFloat(document.getElementById(`cpPayAmount${idx}`).value) || dueAmount;
      const note = uiLang === 'hi' ? 'खाता बकाया भुगतान' : 'Khata due payment';
      const upiLink = `upi://pay?pa=${encodeURIComponent(d.upi_id)}&pn=${encodeURIComponent(d.shop_name || 'Shop')}&am=${amount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(note)}`;
      window.location.href = upiLink;
    });

    document.getElementById(`cpPayScreenshot${idx}`).addEventListener('change', (e) => {
      const file = e.target.files[0];
      const previewEl = document.getElementById(`cpPayScreenshotPreview${idx}`);
      if (file) {
        previewEl.src = URL.createObjectURL(file);
        previewEl.classList.remove('hidden');
      } else {
        previewEl.classList.add('hidden');
      }
    });

    document.getElementById(`cpPaySubmit${idx}`).addEventListener('click', async () => {
      const errorEl = document.getElementById(`cpPayError${idx}`);
      const statusEl = document.getElementById(`cpPayStatus${idx}`);
      errorEl.classList.add('hidden');
      const amount = parseFloat(document.getElementById(`cpPayAmount${idx}`).value);
      const screenshotFile = document.getElementById(`cpPayScreenshot${idx}`).files[0];

      if (!amount || amount <= 0 || amount > dueAmount) {
        errorEl.textContent = dt('amountRangeError', fmtMoneyCp(dueAmount));
        errorEl.classList.remove('hidden');
        return;
      }
      if (!screenshotFile) {
        errorEl.textContent = dt('attachScreenshotFirst');
        errorEl.classList.remove('hidden');
        return;
      }

      try {
        const formData = new FormData();
        formData.append('customer_id', customerId);
        formData.append('shopkeeper_id', shopkeeperId);
        formData.append('amount', amount);
        formData.append('method', selectedMethod);
        formData.append('screenshot', screenshotFile);

        const res = await fetch('/customer-portal/pay', { method: 'POST', body: formData });
        const result = await res.json();
        if (!res.ok) throw new Error(result.message || 'Failed to submit');

        statusEl.textContent = dt('waitingForShopConfirm');
        speak(dt('paymentClaimSentSpoken'));

        pollCpPaymentStatus(result.payment_id, statusEl);
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.classList.remove('hidden');
      }
    });
  }

  function pollCpPaymentStatus(paymentId, statusEl) {
    let attempts = 0;
    const maxAttempts = 90; // ~7.5 minutes at 5s intervals

    const intervalId = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch(`/customer-portal/payment-status/${paymentId}`);
        const result = await res.json();

        if (result.status === 'confirmed') {
          clearInterval(intervalId);
          playHappyChime();
          statusEl.textContent = uiLang === 'hi'
            ? `✓ पुष्टि हो गई! ₹${Math.round(result.amount)} आपके बकाया से घटा दिए गए।`
            : `✓ Confirmed! ₹${Math.round(result.amount)} has been taken off your due amount.`;
          speak(uiLang === 'hi' ? 'भुगतान की पुष्टि हो गई।' : 'Payment confirmed.');
          return;
        }
        if (result.status === 'rejected') {
          clearInterval(intervalId);
          statusEl.textContent = uiLang === 'hi'
            ? "दुकान मालिक ने बताया कि यह भुगतान नहीं मिला। कृपया दुकान से संपर्क करें।"
            : "The shop owner said this payment hasn't arrived. Please check with them directly.";
          statusEl.style.color = 'var(--due-red)';
          return;
        }
        if (result.status === 'not_found') {
          clearInterval(intervalId);
          statusEl.textContent = '';
          return;
        }
      } catch (err) { /* transient network hiccup — just try again next tick */ }

      if (attempts >= maxAttempts) {
        clearInterval(intervalId);
        statusEl.textContent = uiLang === 'hi'
          ? 'अभी तक कोई जवाब नहीं। दुकान में जाकर पूछ सकते हैं।'
          : "No response yet — you can check with the shop directly.";
      }
    }, 5000);
  }

  async function toggleCpRequestPicker(idx, shopkeeperId, customerId, btn, requestMore, hideRequest) {
    const panel = document.getElementById(`cpRequest${idx}`);
    const isOpen = panel.classList.contains('open');

    if (isOpen) {
      panel.classList.remove('open');
      btn.textContent = requestMore;
      return;
    }

    btn.textContent = hideRequest;
    panel.classList.add('open');
    cpRequestCarts[idx] = cpRequestCarts[idx] || [];

    if (!cpShopProductsCache[shopkeeperId]) {
      document.getElementById(`cpReqResults${idx}`).innerHTML = `<div style="padding:12px;font-size:12px;color:var(--ink-dim);">${dt('loadingDots')}</div>`;
      try {
        const res = await fetch(`/customer-portal/shop-products/${shopkeeperId}`);
        cpShopProductsCache[shopkeeperId] = await res.json();
      } catch (err) {
        cpShopProductsCache[shopkeeperId] = [];
      }
    }

    renderCpReqPicker(idx, shopkeeperId, '');
    renderCpReqCart(idx);

    const searchInput = document.getElementById(`cpReqSearch${idx}`);
    searchInput.oninput = (e) => renderCpReqPicker(idx, shopkeeperId, e.target.value);

    document.getElementById(`cpReqSubmit${idx}`).onclick = () => submitCpRequest(idx, shopkeeperId, customerId);
  }

  function renderCpReqPicker(idx, shopkeeperId, filter) {
    const resultsEl = document.getElementById(`cpReqResults${idx}`);
    const products = cpShopProductsCache[shopkeeperId] || [];
    const q = filter.trim().toLowerCase();
    const matches = products.filter(p => p.name.toLowerCase().includes(q));

    if (!matches.length) {
      resultsEl.innerHTML = `<div style="padding:12px;font-size:12px;color:var(--ink-dim);">${uiLang === 'hi' ? 'कोई सामान नहीं मिला।' : 'No products found.'}</div>`;
      return;
    }

    resultsEl.innerHTML = matches.map(p => `
      <div class="product-picker-item" data-product-id="${p.id}">
        <span>${p.name}</span>
        <span class="product-picker-price">${fmtMoneyCp(p.price)}</span>
      </div>
    `).join('');

    resultsEl.querySelectorAll('.product-picker-item').forEach(el => {
      el.addEventListener('click', () => {
        const product = products.find(p => p.id === el.dataset.productId);
        if (!product) return;
        const cart = cpRequestCarts[idx];
        const existing = cart.find(c => c.product_id === product.id);
        if (existing) existing.quantity += 1;
        else cart.push({ product_id: product.id, name: product.name, price: product.price, quantity: 1 });
        renderCpReqCart(idx);
      });
    });
  }

  function renderCpReqCart(idx) {
    const cartEl = document.getElementById(`cpReqCart${idx}`);
    const totalEl = document.getElementById(`cpReqTotal${idx}`);
    const cart = cpRequestCarts[idx] || [];
    let total = 0;

    cartEl.innerHTML = cart.map((item, i) => {
      const subtotal = item.price * item.quantity;
      total += subtotal;
      return `<div class="product-cart-item">
        <span class="product-cart-name">${item.name} × ${item.quantity}</span>
        <button type="button" class="product-cart-qty-btn" data-i="${i}" data-delta="-1">−</button>
        <button type="button" class="product-cart-qty-btn" data-i="${i}" data-delta="1">+</button>
        <span class="product-cart-subtotal">${fmtMoneyCp(subtotal)}</span>
        <span class="product-cart-remove" data-i="${i}" data-remove="1">×</span>
      </div>`;
    }).join('');
    totalEl.textContent = fmtMoneyCp(total);

    cartEl.querySelectorAll('[data-delta]').forEach(btn => {
      btn.addEventListener('click', () => {
        const i = Number(btn.dataset.i);
        cpRequestCarts[idx][i].quantity += Number(btn.dataset.delta);
        if (cpRequestCarts[idx][i].quantity <= 0) cpRequestCarts[idx].splice(i, 1);
        renderCpReqCart(idx);
      });
    });
    cartEl.querySelectorAll('[data-remove]').forEach(btn => {
      btn.addEventListener('click', () => { cpRequestCarts[idx].splice(Number(btn.dataset.i), 1); renderCpReqCart(idx); });
    });
  }

  async function submitCpRequest(idx, shopkeeperId, customerId) {
    const errorEl = document.getElementById(`cpReqError${idx}`);
    const statusEl = document.getElementById(`cpReqStatus${idx}`);
    errorEl.classList.add('hidden');
    const cart = cpRequestCarts[idx] || [];

    if (!cart.length) {
      errorEl.textContent = uiLang === 'hi' ? "कम से कम एक सामान चुनें।" : "Select at least one product.";
      errorEl.classList.remove('hidden');
      return;
    }

    try {
      const res = await fetch('/customer-portal/request-credit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: customerId,
          shopkeeper_id: shopkeeperId,
          items: cart.map(c => ({ product_id: c.product_id, quantity: c.quantity })),
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message || 'Failed to send request');

      cpRequestCarts[idx] = [];
      renderCpReqCart(idx);
      speak(uiLang === 'hi'
        ? `₹${Math.round(result.amount)} का अनुरोध दुकान मालिक को भेजा गया।`
        : `Request for ₹${Math.round(result.amount)} sent to the shop owner.`);

      statusEl.textContent = uiLang === 'hi'
        ? 'दुकान मालिक की स्वीकृति का इंतज़ार है...'
        : "Waiting for the shop owner to confirm...";

      pollCpRequestStatus(result.request_id, statusEl);
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.remove('hidden');
    }
  }

  function pollCpRequestStatus(requestId, statusEl) {
    let attempts = 0;
    const maxAttempts = 90; // ~7.5 minutes at 5s intervals — long enough for a shopkeeper to notice and act, not indefinite

    const intervalId = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch(`/customer-portal/request-status/${requestId}`);
        const result = await res.json();

        if (result.status === 'confirmed') {
          clearInterval(intervalId);
          playHappyChime();
          statusEl.textContent = uiLang === 'hi'
            ? `✓ स्वीकृत! ₹${Math.round(result.amount)} आपके खाते में जोड़ दिया गया।`
            : `✓ Confirmed! ₹${Math.round(result.amount)} has been added to your account.`;
          speak(uiLang === 'hi'
            ? `स्वीकृत! ${Math.round(result.amount)} रुपये जोड़ दिए गए।`
            : `Confirmed! ${Math.round(result.amount)} rupees added.`);
          return;
        }
        if (result.status === 'not_found') {
          clearInterval(intervalId);
          statusEl.textContent = '';
          return;
        }
      } catch (err) { /* transient network hiccup — just try again next tick */ }

      if (attempts >= maxAttempts) {
        clearInterval(intervalId);
        statusEl.textContent = uiLang === 'hi'
          ? 'अभी तक कोई जवाब नहीं। दुकान में जाकर पूछ सकते हैं।'
          : "No response yet — you can check with the shop directly.";
      }
    }, 5000);
  }
