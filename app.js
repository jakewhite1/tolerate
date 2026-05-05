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
// PERSONALITY MESSAGES
// ─────────────────────────────────────────────
const MSG = {
  sarcastic: {
    welcome:          "Oh great. Another human who can't remember things.",
    tone_confirm:     "Sarcastic it is. Great choice for someone who obviously needs this app.",
    name_prompt:      "What do your people call you? (Assuming you have people.)",
    contact_prompt:   "How do we reach you? We'll try to keep it brief. No promises.",
    ready:            "Alright, let's see how long this lasts.",
    nag_created:      "Bold of you to assume they'll actually do it.",
    nag_sent:         "Link generated. Your move.",
    friend_greeting:  "Hey {friend}! {from} sent you a reminder. Draw your own conclusions.",
    completed:        "Wow. You actually did it. Color me shocked.",
    snoozed:          "Again? Really?",
    already_done:     "Sure you did.",
    dismissed:        "Fine. Don't come crying to us.",
    check_question:   "So… did you actually do it?",
    install_nudge:    "Install the app if you want reminders when you're too busy ignoring things.",
  },
  warm: {
    welcome:          "Hi! 👋 Let's make sure you never miss a thing!",
    tone_confirm:     "Warm and wonderful — just like you! 🌟",
    name_prompt:      "What's your name? We'd love to know!",
    contact_prompt:   "How can we reach you? We promise to only send good vibes.",
    ready:            "You're all set! Let's do this! 💛",
    nag_created:      "You're such a good friend for looking out for them! 💛",
    nag_sent:         "Link ready! They're lucky to have you.",
    friend_greeting:  "Hey {friend}! Your friend {from} is thinking of you 💛",
    completed:        "You did it! I knew you could! 🎉",
    snoozed:          "No worries! I'll check back with you soon 💛",
    already_done:     "Amazing! You're on top of everything! 🌟",
    dismissed:        "That's okay! We're here whenever you need us.",
    check_question:   "Hey! Did you get a chance to do the thing? 🌟",
    install_nudge:    "Install the app for the best experience! It only takes a second 💛",
  },
  brutal: {
    welcome:          "You forgot something, didn't you. That's why you're here.",
    tone_confirm:     "Brutal. This is going to hurt. You're welcome.",
    name_prompt:      "Name. Go.",
    contact_prompt:   "Email or phone. Pick one. We don't have all day.",
    ready:            "Fine. Let's see if you can actually follow through.",
    nag_created:      "Don't hold your breath. But hey, you tried.",
    nag_sent:         "Sent. Whether it works is on them.",
    friend_greeting:  "{from} has decided you need a reminder. Hard to argue with.",
    completed:        "Took long enough. Anything else you need me to do for you?",
    snoozed:          "Unbelievable.",
    already_done:     "Really. When, exactly.",
    dismissed:        "Cool. Enjoy forgetting.",
    check_question:   "Did you do it or are we doing this again.",
    install_nudge:    "Install the app. Or don't. But then stop complaining about forgetting things.",
  },
  straight: {
    welcome:          'Set reminders. Stay on track.',
    tone_confirm:     'Straight Up selected.',
    name_prompt:      'Enter your name.',
    contact_prompt:   'Enter your email or phone number.',
    ready:            'Setup complete.',
    nag_created:      'Reminder link created.',
    nag_sent:         'Link ready to share.',
    friend_greeting:  '{from} sent you a reminder.',
    completed:        'Marked complete.',
    snoozed:          'Rescheduled.',
    already_done:     'Noted.',
    dismissed:        'Dismissed.',
    check_question:   'Reminder check-in: did you complete this?',
    install_nudge:    'Install the app for background notifications.',
  },
};

