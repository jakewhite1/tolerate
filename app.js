// ─────────────────────────────────────────────
// CONFIG  – paste your Google Apps Script URL here after deployment
// ─────────────────────────────────────────────
// Apps Script code to create a web app that saves to Google Sheets:
//
// function doPost(e) {
//   var ss = SpreadsheetApp.openById('YOUR_SHEET_ID');
//   var sheet = ss.getSheetByName('Signups') || ss.insertSheet('Signups');
//   var d = JSON.parse(e.postData.contents);
//   sheet.appendRow([new Date(), d.name, d.contact, d.contactType, d.tone, d.source]);
//   return ContentService.createTextOutput(JSON.stringify({ok:true}))
//     .setMimeType(ContentService.MimeType.JSON);
// }
//
// Deploy → New deployment → Web app → Execute as: Me, Who can access: Anyone
// Then paste the URL below:
const SHEETS_URL = '';

// ─────────────────────────────────────────────
// TEXT-TO-SPEECH
// ─────────────────────────────────────────────
// Voice personalities — ordered best-to-fallback per platform
const VOICE_CFG = {
  sarcastic: {
    // UK female: dry, slightly flat
    names: ['Karen','Moira','Fiona','Tessa','Victoria',
            'Google UK English Female','Microsoft Hazel','Microsoft Susan',
            'en-GB-Standard-A','en-GB'],
    rate: 0.88, pitch: 0.78,
  },
  warm: {
    // US female: bright, higher pitch
    names: ['Samantha','Ava','Allison','Susan','Nicky',
            'Google US English Female','Microsoft Zira','Microsoft Eva',
            'en-US-Standard-C','en-US'],
    rate: 1.02, pitch: 1.22,
  },
  brutal: {
    // UK or AU male: deep, fast
    names: ['Alex','Daniel','Fred','Arthur','Gordon','Bruce',
            'Google UK English Male','Microsoft David','Microsoft Mark',
            'en-GB-Standard-B','en-AU'],
    rate: 1.12, pitch: 0.68,
  },
  straight: {
    // Neutral US: no-frills
    names: ['Tom','Samantha','Google US English','Microsoft Mark','Nicky',
            'en-US-Standard-B','en-US'],
    rate: 1.0, pitch: 1.0,
  },
};

// Cache voices once loaded — Chrome needs the voiceschanged event
let _cachedVoices = [];
function _loadVoices() {
  const v = window.speechSynthesis?.getVoices() || [];
  if (v.length) _cachedVoices = v;
}
if (window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = _loadVoices;
  _loadVoices();
}

// iOS Safari blocks speech unless triggered by a direct user tap.
let _speechPrimed = false;
let _pendingSpeech = null;

document.addEventListener('click', _primeSpeech, { capture: true, once: false });

function _primeSpeech() {
  if (_speechPrimed || !window.speechSynthesis) return;
  _speechPrimed = true;
  const unlock = new SpeechSynthesisUtterance('');
  window.speechSynthesis.speak(unlock);
  if (_pendingSpeech) {
    const { text, tone, onEnd } = _pendingSpeech;
    _pendingSpeech = null;
    setTimeout(() => _doSpeak(text, tone, onEnd), 150);
  }
}

function speak(text, tone, onEnd) {
  if (!window.speechSynthesis || !text) { onEnd?.(); return; }
  if (!_speechPrimed) { _pendingSpeech = { text, tone, onEnd }; return; }
  _doSpeak(text, tone, onEnd);
}

function _doSpeak(text, tone, onEnd) {
  const synth = window.speechSynthesis;
  synth.cancel();
  _loadVoices();
  const voices = _cachedVoices.length ? _cachedVoices : synth.getVoices();
  const cfg = VOICE_CFG[tone] || VOICE_CFG.straight;

  // Try each preferred name in order until we find a match
  let voice = null;
  for (const name of cfg.names) {
    voice = voices.find(v => v.name === name)
         || voices.find(v => v.name.startsWith(name))
         || voices.find(v => v.lang.startsWith(name));
    if (voice) break;
  }

  const utt = new SpeechSynthesisUtterance(text);
  if (voice) utt.voice = voice;
  utt.rate   = cfg.rate;
  utt.pitch  = cfg.pitch;
  utt.volume = 1;
  if (onEnd) utt.onend = onEnd;
  synth.speak(utt);
  setTimeout(() => { if (synth.paused) synth.resume(); }, 50);
}

