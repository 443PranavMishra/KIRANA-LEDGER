// ============================================================
  // Auth: shopkeeper login / registration
  // ============================================================
  const authViews = {
    role: document.getElementById('roleChoiceView'),
    choice: document.getElementById('authChoiceView'),
    loginScan: document.getElementById('authLoginScanView'),
    loginFallback: document.getElementById('authLoginFallbackView'),
    registerPhoto: document.getElementById('authRegisterPhotoView'),
    registerForm: document.getElementById('authRegisterFormView'),
    uniqueId: document.getElementById('authUniqueIdView'),
    cpScan: document.getElementById('cpScanView'),
    cpFallback: document.getElementById('cpFallbackView'),
    cpResults: document.getElementById('cpResultsView'),
    cpNotFound: document.getElementById('cpNotFoundView'),
  };
  const appContent = document.getElementById('appContent');

  // ---- Unified navbar: back button + logged-in nav items ----
  const navBackBtn = document.getElementById('navBackBtn');
  const loggedInNavIds = ['manageDashboardBtn', 'logoutBtn'];

  // What the single navbar Back button does for each auth-flow screen.
  const AUTH_BACK_MAP = {
    choice: () => showAuthView('role'),
    loginScan: () => showAuthView('choice'),
    loginFallback: () => showAuthView('loginScan'),
    registerPhoto: () => showAuthView('choice'),
    registerForm: () => { showAuthView('registerPhoto'); startCameraOn('regVideo'); },
    cpScan: () => showAuthView('role'),
    cpFallback: () => { showAuthView('cpScan'); startCameraOn('cpVideo'); },
    cpResults: () => showAuthView('role'),
    cpNotFound: () => showAuthView('role'),
  };

  // Same idea for the logged-in main app's pages.
  const MAIN_BACK_MAP = {
    customer: () => showView('scan'),
    cleared: () => showView('scan'),
    newCustomer: () => showView('scan'),
    dashboard: () => showView('scan'),
  };

  function updateNavBack(action) {
    if (action) {
      navBackBtn.classList.remove('hidden');
      navBackBtn.onclick = action;
    } else {
      navBackBtn.classList.add('hidden');
    }
  }

  function showAuthView(name) {
    Object.values(authViews).forEach(v => v.classList.add('hidden'));
    appContent.classList.add('hidden');
    authViews[name].classList.remove('hidden');
    loggedInNavIds.forEach(id => document.getElementById(id).classList.add('hidden'));
    updateNavBack(AUTH_BACK_MAP[name]);
  }

  function enterApp(shopName) {
    Object.values(authViews).forEach(v => v.classList.add('hidden'));
    appContent.classList.remove('hidden');
    loggedInNavIds.forEach(id => document.getElementById(id).classList.remove('hidden'));
    // the language toggle runs).
    document.getElementById('i-title-main').textContent = shopName || 'Kirana Ledger';
    updateNavBack(null); // the scan/home view has nothing to go "back" to
    initMainApp(); // defined further down, starts camera + loads data
  }


  // Check for an existing session on page load
  (async function checkSession() {
    try {
      const res = await fetch('/shopkeeper/session');
      const s = await res.json();
      if (s.logged_in) {
        enterApp(s.shop_name);
      } else {
        showAuthView('role');
      }
    } catch (err) {
      showAuthView('role');
    }
  })();

  document.getElementById('goShopOwnerBtn').addEventListener('click', () => {
    showAuthView('choice');
  });
  document.getElementById('goCustomerPortalBtn').addEventListener('click', () => {
    showAuthView('cpScan');
    startCameraOn('cpVideo');
  });

  document.getElementById('goLoginBtn').addEventListener('click', () => {
    showAuthView('loginScan');
    startCameraOn('loginVideo');
  });
  document.getElementById('goRegisterBtn').addEventListener('click', () => {
    showAuthView('registerPhoto');
    startCameraOn('regVideo');
  });
  document.getElementById('showFallbackBtn').addEventListener('click', () => showAuthView('loginFallback'));

  async function startCameraOn(videoId) {
    const videoEl = document.getElementById(videoId);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      videoEl.srcObject = stream;
    } catch (err) { /* handled per-view via status lines where present */ }
  }

  // ---- Login: scan ----
  let lastLoginBlob = null;
  document.getElementById('loginScanBtn').addEventListener('click', async () => {
    const video = document.getElementById('loginVideo');
    const canvas = document.getElementById('loginCanvas');
    const statusEl = document.getElementById('loginStatusLine');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    canvas.toBlob(async (blob) => {
      statusEl.textContent = uiLang === 'hi' ? 'स्कैन हो रहा है...' : 'Scanning...';
      const formData = new FormData();
      formData.append('photo', blob, 'login.jpg');
      try {
        const res = await fetch('/shopkeeper/login/scan', { method: 'POST', body: formData, credentials: 'include' });
        const result = await res.json();
        if (result.status === 'logged_in') {
          enterApp(result.shop_name);
        } else if (result.status === 'no_face_detected') {
          statusEl.textContent = uiLang === 'hi' ? 'चेहरा नहीं मिला — फिर से कोशिश करें।' : 'No face detected — try again.';
        } else {
          statusEl.textContent = uiLang === 'hi' ? "चेहरा पहचान में नहीं आया। नीचे दिए विकल्प का उपयोग करें।" : "Face not recognized. Use the fallback option below.";
        }
      } catch (err) {
        statusEl.textContent = uiLang === 'hi' ? "सर्वर से संपर्क नहीं हो सका।" : "Couldn't reach the server.";
      }
    }, 'image/jpeg', 0.92);
  });

  // ---- Login: fallback tabs ----
  document.querySelectorAll('.fallback-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.fallback-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('passwordLoginForm').classList.toggle('hidden', tab.dataset.tab !== 'password');
      document.getElementById('uniqueIdLoginForm').classList.toggle('hidden', tab.dataset.tab !== 'uniqueid');
    });
  });

  const BACKEND_ERROR_TRANSLATIONS = {
    'Incorrect phone number or password': 'गलत फोन नंबर या पासवर्ड',
    'Unique ID not recognized': 'यूनिक आईडी पहचानी नहीं गई',
    'Login failed': 'लॉगिन विफल',
  };
  function translateBackendError(message) {
    if (uiLang !== 'hi') return message;
    return BACKEND_ERROR_TRANSLATIONS[message] || message;
  }

  document.getElementById('passwordLoginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('passwordLoginError');
    const phone = document.getElementById('loginPhone').value.trim();
    const password = document.getElementById('loginPassword').value;
    try {
      const res = await fetch('/shopkeeper/login/password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ phone, password }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message || 'Login failed');
      enterApp(result.shop_name);
    } catch (err) {
      errorEl.textContent = translateBackendError(err.message);
      errorEl.classList.remove('hidden');
    }
  });

  document.getElementById('uniqueIdLoginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('uniqueIdLoginError');
    const unique_id = document.getElementById('loginUniqueId').value.trim();
    try {
      const res = await fetch('/shopkeeper/login/unique-id', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ unique_id }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message || 'Login failed');
      enterApp(result.shop_name);
    } catch (err) {
      errorEl.textContent = translateBackendError(err.message);
      errorEl.classList.remove('hidden');
    }
  });

  // ---- Registration: photo capture ----
  let regPhotoBlob = null;
  document.getElementById('regCaptureBtn').addEventListener('click', () => {
    const video = document.getElementById('regVideo');
    const canvas = document.getElementById('regCanvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      regPhotoBlob = blob;
      document.getElementById('regPhotoPreview').src = URL.createObjectURL(blob);
      showAuthView('registerForm');
    }, 'image/jpeg', 0.92);
  });

  // ---- Registration: details form ----
  document.getElementById('regPhone').addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10);
  });

  document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('registerError');
    errorEl.classList.add('hidden');

    const name = document.getElementById('regName').value.trim();
    const phone = document.getElementById('regPhone').value.trim();
    const shopName = document.getElementById('regShopName').value.trim();
    const shopAddress = document.getElementById('regShopAddress').value.trim();
    const password = document.getElementById('regPassword').value;
    const upiId = document.getElementById('regUpi').value.trim();

    if (phone.length !== 10) {
      errorEl.textContent = uiLang === 'hi' ? "फोन नंबर ठीक 10 अंकों का होना चाहिए।" : "Phone number must be exactly 10 digits.";
      errorEl.classList.remove('hidden');
      return;
    }
    if (password.length !== 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      errorEl.textContent = uiLang === 'hi' ? "पासवर्ड ठीक 8 अक्षर का होना चाहिए और उसमें अक्षर व अंक दोनों होने चाहिए।" : "Password must be exactly 8 characters and include letters and numbers.";
      errorEl.classList.remove('hidden');
      return;
    }
    if (!/^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,64}$/.test(upiId)) {
      errorEl.textContent = uiLang === 'hi' ? "UPI ID सही नहीं लग रही (जैसे: 9876543210@ybl)।" : "UPI ID doesn't look right (e.g. 9876543210@ybl).";
      errorEl.classList.remove('hidden');
      return;
    }

    const formData = new FormData();
    formData.append('photo', regPhotoBlob, 'shopkeeper.jpg');
    formData.append('name', name);
    formData.append('phone', phone);
    formData.append('shop_name', shopName);
    formData.append('shop_address', shopAddress);
    formData.append('password', password);
    formData.append('default_credit_limit', document.getElementById('regDefaultCreditLimit').value || '');
    formData.append('upi_id', upiId);

    try {
      const res = await fetch('/shopkeeper/register', { method: 'POST', body: formData, credentials: 'include' });
      const result = await res.json();

      if (res.status === 409 && result.status === 'already_registered') {
        errorEl.textContent = uiLang === 'hi'
          ? `आप पहले से ही '${result.shop_name}' दुकान के मालिक के रूप में पंजीकृत हैं। कृपया लॉगिन करें।`
          : result.message;
        errorEl.classList.remove('hidden');
        document.getElementById('goToLoginFromDuplicateBtn').classList.remove('hidden');
        if (typeof speak === 'function') {
          speak(uiLang === 'hi'
            ? 'आप पहले से पंजीकृत हैं। कृपया लॉगिन करें।'
            : 'You are already registered. Please log in.');
        }
        return;
      }
      if (!res.ok) throw new Error(result.message || 'Registration failed');

      document.getElementById('uniqueIdDisplay').textContent = result.unique_id;
      showAuthView('uniqueId');
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.remove('hidden');
    }
  });

  document.getElementById('goToLoginFromDuplicateBtn').addEventListener('click', () => {
    document.getElementById('goToLoginFromDuplicateBtn').classList.add('hidden');
    document.getElementById('registerError').classList.add('hidden');
    showAuthView('loginScan');
    startCameraOn('loginVideo');
  });

  document.getElementById('uniqueIdContinueBtn').addEventListener('click', async () => {
    const res = await fetch('/shopkeeper/session');
    const s = await res.json();
    enterApp(s.shop_name);
  });

  // ---- Logout ----
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await fetch('/shopkeeper/logout', { method: 'POST', credentials: 'include' });
    location.reload();
  });