function msg(key, tone, vars = {}) {
  tone = tone || getState().user?.tone || 'straight';
  let text = MSG[tone]?.[key] || MSG.straight[key] || '';
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
let _nagFrequency = 'once';
let _currentCheckId = null;
let _micRecognition = null;
let _currentShareLink = '';
let _currentNagPhone = '';
let _currentFriendName = '';

function showView(id, direction = 'forward') {
  const next = document.getElementById(id);
  if (!next) return;

  if (_currentView && _currentView !== id) {
    const prev = document.getElementById(_currentView);
    if (prev) {
      prev.classList.remove('active');
      if (direction === 'forward') prev.classList.add('slide-out');
      setTimeout(() => prev.classList.remove('slide-out'), 340);
    }
    if (direction === 'forward') _viewHistory.push(_currentView);
  }

  next.classList.add('active');
  _currentView = id;
  next.scrollTop = 0;

  // View-specific init
  if (id === 'home') renderHome();
  if (id === 'reminders') renderReminders();
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
// INIT
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  registerSW();
  checkScheduledReminders();

  // Check if this is a friend landing (nag link)
  const params = new URLSearchParams(location.search);
  if (params.get('nag') === '1') {
    initFriendLanding(params);
    return;
  }

  // Check if opening from a notification tap
  const checkId = params.get('check');
  if (checkId) {
    const s = getState();
    if (s.onboarded) {
      showView('home');
      openReminderCheck(checkId);
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
  setTimeout(() => showView('onboarding-name'), 350);
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

  const greetEl = document.getElementById('home-greeting');
  if (greetEl) greetEl.textContent = `Hey ${user.name} 👋`;

  renderRemindersPreview();
}

function renderRemindersPreview() {
  const el = document.getElementById('reminders-preview');
  if (!el) return;
  const reminders = getReminders().filter(r => !r.done);
  if (!reminders.length) {
    el.innerHTML = '';
    return;
  }
  el.innerHTML = `<div class="preview-label">Coming up</div>` +
    reminders.slice(0, 3).map(r => `
      <div class="preview-item" onclick="openReminderCheck('${r.id}')">
        <div class="preview-item-dot"></div>
        <div class="preview-item-text">${esc(r.thing)}</div>
        <div class="preview-item-time">${formatTime(r.nextAt)}</div>
      </div>
    `).join('');
}

// ─────────────────────────────────────────────
// FRIEND NAG – CREATOR SIDE
// ─────────────────────────────────────────────
function setFrequency(freq) {
  _nagFrequency = freq;
  document.querySelectorAll('.freq-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.freq === freq);
  });
}

function generateNag() {
  const friendName = document.getElementById('nag-friend-name').value.trim();
  const thing = document.getElementById('nag-thing').value.trim();
  if (!friendName) { showToast('Enter your friend\'s name'); return; }
  if (!thing) { showToast('What do they keep forgetting?'); return; }

  _currentFriendName = friendName;
  _currentNagPhone = document.getElementById('nag-phone').value.trim();

  const { user } = getState();
  const senderName = user?.name || 'Someone';
  const tone = user?.tone || 'straight';

  const params = new URLSearchParams({
    nag: '1',
    from: senderName,
    friend: friendName,
    what: thing,
    freq: _nagFrequency,
    tone,
  });

  _currentShareLink = `${location.origin}${location.pathname}?${params}`;

  document.getElementById('share-title').textContent = msg('nag_created', tone);
  document.getElementById('share-subtitle').textContent = msg('nag_sent', tone);
  document.getElementById('share-link-text').textContent = _currentShareLink;

  // Update Messages button label based on whether we have a number
  const msgBtn = document.getElementById('btn-text-friend');
  if (msgBtn) {
    msgBtn.textContent = _currentNagPhone
      ? `💬 Text ${friendName}`
      : '💬 Open in Messages';
  }

  showView('share-nag');
}

async function pickContact() {
  if (!('contacts' in navigator && 'ContactsManager' in window)) {
    showToast('Contact picker not supported — enter name & number manually');
    return;
  }
  try {
    const contacts = await navigator.contacts.select(['name', 'tel'], { multiple: false });
    if (!contacts.length) return;
    const c = contacts[0];
    if (c.name?.[0]) document.getElementById('nag-friend-name').value = c.name[0];
    if (c.tel?.[0]) document.getElementById('nag-phone').value = c.tel[0];
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
  const greeting = msg('friend_greeting', tone, {
    from: _pendingFriendNag.from,
    friend: _pendingFriendNag.friend,
  });

  document.getElementById('friend-from').textContent = greeting;
  document.getElementById('friend-nag-thing').textContent = _pendingFriendNag.thing;
  document.getElementById('friend-name').value = _pendingFriendNag.friend !== 'you' ? _pendingFriendNag.friend : '';

  // Remove any onboarding-triggered views
  showView('friend-landing');
  // Clear the URL so refreshing doesn't re-trigger
  history.replaceState({}, '', location.pathname);
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
const NAG_TRIGGERS = [
  'don\'t let me forget', 'dont let me forget',
  'before i forget', 'i need to remember to', 'remind me to',
  'i need to remember', 'need to remember', 'don\'t forget to',
  'dont forget to', 'make sure i',
];

function toggleMic() {
  if (_micRecognition) {
    stopMic();
  } else {
    startMic();
  }
}

function startMic() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    showToast('Speech recognition not supported on this browser');
    return;
  }

  _micRecognition = new SR();
  _micRecognition.continuous = true;
  _micRecognition.interimResults = true;
  _micRecognition.lang = 'en-US';

  const btn = document.getElementById('mic-btn');
  const hint = document.getElementById('mic-hint');
  const transcript = document.getElementById('mic-transcript');

  btn.classList.add('listening');
  hint.textContent = 'Listening… say something like "Before I forget, call the dentist"';

  _micRecognition.onresult = (e) => {
    let interim = '';
    let final = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) final += t;
      else interim += t;
    }
    const text = (final || interim).toLowerCase().trim();
    transcript.textContent = final || interim;

    const extracted = extractNagFromSpeech(text);
    if (extracted) {
      stopMic();
      showDetectedNag(extracted);
    }
  };

  _micRecognition.onerror = () => stopMic();
  _micRecognition.onend = () => {
    if (_micRecognition) stopMic();
  };

  _micRecognition.start();
}