// ─────────────────────────────────────────────
// PERSONALITY MESSAGES
// ─────────────────────────────────────────────
// Each value can be a string or an array — arrays rotate every hour
const MSG = {
  sarcastic: {
    welcome:        "Oh great. Another human who can't remember things.",
    tone_confirm:   "Sarcastic it is. Great choice for someone who obviously needs this app.",
    name_prompt:    "What do your people call you? (Assuming you have people.)",
    contact_prompt: "How do we reach you? We'll try to keep it brief. No promises.",
    ready:          "Alright, let's see how long this lasts.",
    install_nudge:  "Install the app if you want reminders when you're too busy ignoring things.",
    greeting:       ["Back again?", "Still forgetting things, I see.", "Oh look who showed up.", "Couldn't manage without me?", "Back. Already.", "You again.", "Well. Here we are."],
    nag_created:    ["Bold of you to assume they'll actually do it.", "Reminder set. We'll see.", "Done. Don't get excited.", "Set. Miracles can happen."],
    nag_sent:       ["Link generated. Your move.", "Link ready. Good luck.", "Sent. Ball's in their court. Mostly.", "Link made. Time will tell."],
    friend_greeting:["Hey {friend}! {from} sent you a reminder. Draw your own conclusions.", "Oh look, {from} remembered you might forget. Touching.", "{from} is thinking about you. Or just thinks you're forgetful."],
    completed:      ["Wow. You actually did it. Color me shocked.", "Huh. Didn't see that coming.", "Done? We'll verify that.", "Noted. Against all odds.", "Look at you. Actually following through."],
    snoozed:        ["Again? Really?", "Bold. Truly.", "Sure. That'll help.", "Snoozing it is. Character.", "Another snooze. Inspiring."],
    already_done:   ["Sure you did.", "Right.", "Okay.", "Checks out.", "Fascinating."],
    dismissed:      ["Fine. Don't come crying to us.", "Your call.", "Cool. Good luck with that.", "Dismissed. Noted."],
    check_question: ["So… did you actually do it?", "Still waiting on this one.", "Update us. Or don't.", "Let's talk about this.", "Progress report.", "Still a thing. Just saying."],
  },
  warm: {
    welcome:        "Hi! Let's make sure you never miss a thing!",
    tone_confirm:   "Warm and wonderful — just like you!",
    name_prompt:    "What's your name? We'd love to know!",
    contact_prompt: "How can we reach you? We promise to only send good vibes.",
    ready:          "You're all set! Let's do this!",
    install_nudge:  "Install the app for the best experience! It only takes a second.",
    greeting:       ["So good to see you!", "You came back! That makes me happy.", "Hey you! Ready to crush it?", "Welcome back! Let's get things done.", "I was hoping you'd stop by!", "Here to be amazing again?"],
    nag_created:    ["You're such a good friend for looking out for them!", "Love that you're helping them out!", "That's so thoughtful of you!", "Look at you being a great friend!"],
    nag_sent:       ["Link ready! They're lucky to have you.", "On its way! You're amazing.", "Done! You're such a good person.", "Ready to share! You're the best."],
    friend_greeting:["Hey {friend}! Your friend {from} is thinking of you.", "Hi {friend}! {from} wanted to make sure you're okay.", "Hey! {from} sent a little reminder your way."],
    completed:      ["You did it! I knew you could!", "Amazing! You crushed it!", "Done! Look at you go!", "That's incredible! So proud of you!", "Finished! You're on a roll!"],
    snoozed:        ["No worries! I'll check back soon.", "Take your time! We've got you.", "All good! We'll remind you again.", "That's okay! Whenever you're ready."],
    already_done:   ["Amazing! You're on top of everything!", "Love that for you!", "Incredible! Way ahead of it!", "So impressive!"],
    dismissed:      ["That's okay! We're here whenever you need us.", "No problem at all!", "Got it! We're always here.", "All good! Come back anytime."],
    check_question: ["Hey! Did you get a chance to do the thing?", "Just checking in — how's it going?", "Quick check-in! Did you handle this?", "Friendly reminder — still on your list!", "How are we doing on this one?", "Still rooting for you on this one!"],
  },
  brutal: {
    welcome:        "You forgot something, didn't you. That's why you're here.",
    tone_confirm:   "Brutal. This is going to hurt. You're welcome.",
    name_prompt:    "Name. Go.",
    contact_prompt: "Email or phone. Pick one. We don't have all day.",
    ready:          "Fine. Let's see if you can actually follow through.",
    install_nudge:  "Install the app. Or don't. But then stop complaining about forgetting things.",
    greeting:       ["You're here. Good.", "Back. Let's go.", "What do you need.", "Present. Now act like it.", "About time.", "Still at it. Fine."],
    nag_created:    ["Don't hold your breath. But hey, you tried.", "Set. We'll see if it matters.", "Done. Time will tell.", "Reminder made. Brace yourself."],
    nag_sent:       ["Sent. Whether it works is on them.", "Link out. Low expectations set.", "Gone. Prepare for disappointment.", "Done. Hope springs eternal."],
    friend_greeting:["{from} has decided you need a reminder. Hard to argue with.", "You forgot, and {from} knew you would.", "{from} is doing your memory's job for you."],
    completed:      ["Took long enough. Anything else you need me to do for you?", "Finally.", "About time.", "Done? Great. Now don't do it again.", "Completed. The bar was on the floor."],
    snoozed:        ["Unbelievable.", "Again.", "Great job.", "Truly impressive.", "Sure. This time will be different."],
    already_done:   ["Really. When, exactly.", "Sure.", "Fascinating.", "Prove it.", "Right."],
    dismissed:      ["Cool. Enjoy forgetting.", "Fine.", "Your loss.", "Dismissed. As you were."],
    check_question: ["Did you do it or are we doing this again.", "Well?", "Update. Now.", "Still waiting.", "Did you actually handle this.", "Time check. Did it happen."],
  },
  straight: {
    welcome:        'Set reminders. Stay on track.',
    tone_confirm:   'Straight Up selected.',
    name_prompt:    'Enter your name.',
    contact_prompt: 'Enter your email or phone number.',
    ready:          'Setup complete.',
    install_nudge:  'Install the app for background notifications.',
    greeting:       ['Welcome back.', 'Active.', 'Ready.', 'Session started.', 'Back online.'],
    nag_created:    ['Reminder link created.', 'Reminder set.', 'Done.', 'Saved.'],
    nag_sent:       ['Link ready to share.', 'Link created.', 'Ready.', 'Done.'],
    friend_greeting:['{from} sent you a reminder.', 'Reminder from {from}.', '{from} wants you to remember something.'],
    completed:      ['Marked complete.', 'Done.', 'Completed.', 'Logged.', 'Finished.'],
    snoozed:        ['Rescheduled.', 'Snoozed.', 'Coming back later.', 'Noted.'],
    already_done:   ['Noted.', 'Logged.', 'Got it.', 'Recorded.'],
    dismissed:      ['Dismissed.', 'Removed.', 'Done.', 'Cleared.'],
    check_question: ['Reminder check-in: did you complete this?', 'Status check: done?', 'Did you handle this?', 'Quick check — complete?', 'Follow-up: still pending?', 'Update needed on this item.'],
  },
};

