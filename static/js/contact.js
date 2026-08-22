// ---- Contact Us panel ----
  const CONTACT_CATEGORIES = {
    shop_owner: [
      { value: 'payment_setup', label: () => dt('contactCatPaymentSetup') },
      { value: 'login', label: () => dt('contactCatLogin') },
      { value: 'register', label: () => dt('contactCatRegister') },
      { value: 'forgot_both', label: () => dt('contactCatForgotBoth') },
      { value: 'other', label: () => dt('contactCatOther') },
    ],
    customer: [
      { value: 'login', label: () => dt('contactCatLogin') },
      { value: 'payment', label: () => dt('contactCatPayment') },
      { value: 'account_security', label: () => dt('contactCatAccountSecurity') },
      { value: 'other', label: () => dt('contactCatOther') },
    ],
  };
  let contactSelectedRole = 'shop_owner';

  function renderContactCategories() {
    const select = document.getElementById('contactCategory');
    const previousValue = select.value;
    select.innerHTML = CONTACT_CATEGORIES[contactSelectedRole]
      .map(c => `<option value="${c.value}">${c.label()}</option>`).join('');
    if ([...select.options].some(o => o.value === previousValue)) select.value = previousValue;
  }

  document.getElementById('contactFab').addEventListener('click', () => {
    document.getElementById('contactOverlay').classList.remove('hidden');
    renderContactCategories();
  });
  document.getElementById('contactClose').addEventListener('click', () => {
    document.getElementById('contactOverlay').classList.add('hidden');
  });
  document.getElementById('contactOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'contactOverlay') document.getElementById('contactOverlay').classList.add('hidden');
  });

  document.querySelectorAll('[data-contact-role]').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('[data-contact-role]').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      contactSelectedRole = tab.dataset.contactRole;
      renderContactCategories();
    });
  });

  document.getElementById('contactPhone').addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10);
  });

  document.getElementById('contactForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('contactError');
    const successEl = document.getElementById('contactSuccess');
    errorEl.classList.add('hidden');
    successEl.classList.add('hidden');

    const name = document.getElementById('contactName').value.trim();
    const phone = document.getElementById('contactPhone').value.trim();
    const category = document.getElementById('contactCategory').value;
    const description = document.getElementById('contactDescription').value.trim();

    if (!name || phone.length !== 10 || !description) {
      errorEl.textContent = dt('contactFillAllFields');
      errorEl.classList.remove('hidden');
      return;
    }

    const submitBtn = document.getElementById('contactSubmitBtn');
    submitBtn.disabled = true;

    try {
      const res = await fetch('/contact-us', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, role: contactSelectedRole, category, description }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message || 'Failed to send');

      document.getElementById('contactForm').reset();
      renderContactCategories();

      if (result.whatsapp_link) {
        // Straight to WhatsApp, no confirmation screen in between.
        window.location.href = result.whatsapp_link;
      } else {
        // WhatsApp not configured yet — this is the only case with
        // nothing to hand off to, so show the fallback message instead.
        successEl.textContent = dt('contactWeWillContact');
        successEl.classList.remove('hidden');
        speak(dt('contactWeWillContact'));
      }
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.remove('hidden');
    } finally {
      submitBtn.disabled = false;
    }
  });
