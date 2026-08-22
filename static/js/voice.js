// ============================================================
  // Voice system
  // One language choice drives both text and speech now — uiLang
  // ============================================================
  let voiceEnabled = true;
  let englishVoice = null;
  let hindiVoice = null;
  let marathiVoice = null;
  let teluguVoice = null;
  let tamilVoice = null;
  const voiceToggle = document.getElementById('voiceToggle');
  const voiceIcon = document.getElementById('voiceIcon');

  function setVoiceIcon() {
    voiceIcon.innerHTML = voiceEnabled
      ? '<path d="M11 5 6 9H3v6h3l5 4V5z" stroke="#F4ECD8" stroke-width="1.6" stroke-linejoin="round"/><path d="M15.5 8.5a5 5 0 0 1 0 7" stroke="#F4ECD8" stroke-width="1.6" stroke-linecap="round"/>'
      : '<path d="M11 5 6 9H3v6h3l5 4V5z" stroke="#F4ECD8" stroke-width="1.6" stroke-linejoin="round"/><path d="M16 9l4 6M20 9l-4 6" stroke="#E8A99C" stroke-width="1.6" stroke-linecap="round"/>';
  }
  voiceToggle.addEventListener('click', () => {
    voiceEnabled = !voiceEnabled;
    setVoiceIcon();
    if (!voiceEnabled) window.speechSynthesis.cancel();
  });

  function refreshVoice() {
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return;
    const findFor = (prefix) =>
      voices.find(v => v.lang && v.lang.toLowerCase().startsWith(prefix) && v.name.toLowerCase().includes('google'))
      || voices.find(v => v.lang && v.lang.toLowerCase().startsWith(prefix))
      || null;
    hindiVoice = findFor('hi');
    englishVoice = findFor('en');
    marathiVoice = findFor('mr');
    teluguVoice = findFor('te');
    tamilVoice = findFor('ta');
  }
  if ('speechSynthesis' in window) {
    refreshVoice();
    window.speechSynthesis.onvoiceschanged = refreshVoice;
  }

  // Not every browser/OS ships an installed Marathi, Telugu, or Tamil
  function getVoiceForLang(lang) {
    const VOICE_MAP = { en: englishVoice, hi: hindiVoice, mr: marathiVoice, te: teluguVoice, ta: tamilVoice };
    return VOICE_MAP[lang] || null;
  }
  const LANG_CODE_MAP = { en: 'en-US', hi: 'hi-IN', mr: 'mr-IN', te: 'te-IN', ta: 'ta-IN' };

  function speak(text) {
    if (!voiceEnabled || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1.0;
    utter.pitch = 1.0;
    const voiceForCurrentLang = getVoiceForLang(uiLang);
    if (voiceForCurrentLang) {
      utter.voice = voiceForCurrentLang;
    } else {
      // No matching installed voice found yet — hint the browser with a
      // lang tag so it can still pick something reasonable on its own
      utter.lang = LANG_CODE_MAP[uiLang] || 'en-US';
    }
    window.speechSynthesis.speak(utter);
  }

  // Bilingual message builder — speakEvent always follows uiLang, the
  // same single language setting that drives all the on-screen text.
  const MESSAGES = {
    created: (name) => ({
      en: `${name} created account.`,
      hi: `${name} का खाता बन गया।`,
      mr: `${name} चे खाते तयार झाले.`,
      te: `${name} ఖాతా సృష్టించబడింది.`,
      ta: `${name} கணக்கு உருவாக்கப்பட்டது.`,
    }),
    credited: (amount, name) => ({
      en: `${amount} rupees credited. Updated to ${name} account.`,
      hi: `${amount} रुपये उधार जोड़े गए। ${name} के खाते में अपडेट हुआ।`,
      mr: `${amount} रुपये उधार जोडले. ${name} च्या खात्यात अपडेट झाले.`,
      te: `${amount} రూపాయలు క్రెడిట్ చేయబడ్డాయి. ${name} ఖాతాకు అప్‌డేట్ చేయబడింది.`,
      ta: `${amount} ரூபாய் கடன் சேர்க்கப்பட்டது. ${name} கணக்கில் புதுப்பிக்கப்பட்டது.`,
    }),
    paid: (amount, due) => ({
      en: `${amount} rupees paid. ${due} rupees left.`,
      hi: `${amount} रुपये चुकाए गए। ${due} रुपये बाकी हैं।`,
      mr: `${amount} रुपये भरले. ${due} रुपये बाकी आहेत.`,
      te: `${amount} రూపాయలు చెల్లించారు. ${due} రూపాయలు మిగిలి ఉన్నాయి.`,
      ta: `${amount} ரூபாய் செலுத்தப்பட்டது. ${due} ரூபாய் மீதம் உள்ளது.`,
    }),
    cleared: (amount) => ({
      en: `${amount} rupees paid. No amount left. Fully paid.`,
      hi: `${amount} रुपये चुकाए गए। कोई राशि बाकी नहीं। पूरा भुगतान हो गया।`,
      mr: `${amount} रुपये भरले. कोणतीही रक्कम बाकी नाही. पूर्ण पेमेंट झाले.`,
      te: `${amount} రూపాయలు చెల్లించారు. మొత్తం మిగిలి లేదు. పూర్తిగా చెల్లించారు.`,
      ta: `${amount} ரூபாய் செலுத்தப்பட்டது. தொகை மீதம் இல்லை. முழுமையாக செலுத்தப்பட்டது.`,
    }),
    welcome: (name, due) => ({
      en: due > 0 ? `Welcome back ${name}. ${due} rupees due.` : `Welcome back ${name}. Account clear.`,
      hi: due > 0 ? `वापसी पर स्वागत है ${name}। ${due} रुपये बकाया हैं।` : `वापसी पर स्वागत है ${name}। खाता साफ है।`,
      mr: due > 0 ? `परत स्वागत आहे ${name}. ${due} रुपये थकबाकी आहे.` : `परत स्वागत आहे ${name}. खाते साफ आहे.`,
      te: due > 0 ? `తిరిగి స్వాగతం ${name}. ${due} రూపాయలు బాకీ ఉంది.` : `తిరిగి స్వాగతం ${name}. ఖాతా క్లియర్‌గా ఉంది.`,
      ta: due > 0 ? `மீண்டும் வரவேற்கிறோம் ${name}. ${due} ரூபாய் நிலுவை உள்ளது.` : `மீண்டும் வரவேற்கிறோம் ${name}. கணக்கு தீர்வு.`,
    }),
    duplicate: () => ({
      en: `You have already been registered.`,
      hi: `आप पहले से ही पंजीकृत हैं।`,
      mr: `तुम्ही आधीच नोंदणीकृत आहात.`,
      te: `మీరు ఇప్పటికే నమోదు చేసుకున్నారు.`,
      ta: `நீங்கள் ஏற்கனவே பதிவு செய்யப்பட்டுள்ளீர்கள்.`,
    }),
  };

  function speakEvent(key, ...args) {
    const msg = MESSAGES[key](...args);
    speak(msg[uiLang] || msg.en);
  }

  function playHappyChime() {
    if (!voiceEnabled) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const notes = [523.25, 659.25, 783.99]; // C5, E5, G5 — simple ascending chime
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.14);
        gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + i * 0.14 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.14 + 0.35);
        osc.connect(gain).connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.14);
        osc.stop(ctx.currentTime + i * 0.14 + 0.4);
      });
    } catch (e) { /* Web Audio unsupported — silently skip */ }
  }

  function playRequestAlertSound() {
    if (!voiceEnabled) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const notes = [880, 660]; // A5 then E5 — a short descending "ping-pong"
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.16);
        gain.gain.linearRampToValueAtTime(0.28, ctx.currentTime + i * 0.16 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.16 + 0.3);
        osc.connect(gain).connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.16);
        osc.stop(ctx.currentTime + i * 0.16 + 0.35);
      });
    } catch (e) { /* Web Audio unsupported*/ }
  }