function msg(key, tone, vars = {}) {
  tone = tone || getState().user?.tone || 'straight';
  let raw = MSG[tone]?.[key] ?? MSG.straight[key] ?? '';
  // Arrays rotate every hour so phrases feel fresh
  if (Array.isArray(raw)) {
    const hour = Math.floor(Date.now() / 3600000);
    raw = raw[hour % raw.length];
  }
  let text = raw;
  for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{${k}}`, v);
  return text;
}

// ─────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────
function getState() {
  try { return JSON.parse(localStorage.getItem('tolerate_state') || '{}'); }
  catch { return {}; }
}
function setState(patch) {
  const s = { ...getState(), ...patch };
  localStorage.setItem('tolerate_state', JSON.stringify(s));
  return s;
}
function getReminders() {
  try { return JSON.parse(localStorage.getItem('tolerate_reminders') || '[]'); }
  catch { return []; }
}
function saveReminders(reminders) {
  localStorage.setItem('tolerate_reminders', JSON.stringify(reminders));
}

// ─────────────────────────────────────────────
// VIEW ROUTING
// ─────────────────────────────────────────────
let _currentView = null;
let _viewHistory = [];
let _currentCheckId = null;
let _currentShareLink = '';
let _currentNagPhone = '';
let _currentFriendName = '';
let _bannerTimer = null;
let _bannerCalendarData = null;

// Views that show the persistent bottom nav (the three tabs)
const _NAV_VIEWS = new Set(['home', 'create-friend-nag', 'reminders']);

function showView(id, direction = 'forward') {
  const next = document.getElementById(id);
  if (!next) return;

  if (_currentView && _currentView !== id) {
    const prev = document.getElementById(_currentView);
    if (prev) {
      prev.classList.remove('active');
      prev.classList.add('slide-out');
      setTimeout(() => prev.classList.remove('slide-out'), 350);
    }
    if (direction === 'forward') _viewHistory.push(_currentView);
  }

  next.classList.add('active');
  _currentView = id;
  next.scrollTop = 0;

  // Global bottom nav — show only on home/reminders, update active item
  const nav = document.querySelector('.bottom-nav');
  if (nav) {
    nav.classList.toggle('hidden', !_NAV_VIEWS.has(id));
    nav.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.view === id);
    });
  }

  // View-specific init
  if (id === 'home') {
    renderHome();
    }
}

function goBack() {
  if (_viewHistory.length) {
    const prev = _viewHistory.pop();
    showView(prev, 'back');
  } else {
    showView('home', 'back');
  }
}

// ─────────────────────────────────────────────
// SWIPE NAVIGATION
// ─────────────────────────────────────────────
const SWIPE_ORDER = ['home', 'create-friend-nag', 'reminders'];
const SWIPE_MIN = 50;
let _swipeX = null, _swipeY = null, _swipeLocked = null;

document.addEventListener('touchstart', e => {
  if (e.target.closest('input, textarea, [contenteditable], select')) {
    _swipeX = null; return;
  }
  _swipeX = e.touches[0].clientX;
  _swipeY = e.touches[0].clientY;
  _swipeLocked = null;
}, { passive: true });

document.addEventListener('touchmove', e => {
  if (_swipeX === null) return;
  const dx = Math.abs(e.touches[0].clientX - _swipeX);
  const dy = Math.abs(e.touches[0].clientY - _swipeY);
  if (_swipeLocked === null && (dx > 8 || dy > 8)) {
    _swipeLocked = dx >= dy ? 'h' : 'v';
  }
  if (_swipeLocked === 'h') e.preventDefault();
}, { passive: false });

document.addEventListener('touchend', e => {
  if (_swipeX === null || _swipeLocked !== 'h') {
    _swipeX = null; _swipeY = null; _swipeLocked = null; return;
  }
  const dx = e.changedTouches[0].clientX - _swipeX;
  _swipeX = null; _swipeY = null; _swipeLocked = null;
  if (Math.abs(dx) < SWIPE_MIN) return;
  const idx = SWIPE_ORDER.indexOf(_currentView);
  if (idx === -1) return;
  if (dx < 0 && idx < SWIPE_ORDER.length - 1) showView(SWIPE_ORDER[idx + 1]);
  else if (dx > 0 && idx > 0) showView(SWIPE_ORDER[idx - 1], 'back');
}, { passive: true });

document.addEventListener('touchcancel', () => {
  _swipeX = null; _swipeY = null; _swipeLocked = null;
}, { passive: true });

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
// INSTALL PROMPT (Add to Home Screen)
// ─────────────────────────────────────────────
let _installPrompt = null;

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  _installPrompt = e;
  // Show install card on home once it's visible
  document.getElementById('install-card')?.classList.remove('hidden');
});

window.addEventListener('appinstalled', () => {
  document.getElementById('install-card')?.classList.add('hidden');
  _installPrompt = null;
});

async function installApp() {
  if (_installPrompt) {
    _installPrompt.prompt();
    const { outcome } = await _installPrompt.userChoice;
    if (outcome === 'accepted') _installPrompt = null;
    return;
  }
  // iOS Safari — no prompt API, show manual instructions
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  if (isIOS) {
    showInstallSheet();
  } else {
    showToast('Open in Chrome or Safari and use browser menu → Add to Home Screen');
  }
}

function showInstallSheet() {
  const existing = document.getElementById('ios-install-sheet');
  if (existing) { existing.remove(); return; }
  const sheet = document.createElement('div');
  sheet.id = 'ios-install-sheet';
  sheet.className = 'install-sheet';
  sheet.innerHTML = `
    <div class="install-sheet-inner">
      <div class="install-sheet-handle"></div>
      <div style="font-size:40px;margin-bottom:8px">📲</div>
      <div style="font-size:20px;font-weight:800;margin-bottom:12px;letter-spacing:-0.5px">Add to Home Screen</div>
      <ol class="install-steps">
        <li>Tap the <strong>Share</strong> button <span style="font-size:18px">⬆</span> at the bottom of Safari</li>
        <li>Scroll down and tap <strong>"Add to Home Screen"</strong></li>
        <li>Tap <strong>Add</strong> — done</li>
      </ol>
      <button class="btn btn-primary" style="margin-top:20px" onclick="document.getElementById('ios-install-sheet').remove()">Got it</button>
    </div>
  `;
  sheet.addEventListener('click', e => { if (e.target === sheet) sheet.remove(); });
  document.body.appendChild(sheet);
}

document.addEventListener('DOMContentLoaded', () => {
  // Disable transitions for initial routing so there's no animated flash on load
  document.body.classList.add('no-transition');

  registerSW();
  checkScheduledReminders();

  // Show contact picker button only where the API is actually supported
  if ('contacts' in navigator && 'ContactsManager' in window) {
    document.getElementById('contact-picker-btn')?.classList.remove('hidden');
  }

  // If already installed as PWA, hide install card
  if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
    document.getElementById('install-card')?.classList.add('hidden');
  }

  const params = new URLSearchParams(location.search);

  // Friend landing (nag link)
  if (params.get('nag') === '1') { initFriendLanding(params); return; }

  // Notification tap → go home and surface the banner
  const checkId = params.get('check');
  if (checkId) {
    history.replaceState({}, '', location.pathname);
    const s = getState();
    if (s.onboarded) {
      showView('home');
      scheduleAllReminders();
      const r = getReminders().find(r => r.id === checkId);
      if (r && !r.done) { _currentCheckId = checkId; showIncomingBanner(r.thing, checkId, false); }
      return;
    }
  }

  // Notification "Add to Calendar" action
  const calThing = params.get('calendar');
  if (calThing) {
    history.replaceState({}, '', location.pathname);
    const s = getState();
    if (s.onboarded) {
      showView('home');
      scheduleAllReminders();
      setTimeout(() => saveToCalendar(calThing, parseInt(params.get('at')) || Date.now() + 3_600_000), 600);
    }
  }

  // Share Target / Siri Shortcut: ?remind=TEXT
  const remindText = params.get('remind') || params.get('text');
  if (remindText) {
    history.replaceState({}, '', location.pathname);
    const s = getState();
    if (s.onboarded) {
      showView('home');
      createSelfReminder(remindText.trim(), true);
      speak(`Got it. I'll remind you to ${remindText.trim()}.`, s.user?.tone);
      showToast(`Reminder set: "${remindText.trim()}"`);
      return;
    }
  }

  const s = getState();
  if (s.onboarded) {
    showView('home');
    scheduleAllReminders();
    maybeRequestNotifications();
  } else {
    showView('splash');
  }

  // Re-enable transitions after the initial view is painted
  requestAnimationFrame(() => requestAnimationFrame(() => {
    document.body.classList.remove('no-transition');
  }));
});