function stopMic() {
  if (_micRecognition) {
    _micRecognition.stop();
    _micRecognition = null;
  }
  const btn = document.getElementById('mic-btn');
  const hint = document.getElementById('mic-hint');
  if (btn) btn.classList.remove('listening');
  if (hint) hint.textContent = 'Tap and say something like\n"Before I forget, call the dentist"';
}

function extractNagFromSpeech(text) {
  for (const trigger of NAG_TRIGGERS) {
    const idx = text.indexOf(trigger);
    if (idx !== -1) {
      const after = text.slice(idx + trigger.length).trim();
      if (after.length > 2) return after.replace(/^(to\s+)?/, '');
    }
  }
  return null;
}

function showDetectedNag(thing) {
  document.getElementById('detected-thing').textContent = thing;
  document.getElementById('detected-nag').classList.remove('hidden');
  document.getElementById('mic-transcript').textContent = '';
  document.getElementById('mic-btn').style.opacity = '0.4';
}

function retryMic() {
  document.getElementById('detected-nag').classList.add('hidden');
  document.getElementById('mic-btn').style.opacity = '1';
  document.getElementById('mic-transcript').textContent = '';
}

function confirmSelfNag() {
  const thing = document.getElementById('detected-thing').textContent.trim();
  if (!thing) return;
  createSelfReminder(thing);
}

function createManualSelfNag() {
  const thing = document.getElementById('manual-nag-input').value.trim();
  if (!thing) { showToast('What do you need to remember?'); return; }
  document.getElementById('manual-nag-input').value = '';
  createSelfReminder(thing);
}

function createSelfReminder(thing) {
  const reminder = createReminderObj({ thing, frequency: 'once', type: 'self' });
  addReminder(reminder);
  scheduleReminder(reminder);
  const tone = getState().user?.tone;
  showView('home');
  showToast(tone === 'sarcastic' ? 'Sure, I\'ll remember. Since you won\'t.' :
            tone === 'brutal' ? 'Set. Don\'t mess this up.' :
            tone === 'warm' ? 'Got it! I\'ll remind you! 💛' : 'Reminder set.');
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
  const tone = getState().user?.tone || 'straight';
  sendNotification(
    '⏰ Tolerate',
    `Hey! ${reminder.thing}`,
    { checkId: reminder.id }
  );
  openReminderCheck(reminder.id);
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
  showResponseScreen(emojis[tone] || '✅', msg('completed', tone));
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
  showToast(msg('snoozed', tone));
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
    const statusClass = r.done ? 'done' : '';
    const statusLabel = r.done ? 'Done' : `Due ${formatTime(r.nextAt)}`;
    const typeLabel = r.type === 'friend' ? `From ${r.from || 'friend'}` : 'Self';
    return `
      <div class="reminder-item">
        <div class="reminder-item-header">
          <div class="reminder-thing">${esc(r.thing)}</div>
          <div class="reminder-badge ${statusClass}">${statusLabel}</div>
        </div>
        <div class="reminder-item-meta">
          <span>${typeLabel}</span>
          <span>${r.frequency}</span>
        </div>
        ${!r.done ? `
        <div class="reminder-actions">
          <button class="action-done" onclick="markDoneFromList('${r.id}')">✅ Done</button>
          <button class="action-snooze" onclick="snoozeFromList('${r.id}')">⏰ Snooze</button>
          <button class="action-delete" onclick="deleteReminder('${r.id}')">✕</button>
        </div>` : `
        <div class="reminder-actions">
          <button class="action-delete" onclick="deleteReminder('${r.id}')">Remove</button>
        </div>`}
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