function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

// ─────────────────────────────────────────────
// ONBOARDING
// ─────────────────────────────────────────────
let _selectedTone = null;

function selectTone(tone) {
  _selectedTone = tone;
  document.querySelectorAll('.tone-card').forEach(c => {
    c.classList.toggle('selected', c.dataset.tone === tone);
  });
  speak(MSG[tone].tone_confirm, tone, () => showView('onboarding-name'));
  setTimeout(() => showView('onboarding-name'), 1600);
}

function speakPreview() {
  const { user } = getState();
  const tone = user?.tone || 'straight';
  const friendName = document.getElementById('nag-contact')?.value || 'there';
  const thing = document.getElementById('preview-thing')?.textContent || '';
  speak(`Hey ${friendName}! Just a quick reminder — ${thing}.`, tone);
}

function speakFriendReminder() {
  const thing = document.getElementById('friend-nag-thing')?.textContent || '';
  const tone = _pendingFriendNag?.tone || 'straight';
  const friendName = document.getElementById('friend-name')?.value || _pendingFriendNag?.friend || 'there';
  speak(`Hey ${friendName}! Just a reminder — ${thing}.`, tone);
}

function saveName() {
  const name = document.getElementById('input-name').value.trim();
  if (!name) { showToast('Please enter your name'); return; }
  setState({ pendingName: name });
  showView('onboarding-contact');
}

let _contactType = 'email';
function setContactType(type) {
  _contactType = type;
  const input = document.getElementById('input-contact');
  document.getElementById('toggle-email').classList.toggle('active', type === 'email');
  document.getElementById('toggle-phone').classList.toggle('active', type === 'phone');
  input.type = type === 'phone' ? 'tel' : 'email';
  input.placeholder = type === 'phone' ? '(555) 000-0000' : 'your@email.com';
}

async function saveContact() {
  const contact = document.getElementById('input-contact').value.trim();
  if (!contact) { showToast('Please enter your ' + _contactType); return; }

  const s = getState();
  const user = {
    name: s.pendingName || 'Friend',
    contact,
    contactType: _contactType,
    tone: _selectedTone || 'straight',
  };

  setState({ user, onboarded: true, pendingName: null });

  if (SHEETS_URL) await saveSignup(user);

  showView('home');
  scheduleAllReminders();
  maybeRequestNotifications();
  // Personalized welcome on first sign-in
  setTimeout(() => speak(`${MSG[user.tone].ready} ${msg('greeting', user.tone)}`, user.tone), 700);
}

async function saveSignup(user) {
  try {
    await fetch(SHEETS_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...user, source: 'onboarding', ts: new Date().toISOString() }),
    });
  } catch {}
}

// ─────────────────────────────────────────────
// HOME
// ─────────────────────────────────────────────
function renderHome() {
  const { user } = getState();
  if (!user) return;

  // Date stamp
  const dateEl = document.getElementById('home-date');
  if (dateEl) {
    const now = new Date();
    dateEl.textContent = now.toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric'
    }).toUpperCase();
  }

  const nameEl = document.getElementById('home-name');
  if (nameEl) nameEl.textContent = user.name;

  const greetEl = document.getElementById('home-greeting');
  if (greetEl) greetEl.textContent = msg('greeting', user.tone);

  document.querySelectorAll('.tone-dot').forEach(p => {
    p.classList.toggle('active', p.dataset.tone === user.tone);
  });

  renderRemindersPreview();
}

function switchTone(tone) {
  const s = getState();
  if (!s.user) return;
  setState({ user: { ...s.user, tone } });
  const greetEl = document.getElementById('home-greeting');
  if (greetEl) greetEl.textContent = msg('greeting', tone);
  document.querySelectorAll('.tone-dot').forEach(p => {
    p.classList.toggle('active', p.dataset.tone === tone);
  });
  speak(MSG[tone].tone_confirm, tone);
}

function renderRemindersPreview() {
  const el = document.getElementById('reminders-preview');
  if (!el) return;
  const reminders = getReminders().filter(r => !r.done);
  if (!reminders.length) { el.innerHTML = '<div class="empty-state">Nothing due. You\'re ahead.</div>'; return; }
  el.innerHTML = `<div class="preview-label">Coming up</div>` +
    reminders.slice(0, 4).map(r => {
      const who = r.type === 'friend' ? (r.friend || r.from || 'Friend') : 'Me';
      return `
        <div class="glance-card" onclick="showIncomingBanner('${esc(r.thing)}','${r.id}',false)">
          <div class="glance-dot glance-dot--pending"></div>
          <div class="glance-body">
            <div class="glance-thing">${esc(r.thing)}</div>
            <div class="glance-meta">${esc(who)} &middot; ${formatTime(r.nextAt)}</div>
          </div>
          <button class="glance-delete" onclick="event.stopPropagation();deleteReminder('${r.id}')" title="Delete">
            <i class="ph-bold ph-trash"></i>
          </button>
        </div>
      `;
    }).join('');
}

// ─────────────────────────────────────────────
// INCOMING BANNER
// ─────────────────────────────────────────────
function showIncomingBanner(text, reminderId, showCalendar) {
  _currentCheckId = reminderId;
  const textEl = document.getElementById('incoming-text');
  if (textEl) textEl.textContent = text;
  const labelEl = document.getElementById('incoming-label');
  if (labelEl) labelEl.textContent = showCalendar ? '🎙 Captured' : '⏰ Reminder';
  const calBtn = document.getElementById('btn-banner-calendar');
  if (calBtn) calBtn.classList.toggle('hidden', !showCalendar);
  document.getElementById('incoming-banner')?.classList.remove('hidden');
  clearTimeout(_bannerTimer);
  _bannerTimer = setTimeout(dismissIncomingBanner, 14000);
}

function dismissIncomingBanner() {
  clearTimeout(_bannerTimer);
  document.getElementById('incoming-banner')?.classList.add('hidden');
}

function bannerDone() {
  dismissIncomingBanner();
  confirmDone();
}

function bannerSnooze() {
  dismissIncomingBanner();
  snoozeReminder(60); // snooze 1 hour by default
}

function bannerCalendar() {
  if (_bannerCalendarData) saveToCalendar(_bannerCalendarData.thing, _bannerCalendarData.nextAt);
}

// ─────────────────────────────────────────────
// CALENDAR EXPORT (.ics)
// ─────────────────────────────────────────────
function saveToCalendar(thing, nextAt) {
  const due = new Date(nextAt || Date.now() + 3_600_000);
  const end = new Date(due.getTime() + 3_600_000);
  const fmt = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Tolerate//EN',
    'BEGIN:VEVENT',
    `UID:tolerate-${Date.now()}@tolerate`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(due)}`, `DTEND:${fmt(end)}`,
    `SUMMARY:${thing}`,
    'DESCRIPTION:Reminder from Tolerate',
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${thing}`, 'TRIGGER:-PT15M', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'reminder.ics';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast('Opening in Calendar…');
}

function sendNotificationWithCalendar(thing, nextAt) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (!navigator.serviceWorker?.controller) return;
  navigator.serviceWorker.ready.then(reg => {
    reg.showNotification('Reminder saved ✓', {
      body: `"${thing}" — add to your calendar?`,
      data: { thing, nextAt },
      icon: './icon.svg', badge: './icon.svg',
      actions: [
        { action: 'calendar', title: '📅 Add to Calendar' },
        { action: 'dismiss',  title: 'Got it' },
      ],
    });
  });
}

// ─────────────────────────────────────────────
// FRIEND NAG – CREATOR SIDE
// ─────────────────────────────────────────────
function generateNag() {
  const contact = document.getElementById('nag-contact').value.trim();
  const thing   = document.getElementById('nag-thing').value.trim();
  if (!contact) { showToast('Enter a name or phone number'); return; }
  if (!thing)   { showToast('What should they remember?'); return; }

  // If the typed value looks like a phone, use it for SMS
  const looksLikePhone = /^[\d\s\-\+\(\)\.]+$/.test(contact) && contact.replace(/\D/g,'').length >= 7;
  if (looksLikePhone && !_currentNagPhone) _currentNagPhone = contact;

  _currentFriendName = contact;

  const { user } = getState();
  const senderName = user?.name || 'Someone';
  const tone       = user?.tone || 'straight';

  const params = new URLSearchParams({
    nag: '1', from: senderName, friend: contact, what: thing,
    freq: 'once', tone,
  });
  _currentShareLink = `${location.origin}${location.pathname}?${params}`;

  if (_currentNagPhone) {
    textFriend();
    showView('home');
    showToast(msg('nag_sent', tone));
    return;
  }

  document.getElementById('share-title').textContent    = msg('nag_created', tone);
  document.getElementById('share-subtitle').textContent = msg('nag_sent', tone);
  const msgBtn = document.getElementById('btn-text-friend');
  if (msgBtn) msgBtn.innerHTML = '<i class="ph-bold ph-chat-circle-text"></i> Open in Messages';
  showView('share-nag');
}

async function pickContact() {
  if (!('contacts' in navigator && 'ContactsManager' in window)) return;
  try {
    const contacts = await navigator.contacts.select(['name', 'tel'], { multiple: false });
    if (!contacts.length) return;
    const c = contacts[0];
    const name  = c.name?.[0]  || '';
    const phone = c.tel?.[0]   || '';
    document.getElementById('nag-contact').value = name || phone;
    _currentNagPhone = phone;
  } catch {
    showToast('Could not open contacts');
  }
}

function textFriend() {
  const { user } = getState();
  const senderName = user?.name || 'Someone';
  const phone = _currentNagPhone.replace(/\D/g, '');
  const thing = document.getElementById('nag-thing')?.value || '';
  const body = `Hey ${_currentFriendName}! ${senderName} wants to make sure you don't forget:\n\n"${thing}"\n\nSet a reminder here → ${_currentShareLink}`;
  const smsUrl = phone
    ? `sms:${phone}&body=${encodeURIComponent(body)}`
    : `sms:&body=${encodeURIComponent(body)}`;
  const a = document.createElement('a');
  a.href = smsUrl;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

async function shareNag() {
  if (navigator.share) {
    try {
      await navigator.share({
        title: 'Tolerate — a friendly reminder',
        text: 'Someone wants to make sure you remember something 😬',
        url: _currentShareLink,
      });
    } catch {}
  } else {
    copyNagLink();
  }
}

function copyNagLink() {
  navigator.clipboard.writeText(_currentShareLink)
    .then(() => showToast('Link copied!'))
    .catch(() => {
      const el = document.getElementById('share-link-text');
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      showToast('Select and copy the link above');
    });
}

// ─────────────────────────────────────────────
// FRIEND NAG – RECIPIENT SIDE
// ─────────────────────────────────────────────
let _pendingFriendNag = null;

function initFriendLanding(params) {
  _pendingFriendNag = {
    from: params.get('from') || 'Someone',
    friend: params.get('friend') || 'you',
    thing: params.get('what') || '',
    freq: params.get('freq') || 'once',
    tone: params.get('tone') || 'straight',
  };

  const tone = _pendingFriendNag.tone;

  // Sender avatar
  const avatarEl = document.getElementById('sender-avatar');
  if (avatarEl) {
    const name = _pendingFriendNag.from;
    avatarEl.textContent = name[0]?.toUpperCase() || '?';
    avatarEl.style.background = `hsl(${(name.charCodeAt(0) * 137) % 360},55%,40%)`;
  }

  document.getElementById('friend-from').textContent =
    `${_pendingFriendNag.from} sent you a reminder`;
  document.getElementById('friend-nag-thing').textContent = _pendingFriendNag.thing;
  document.getElementById('friend-name').value =
    _pendingFriendNag.friend !== 'you' ? _pendingFriendNag.friend : '';

  showView('friend-landing');
  history.replaceState({}, '', location.pathname);

  // Auto-speak after a short pause
  setTimeout(() => {
    const friendName = _pendingFriendNag.friend !== 'you' ? _pendingFriendNag.friend : 'there';
    speak(`Hey ${friendName}! ${_pendingFriendNag.from} wants to remind you — ${_pendingFriendNag.thing}.`, tone);
  }, 800);
}

function acceptNag() {
  if (!_pendingFriendNag) return;
  const nameEl = document.getElementById('friend-name');
  const friendName = nameEl.value.trim() || _pendingFriendNag.friend;

  const reminder = createReminderObj({
    thing: _pendingFriendNag.thing,
    frequency: _pendingFriendNag.freq,
    type: 'friend',
    from: _pendingFriendNag.from,
    forName: friendName,
  });

  addReminder(reminder);

  // Save friend's contact to Sheets too if configured
  if (SHEETS_URL) {
    saveSignup({ name: friendName, contact: '', contactType: 'none', tone: _pendingFriendNag.tone, source: 'friend_nag' }).catch(() => {});
  }

  const s = getState();
  if (!s.onboarded) {
    setState({ user: { name: friendName, tone: _pendingFriendNag.tone, contact: '', contactType: 'none' }, onboarded: true });
  }

  showView('home');
  scheduleAllReminders();
  maybeRequestNotifications();
  showToast('Reminder set! We got you.');
}

function markAlreadyDone() {
  if (!_pendingFriendNag) return;
  const tone = _pendingFriendNag?.tone || 'straight';
  showResponseScreen('✅', msg('already_done', tone));
}

function dismissNag() {
  if (!_pendingFriendNag) return;
  const tone = _pendingFriendNag?.tone || 'straight';
  showResponseScreen('🫡', msg('dismissed', tone));
}

// ─────────────────────────────────────────────
// SELF NAG
// ─────────────────────────────────────────────

function createManualSelfNag() {
  const thing = document.getElementById('manual-nag-input').value.trim();
  if (!thing) { showToast('What do you need to remember?'); return; }
  document.getElementById('manual-nag-input').value = '';
  createSelfReminder(thing);
}

function createSelfReminder(thing, silent = false) {
  const reminder = createReminderObj({ thing, frequency: 'once', type: 'self' });
  addReminder(reminder);
  scheduleReminder(reminder);
  if (!silent) {
    const tone = getState().user?.tone;
    showView('home');
    showToast(tone === 'sarcastic' ? "Sure, I'll remember. Since you won't." :
              tone === 'brutal' ? "Set. Don't mess this up." :
              tone === 'warm' ? "Got it! I'll remind you! 💛" : 'Reminder set.');
  }
}

// ─────────────────────────────────────────────
// REMINDERS
// ─────────────────────────────────────────────
function createReminderObj({ thing, frequency, type, from, forName }) {
  const now = Date.now();
  const defaultDelays = { once: 60 * 60 * 1000, daily: 24 * 60 * 60 * 1000, weekly: 7 * 24 * 60 * 60 * 1000 };
  return {
    id: 'r_' + Math.random().toString(36).slice(2),
    thing,
    frequency: frequency || 'once',
    type: type || 'self',
    from: from || null,
    forName: forName || null,
    createdAt: now,
    nextAt: now + (defaultDelays[frequency] || defaultDelays.once),
    done: false,
  };
}

function addReminder(reminder) {
  const reminders = getReminders();
  reminders.push(reminder);
  saveReminders(reminders);
}

const _timers = {};

function scheduleReminder(reminder) {
  if (reminder.done) return;
  const delay = reminder.nextAt - Date.now();
  if (delay <= 0) {
    fireReminder(reminder);
    return;
  }
  clearTimeout(_timers[reminder.id]);
  _timers[reminder.id] = setTimeout(() => fireReminder(reminder), Math.min(delay, 2147483647));
}

function scheduleAllReminders() {
  getReminders().filter(r => !r.done).forEach(scheduleReminder);
}

function checkScheduledReminders() {
  const overdue = getReminders().filter(r => !r.done && r.nextAt <= Date.now());
  overdue.forEach(r => openReminderCheck(r.id));
}

function fireReminder(reminder) {
  const { user } = getState();
  const tone = user?.tone || 'straight';
  const name = user?.name || 'there';
  // Always surface on home screen — no separate view
  showView('home');
  _bannerCalendarData = null;
  showIncomingBanner(reminder.thing, reminder.id, false);
  sendNotification('Tolerate', reminder.thing, { checkId: reminder.id });
  setTimeout(() => speak(`Hey ${name}! Quick reminder — ${reminder.thing}.`, tone), 400);
}

function openReminderCheck(reminderId) {
  const reminders = getReminders();
  const r = reminders.find(r => r.id === reminderId);
  if (!r || r.done) return;

  _currentCheckId = reminderId;
  const tone = getState().user?.tone;

  document.getElementById('check-question').textContent = msg('check_question', tone);
  document.getElementById('check-detail').textContent = r.thing;
  document.getElementById('snooze-options').classList.add('hidden');

  showView('reminder-check');
}

function confirmDone() {
  if (!_currentCheckId) return;
  const reminders = getReminders();
  const idx = reminders.findIndex(r => r.id === _currentCheckId);
  if (idx === -1) return;
  reminders[idx].done = true;
  reminders[idx].completedAt = Date.now();
  saveReminders(reminders);
  clearTimeout(_timers[_currentCheckId]);

  const tone = getState().user?.tone;
  const emojis = { sarcastic: '😐', warm: '🎉', brutal: '💀', straight: '✅' };
  const response = msg('completed', tone);
  speak(response, tone);
  showResponseScreen(emojis[tone] || '✅', response);
  _currentCheckId = null;
}

function showSnoozeOptions() {
  document.getElementById('snooze-options').classList.remove('hidden');
}

function snoozeReminder(minutes) {
  if (!_currentCheckId) return;
  const reminders = getReminders();
  const idx = reminders.findIndex(r => r.id === _currentCheckId);
  if (idx === -1) return;
  reminders[idx].nextAt = Date.now() + minutes * 60 * 1000;
  saveReminders(reminders);
  scheduleReminder(reminders[idx]);

  const tone = getState().user?.tone;
  const snoozedMsg = msg('snoozed', tone);
  speak(snoozedMsg, tone);
  showToast(snoozedMsg);
  goBack();
  _currentCheckId = null;
}

function deleteReminder(id) {
  const reminders = getReminders().filter(r => r.id !== id);
  saveReminders(reminders);
  clearTimeout(_timers[id]);
  renderReminders();
}

// ─────────────────────────────────────────────
// REMINDERS LIST VIEW
// ─────────────────────────────────────────────
function renderReminders() {
  const el = document.getElementById('reminders-list');
  if (!el) return;
  const reminders = getReminders();
  if (!reminders.length) {
    el.innerHTML = '<div class="empty-state">No reminders yet.<br>Nag yourself or a friend to get started.</div>';
    return;
  }
  el.innerHTML = reminders.map(r => {
    const who = r.type === 'friend' ? (r.friend || r.from || 'Friend') : 'Me';
    const dotClass = r.done ? 'glance-dot--done' : 'glance-dot--pending';
    return `
      <div class="glance-card glance-card--full ${r.done ? 'glance-card--done' : ''}">
        <div class="glance-dot ${dotClass}"></div>
        <div class="glance-body">
          <div class="glance-thing">${esc(r.thing)}</div>
          <div class="glance-meta">${esc(who)} &middot; ${r.done ? 'Done' : formatTime(r.nextAt)}</div>
        </div>
        ${!r.done ? `
        <div class="glance-actions">
          <button class="action-done" onclick="markDoneFromList('${r.id}')">Done</button>
          <button class="action-snooze" onclick="snoozeFromList('${r.id}')">Later</button>
          <button class="action-delete" onclick="deleteReminder('${r.id}')"><i class="ph-bold ph-trash"></i></button>
        </div>` : `
        <button class="glance-delete" onclick="deleteReminder('${r.id}')" title="Remove">
          <i class="ph-bold ph-trash"></i>
        </button>`}
      </div>
    `;
  }).join('');
}

function markDoneFromList(id) {
  _currentCheckId = id;
  confirmDone();
  setTimeout(() => {
    showView('reminders');
  }, 2200);
}

function snoozeFromList(id) {
  _currentCheckId = id;
  showSnoozeModal(id);
}

function showSnoozeModal(id) {
  // Simple inline snooze via prompt — keeps it lightweight
  const options = [
    { label: '1 hour', mins: 60 },
    { label: '4 hours', mins: 240 },
    { label: 'Tomorrow', mins: 1440 },
    { label: 'Next week', mins: 10080 },
  ];
  // Show a bottom sheet via a temporary div
  const existing = document.getElementById('snooze-sheet');
  if (existing) existing.remove();

  const sheet = document.createElement('div');
  sheet.id = 'snooze-sheet';
  sheet.style.cssText = 'position:fixed;inset:0;z-index:999;background:rgba(0,0,0,0.7);display:flex;align-items:flex-end;';
  sheet.innerHTML = `
    <div style="background:var(--surface);border-radius:20px 20px 0 0;padding:24px;width:100%;padding-bottom:calc(var(--safe-bottom,0px) + 24px)">
      <div style="font-size:16px;font-weight:700;margin-bottom:16px;">When should I remind you?</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        ${options.map(o => `<button onclick="snoozeAndClose('${id}',${o.mins})" style="padding:14px;background:var(--surface-2);border:1px solid var(--border);border-radius:10px;color:var(--text);font-size:15px;font-weight:700;cursor:pointer">${o.label}</button>`).join('')}
      </div>
      <button onclick="document.getElementById('snooze-sheet').remove()" style="margin-top:16px;width:100%;padding:14px;background:none;border:none;color:var(--text-muted);font-size:15px;cursor:pointer">Cancel</button>
    </div>`;
  document.body.appendChild(sheet);
  sheet.addEventListener('click', e => { if (e.target === sheet) sheet.remove(); });
}

function snoozeAndClose(id, minutes) {
  document.getElementById('snooze-sheet')?.remove();
  _currentCheckId = id;
  snoozeReminder(minutes);
}

// ─────────────────────────────────────────────
// RESPONSE SCREEN
// ─────────────────────────────────────────────
function showResponseScreen(emoji, message) {
  const existing = document.getElementById('response-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'response-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:998;background:var(--bg);display:flex;align-items:center;justify-content:center;flex-direction:column;gap:20px;padding:40px;text-align:center;';
  overlay.innerHTML = `
    <div style="font-size:80px;line-height:1">${emoji}</div>
    <div style="font-size:24px;font-weight:800;line-height:1.3;max-width:280px">${esc(message)}</div>
    <button onclick="dismissResponse()" style="margin-top:20px;padding:16px 40px;background:var(--primary);border:none;border-radius:16px;color:#fff;font-size:16px;font-weight:700;cursor:pointer">Got it</button>
  `;
  document.body.appendChild(overlay);
  setTimeout(() => dismissResponse(), 4000);
}

function dismissResponse() {
  const el = document.getElementById('response-overlay');
  if (el) { el.style.opacity = '0'; el.style.transition = 'opacity 0.3s'; setTimeout(() => el.remove(), 300); }
  if (_currentView !== 'home') showView('home');
}

// ─────────────────────────────────────────────
// NOTIFICATIONS
// ─────────────────────────────────────────────
async function maybeRequestNotifications() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    await Notification.requestPermission();
  }
}

function sendNotification(title, body, data = {}) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (navigator.serviceWorker?.controller) {
    navigator.serviceWorker.ready.then(reg => {
      reg.showNotification(title, { body, data, icon: './icon.svg', badge: './icon.svg' });
    });
  } else {
    new Notification(title, { body, icon: './icon.svg' });
  }
}

// ─────────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────────
function formatTime(ts) {
  if (!ts) return '';
  const now = Date.now();
  const diff = ts - now;
  const abs = Math.abs(diff);

  if (abs < 60000) return 'Now';
  if (diff < 0) return 'Overdue';
  if (abs < 3600000) return `In ${Math.round(abs / 60000)}m`;
  if (abs < 86400000) return `In ${Math.round(abs / 3600000)}h`;
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showToast(text, duration = 2500) {
  const el = document.getElementById('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('show'), duration);
}
