import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js';
import { addDoc, collection, deleteDoc, doc, getFirestore, onSnapshot, setDoc, writeBatch } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyC7Tbqt5FzJK8Z_USkCMWxXiHZp8uRN26A',
  authDomain: 'mattedev-account.firebaseapp.com',
  projectId: 'mattedev-account',
  storageBucket: 'mattedev-account.firebasestorage.app',
  messagingSenderId: '77268069903',
  appId: '1:77268069903:web:040aa6c3981eb3650afd7a',
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const WEEKDAYS = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'];
const COLORS = [{ name: 'Blu', value: '#0071e3' }, { name: 'Viola', value: '#8e6ccf' }, { name: 'Verde', value: '#25855a' }, { name: 'Corallo', value: '#d95746' }, { name: 'Giallo', value: '#b98300' }];
const CATEGORY_COLORS = { Lavoro: '#7ea8f8', Personale: '#a78bfa', Importante: '#fb8b7b', Altro: '#4ade80' };
const DEFAULT_CATEGORIES = Object.keys(CATEGORY_COLORS);
const DEFAULT_SETTINGS = { accent: '#0071e3', weekStartsOn: 1, categories: [], categoryColors: {} };
const state = {
  user: null,
  events: [],
  settings: { ...DEFAULT_SETTINGS },
  month: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  selectedDate: new Date(),
  eventsLoaded: false,
  settingsLoaded: false,
  eventsStop: null,
  settingsStop: null,
  profileStop: null,
  saving: false,
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const dateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const parseDate = (key) => {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
};
const shiftDate = (date, amount) => {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
};
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);
const formatTime = (time) => time ? time.split(':').map((part) => part.padStart(2, '0')).join(':') : '';
const formatLongDate = (date) => new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }).format(date);
const categories = () => [...DEFAULT_CATEGORIES, ...state.settings.categories];
const categoryColor = (category) => CATEGORY_COLORS[category] || state.settings.categoryColors[category] || COLORS[[...String(category || '')].reduce((hash, char) => hash + char.charCodeAt(0), 0) % COLORS.length].value;
const eventsPath = () => collection(db, 'users', state.user.uid, 'calendar', 'default', 'events');
const settingsPath = () => doc(db, 'users', state.user.uid, 'calendar', 'default', 'settings', 'preferences');
const profilePath = () => doc(db, 'users', state.user.uid);

function setProfileAvatar(url, displayName) {
  const fallback = () => {
    const avatar = document.createElement('span');
    avatar.id = 'profile-avatar';
    avatar.className = 'avatar-fallback';
    avatar.textContent = (displayName || 'M').charAt(0).toUpperCase();
    $('#profile-avatar').replaceWith(avatar);
  };

  if (typeof url !== 'string' || !url.trim()) {
    fallback();
    return;
  }

  let photoUrl;
  try {
    photoUrl = new URL(url);
  } catch {
    fallback();
    showError('Il link della foto profilo salvato in Firestore non è valido.');
    return;
  }
  if (photoUrl.protocol !== 'https:') {
    fallback();
    showError('Il link della foto profilo deve usare HTTPS.');
    return;
  }

  const image = document.createElement('img');
  image.id = 'profile-avatar';
  image.src = photoUrl.href;
  image.alt = `${displayName || 'Profilo'}: foto profilo`;
  image.referrerPolicy = 'no-referrer';
  image.addEventListener('error', () => {
    if (image.isConnected) fallback();
    showError('Non è stato possibile caricare la foto profilo dal link salvato.');
  }, { once: true });
  $('#profile-avatar').replaceWith(image);
}

function showError(message) {
  $('#error-message').textContent = message;
  $('#error-banner').hidden = false;
}

function clearError() {
  $('#error-banner').hidden = true;
}

function updateAccent() {
  document.documentElement.style.setProperty('--accent', state.settings.accent);
  document.documentElement.style.setProperty('--accent-glow', `${state.settings.accent}26`);
}

function getMonthDays(month) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (first.getDay() - state.settings.weekStartsOn + 7) % 7;
  return Array.from({ length: 42 }, (_, index) => shiftDate(shiftDate(first, -offset), index));
}

function getEventsByDate() {
  const grouped = new Map();
  for (const event of state.events) {
    const items = grouped.get(event.date) || [];
    items.push(event);
    grouped.set(event.date, items);
  }
  for (const items of grouped.values()) items.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  return grouped;
}

function renderCalendar() {
  const days = getMonthDays(state.month);
  const weekdayNames = Array.from({ length: 7 }, (_, index) => WEEKDAYS[(state.settings.weekStartsOn + index) % 7]);
  const groups = getEventsByDate();
  const today = dateKey(new Date());
  $('#month-heading').innerHTML = `${MONTHS[state.month.getMonth()]} <span>${state.month.getFullYear()}</span>`;
  $('#mini-month').innerHTML = `${MONTHS[state.month.getMonth()]} <b>${state.month.getFullYear()}</b>`;
  $('#calendar-weekdays').innerHTML = weekdayNames.map((day) => `<div class="${day === 'sab' || day === 'dom' ? 'weekend-label' : ''}">${day}</div>`).join('');
  $('#mini-weekdays').innerHTML = weekdayNames.map((day) => `<span>${day.slice(0, 1)}</span>`).join('');
  $('#mini-days').innerHTML = days.map((date) => {
    const key = dateKey(date);
    const classes = ['mini-day', date.getMonth() !== state.month.getMonth() ? 'outside' : '', key === dateKey(state.selectedDate) ? 'selected' : '', key === today ? 'today' : ''].filter(Boolean).join(' ');
    return `<button class="${classes}" data-action="select-date" data-date="${key}" aria-label="${escapeHtml(formatLongDate(date))}">${date.getDate()}</button>`;
  }).join('');
  $('#calendar-grid').innerHTML = days.map((date) => {
    const key = dateKey(date);
    const dayEvents = groups.get(key) || [];
    const classes = ['day-cell', date.getMonth() !== state.month.getMonth() ? 'outside-month' : '', key === dateKey(state.selectedDate) ? 'selected-day' : '', key === today ? 'today-cell' : ''].filter(Boolean).join(' ');
    const eventChips = dayEvents.slice(0, 3).map((event) => {
      const color = categoryColor(event.category);
      return `<button class="event-chip" data-action="edit-event" data-id="${escapeHtml(event.id)}" style="--event-color:${color}" title="${escapeHtml(`${event.time ? `${formatTime(event.time)} · ` : ''}${event.title}`)}">${event.time ? `<span class="chip-time">${formatTime(event.time)}</span>` : ''}<span class="chip-title">${escapeHtml(event.title)}</span></button>`;
    }).join('');
    return `<div class="${classes}" data-action="select-date" data-date="${key}" role="button" tabindex="0" aria-label="${escapeHtml(formatLongDate(date))}, ${dayEvents.length} eventi"><div class="day-cell-head"><span class="day-number">${date.getDate()}</span><button class="cell-add" data-action="new-event" data-date="${key}" aria-label="Aggiungi evento per ${escapeHtml(formatLongDate(date))}">＋</button></div><div class="day-events">${eventChips}${dayEvents.length > 3 ? `<span class="more-events">+${dayEvents.length - 3} altri</span>` : ''}</div></div>`;
  }).join('');
  renderAgenda(groups);
  renderSettings();
  $('#footer-count').textContent = `${state.events.length} ${state.events.length === 1 ? 'evento salvato' : 'eventi salvati'}`;
  renderCategories();
}

function renderCategories() {
  $('#category-labels').innerHTML = categories().map((category) => {
    const count = state.events.filter((event) => event.category === category).length;
    const removeButton = state.settings.categories.includes(category)
      ? `<button class="category-delete" data-action="delete-category" data-category="${escapeHtml(category)}" aria-label="Elimina etichetta ${escapeHtml(category)}" title="Elimina etichetta"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 6h12M8 6V4h4v2m3 0-.7 10H5.7L5 6m3 3v4m4-4v4"/></svg></button>`
      : '';
    return `<div class="calendar-label"><span class="color-dot" style="--label-color:${categoryColor(category)}"></span><span class="category-name">${escapeHtml(category)}</span><span class="event-total">${count}</span>${removeButton}</div>`;
  }).join('');
}

function renderAgenda(groups) {
  const selectedKey = dateKey(state.selectedDate);
  const selectedEvents = groups.get(selectedKey) || [];
  $('#agenda-heading').innerHTML = `${state.selectedDate.getDate()} <span>${MONTHS[state.selectedDate.getMonth()]}</span>`;
  $('#selected-date-label').textContent = formatLongDate(state.selectedDate);
  const todayCount = $('#today-count');
  if (selectedKey === dateKey(new Date()) && selectedEvents.length) {
    todayCount.innerHTML = `<span></span> ${selectedEvents.length} ${selectedEvents.length === 1 ? 'evento oggi' : 'eventi oggi'}`;
    todayCount.hidden = false;
  } else {
    todayCount.hidden = true;
  }
  if (!selectedEvents.length) {
    $('#day-agenda').innerHTML = '<div class="empty-day"><strong>Nessun evento</strong><button data-action="new-event"><span class="line-icon">＋</span> Aggiungi un evento</button></div>';
  } else {
    $('#day-agenda').innerHTML = `<div class="day-agenda-list">${selectedEvents.map((event) => `<button class="agenda-event" data-action="edit-event" data-id="${escapeHtml(event.id)}"><span class="agenda-event-line" style="background:${categoryColor(event.category)}"></span><span class="agenda-event-content"><strong>${escapeHtml(event.title)}</strong><span><span class="line-icon">◷</span> ${event.time ? formatTime(event.time) : 'Tutto il giorno'}</span>${event.note ? `<small>${escapeHtml(event.note)}</small>` : ''}</span><span class="agenda-chevron">›</span></button>`).join('')}</div>`;
  }
  const today = dateKey(new Date());
  const upcoming = state.events.filter((event) => event.date >= today).sort((a, b) => `${a.date}T${a.time || '23:59'}`.localeCompare(`${b.date}T${b.time || '23:59'}`)).slice(0, 5);
  $('#upcoming-count').textContent = String(upcoming.length);
  $('#upcoming-list').innerHTML = upcoming.length ? upcoming.map((event) => {
    const date = parseDate(event.date);
    return `<button class="upcoming-event" data-action="go-to-event" data-date="${event.date}"><span class="upcoming-date"><b>${date.getDate()}</b><small>${MONTHS[date.getMonth()].slice(0, 3)}</small></span><span class="upcoming-copy"><strong>${escapeHtml(event.title)}</strong><small>${event.time ? formatTime(event.time) : 'Tutto il giorno'}</small></span><span class="upcoming-dot" style="background:${categoryColor(event.category)}"></span></button>`;
  }).join('') : '<p class="no-upcoming">Nessun evento in programma.</p>';
}

function renderSettings() {
  $('#color-options').innerHTML = COLORS.map((color) => `<button class="color-choice ${state.settings.accent === color.value ? 'chosen' : ''}" style="--choice-color:${color.value}" aria-label="${color.name}" title="${color.name}" data-color="${color.value}">${state.settings.accent === color.value ? '<span>✓</span>' : ''}</button>`).join('');
  $$('[data-week-start]').forEach((button) => button.classList.toggle('chosen', Number(button.dataset.weekStart) === state.settings.weekStartsOn));
}

function setMonth(date) {
  state.month = new Date(date.getFullYear(), date.getMonth(), 1);
  renderCalendar();
}

function openEventModal(event = {}) {
  const current = state.events.find((item) => item.id === event.id) || event;
  const isEditing = Boolean(current.id);
  const selectedDate = current.date || dateKey(state.selectedDate);
  const options = categories().map((category) => `<option value="${escapeHtml(category)}" ${current.category === category || (!current.category && category === DEFAULT_CATEGORIES[0]) ? 'selected' : ''}>${escapeHtml(category)}</option>`).join('');
  $('#modal-root').innerHTML = `<div class="modal-backdrop" data-action="backdrop-close"><section class="event-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-header"><div><span class="heading-overline">${isEditing ? 'MODIFICA EVENTO' : 'NUOVO APPUNTAMENTO'}</span><h2 id="modal-title">${isEditing ? 'I dettagli' : 'Crea un evento'}</h2></div><button class="icon-button" data-action="close-modal" aria-label="Chiudi">×</button></div><form id="event-form" data-id="${escapeHtml(current.id || '')}"><label class="field-label">Titolo<input name="title" required maxlength="100" value="${escapeHtml(current.title || '')}" placeholder="Es. Riunione di progetto"></label><div class="form-row"><label class="field-label">Data<input name="date" type="date" required value="${escapeHtml(selectedDate)}"></label><label class="field-label">Etichetta<select name="category">${options}</select></label></div><div class="time-field-row"><label class="field-label">Orario<input name="time" type="time" value="${escapeHtml(current.time || '09:00')}" ${current.time ? '' : 'disabled'}></label><label class="all-day-toggle"><input name="allDay" type="checkbox" ${current.time ? '' : 'checked'}><span class="custom-checkbox">✓</span> Tutto il giorno</label></div><label class="field-label">Note <span class="optional-label">OPZIONALE</span><textarea name="note" rows="3" maxlength="400" placeholder="Aggiungi qualche dettaglio...">${escapeHtml(current.note || '')}</textarea></label><span id="form-error" class="form-error" hidden></span><div class="modal-footer">${isEditing ? '<button class="delete-button" type="button" data-action="delete-event">♲ Elimina</button>' : ''}<button class="cancel-button" type="button" data-action="close-modal">Annulla</button><button class="save-button" type="submit">${isEditing ? 'Salva modifiche' : 'Crea evento'} <span>→</span></button></div></form></section></div>`;
  const form = $('#event-form');
  form.querySelector('[name="allDay"]').addEventListener('change', (change) => {
    form.querySelector('[name="time"]').disabled = change.target.checked;
  });
  form.addEventListener('submit', saveEvent);
  form.querySelector('[name="title"]').focus();
}

function openCategoryModal() {
  const swatches = COLORS.map((color, index) => `<button class="category-color-choice${index === 0 ? ' chosen' : ''}" type="button" data-label-color="${color.value}" aria-label="${color.name}" aria-pressed="${index === 0}" style="--choice-color:${color.value}"></button>`).join('');
  $('#modal-root').innerHTML = `<div class="modal-backdrop" data-action="backdrop-close"><section class="event-modal" role="dialog" aria-modal="true" aria-labelledby="category-title"><div class="modal-header"><div><span class="heading-overline">NUOVA ETICHETTA</span><h2 id="category-title">Crea un’etichetta</h2></div><button class="icon-button" data-action="close-modal" aria-label="Chiudi">×</button></div><form id="category-form" data-label-color-selected="${COLORS[0].value}"><label class="field-label">Nome<input name="category" required maxlength="30" placeholder="Es. Sport"></label><fieldset class="category-color-field"><legend>Colore</legend><div class="category-color-options">${swatches}</div></fieldset><span id="category-error" class="form-error" hidden></span><div class="modal-footer"><button class="cancel-button" type="button" data-action="close-modal">Annulla</button><button class="save-button" type="submit">Crea etichetta <span>→</span></button></div></form></section></div>`;
  const form = $('#category-form');
  form.querySelectorAll('[data-label-color]').forEach((button) => {
    button.addEventListener('click', () => {
      form.dataset.labelColorSelected = button.dataset.labelColor;
      form.querySelectorAll('[data-label-color]').forEach((option) => {
        const selected = option === button;
        option.classList.toggle('chosen', selected);
        option.setAttribute('aria-pressed', String(selected));
      });
    });
  });
  form.addEventListener('submit', saveCategory);
  form.querySelector('[name="category"]').focus();
}

async function saveCategory(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = form.querySelector('[type="submit"]');
  if (submit.disabled) return;
  const name = new FormData(form).get('category').trim();
  const error = $('#category-error');
  if (!name) {
    error.textContent = 'Inserisci un nome per l’etichetta.';
    error.hidden = false;
    return;
  }
  if (state.settings.categories.length >= 20) {
    error.textContent = 'Hai raggiunto il limite di 20 etichette personalizzate.';
    error.hidden = false;
    return;
  }
  if (categories().some((category) => category.toLocaleLowerCase('it') === name.toLocaleLowerCase('it'))) {
    error.textContent = 'Questa etichetta esiste già.';
    error.hidden = false;
    return;
  }
  submit.disabled = true;
  submit.textContent = 'Salvataggio…';
  try {
    const saved = await saveSettings({
      categories: [...state.settings.categories, name],
      categoryColors: { ...state.settings.categoryColors, [name]: form.dataset.labelColorSelected },
    });
    if (saved) {
      $('#modal-root').innerHTML = '';
      return;
    }
    error.textContent = $('#error-message').textContent || 'Etichetta non salvata. Riprova.';
    error.hidden = false;
  } finally {
    if (form.isConnected) {
      submit.disabled = false;
      submit.innerHTML = 'Crea etichetta <span>→</span>';
    }
  }
}

async function deleteCategory(category) {
  if (!state.settings.categories.includes(category) || state.saving) return;
  const events = state.events.filter((item) => item.category === category);
  const message = events.length
    ? `Eliminare "${category}"? ${events.length} ${events.length === 1 ? 'evento verrà spostato' : 'eventi verranno spostati'} in "Altro".`
    : `Eliminare l'etichetta "${category}"?`;
  if (!window.confirm(message)) return;

  state.saving = true;
  try {
    for (let index = 0; index < events.length; index += 450) {
      const batch = writeBatch(db);
      events.slice(index, index + 450).forEach((item) => {
        batch.update(doc(eventsPath(), item.id), { category: 'Altro' });
      });
      await batch.commit();
    }

    const { [category]: removedColor, ...categoryColors } = state.settings.categoryColors;
    const saved = await saveSettings({
      categories: state.settings.categories.filter((item) => item !== category),
      categoryColors,
    });
    if (!saved) showError(`Etichetta "${category}" non eliminata. Gli eventi sono stati spostati in "Altro".`);
  } catch (error) {
    showError(`Etichetta non eliminata: ${error.message}`);
  } finally {
    state.saving = false;
  }
}

async function saveEvent(event) {
  event.preventDefault();
  if (state.saving) return;
  const form = event.currentTarget;
  const formData = new FormData(form);
  const title = String(formData.get('title') || '').trim();
  const date = String(formData.get('date') || '');
  const error = $('#form-error');
  if (!title || !date) {
    error.textContent = 'Inserisci un titolo e una data per l’evento.';
    error.hidden = false;
    return;
  }
  state.saving = true;
  const saveButton = form.querySelector('.save-button');
  saveButton.disabled = true;
  saveButton.textContent = 'Salvataggio...';
  const eventId = form.dataset.id;
  const now = new Date().toISOString();
  const record = {
    title,
    date,
    time: formData.get('allDay') ? '' : String(formData.get('time') || ''),
    category: String(formData.get('category') || 'Lavoro'),
    note: String(formData.get('note') || '').trim(),
    updatedAt: now,
  };
  if (!eventId) record.createdAt = now;
  try {
    if (eventId) await setDoc(doc(eventsPath(), eventId), record);
    else await addDoc(eventsPath(), record);
    state.selectedDate = parseDate(date);
    setMonth(state.selectedDate);
    $('#modal-root').innerHTML = '';
  } catch (saveError) {
    showError(`Evento non salvato: ${saveError.message}`);
    error.textContent = `Evento non salvato: ${saveError.message}`;
    error.hidden = false;
    saveButton.disabled = false;
    saveButton.textContent = eventId ? 'Salva modifiche →' : 'Crea evento →';
  } finally {
    state.saving = false;
  }
}

async function deleteEvent() {
  const form = $('#event-form');
  const eventId = form?.dataset.id;
  if (!eventId || state.saving) return;
  state.saving = true;
  const button = form.querySelector('[data-action="delete-event"]');
  button.disabled = true;
  try {
    await deleteDoc(doc(eventsPath(), eventId));
    $('#modal-root').innerHTML = '';
  } catch (error) {
    showError(`Evento non eliminato: ${error.message}`);
    button.disabled = false;
  } finally {
    state.saving = false;
  }
}

async function saveSettings(updates) {
  const previous = { ...state.settings };
  state.settings = { ...state.settings, ...updates };
  updateAccent();
  renderCalendar();
  try {
    await setDoc(settingsPath(), state.settings, { merge: true });
    return true;
  } catch (error) {
    state.settings = previous;
    updateAccent();
    renderCalendar();
    showError(`Preferenze non salvate: ${error.message}`);
    return false;
  }
}

function stopListeners() {
  state.eventsStop?.();
  state.settingsStop?.();
  state.profileStop?.();
  state.eventsStop = null;
  state.settingsStop = null;
  state.profileStop = null;
}

function startListeners(user) {
  stopListeners();
  state.events = [];
  state.settings = { ...DEFAULT_SETTINGS };
  state.eventsLoaded = false;
  state.settingsLoaded = false;
  state.user = user;
  clearError();
  setProfileAvatar(null, user.displayName);
  $('#sync-status').innerHTML = '<span class="loader tiny"></span> Sincronizzazione';
  const refreshSyncStatus = () => {
    if (state.eventsLoaded && state.settingsLoaded) {
      $('#sync-status').innerHTML = '<span class="line-icon">☁</span> Sincronizzato';
    }
  };
  state.eventsStop = onSnapshot(eventsPath(), (snapshot) => {
    state.events = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    state.eventsLoaded = true;
    refreshSyncStatus();
    renderCalendar();
  }, (error) => {
    $('#sync-status').innerHTML = '<span class="line-icon">!</span> Errore sync';
    showError(`Non è stato possibile caricare gli eventi: ${error.message}`);
  });
  state.settingsStop = onSnapshot(settingsPath(), (snapshot) => {
    if (snapshot.exists()) {
      const data = snapshot.data();
      state.settings = {
        accent: COLORS.some(({ value }) => value === data.accent) ? data.accent : DEFAULT_SETTINGS.accent,
        weekStartsOn: data.weekStartsOn === 0 ? 0 : 1,
        categories: [...new Set((Array.isArray(data.categories) ? data.categories : [])
          .filter((category) => typeof category === 'string')
          .map((category) => category.trim())
          .filter((category) => category && !DEFAULT_CATEGORIES.includes(category)))].slice(0, 20),
        categoryColors: Object.fromEntries(Object.entries(data.categoryColors || {})
          .filter(([category, color]) => typeof category === 'string' && COLORS.some((option) => option.value === color))),
      };
    } else {
      state.settings = { ...DEFAULT_SETTINGS };
    }
    state.settingsLoaded = true;
    updateAccent();
    refreshSyncStatus();
    renderCalendar();
  }, (error) => {
    $('#sync-status').innerHTML = '<span class="line-icon">!</span> Errore sync';
    showError(`Non è stato possibile caricare le preferenze: ${error.message}`);
  });
  state.profileStop = onSnapshot(profilePath(), (snapshot) => {
    setProfileAvatar(snapshot.exists() ? snapshot.data().pfp : null, user.displayName);
  }, (error) => {
    showError(`Non è stato possibile caricare la foto profilo: ${error.message}`);
  });
}

function setSignedIn(user) {
  state.user = user;
  $('#loading-screen').hidden = true;
  if (!user || (user.email && !user.emailVerified)) {
    window.location.replace('../login/index.html');
    return;
  }
  $('#app-shell').hidden = false;
  $('#profile-name').textContent = user.displayName || 'Il tuo account';
  $('#profile-email').textContent = user.email || '';
  startListeners(user);
}

document.addEventListener('click', async (event) => {
  const target = event.target.closest('[data-action], [data-color], [data-week-start]');
  if (!target) {
    if (!event.target.closest('.profile-wrap')) $('#profile-menu').hidden = true;
    return;
  }
  const action = target.dataset.action;
  if (target.dataset.color) {
    await saveSettings({ accent: target.dataset.color });
    return;
  }
  if (target.dataset.weekStart !== undefined) {
    await saveSettings({ weekStartsOn: Number(target.dataset.weekStart) });
    return;
  }
  switch (action) {
    case 'toggle-sidebar':
      $('#workspace').classList.toggle('sidebar-is-open');
      break;
    case 'new-event':
      event.stopPropagation();
      openEventModal({ date: target.dataset.date || dateKey(state.selectedDate) });
      break;
    case 'new-category':
      openCategoryModal();
      break;
    case 'delete-category':
      await deleteCategory(target.dataset.category);
      break;
    case 'select-date': {
      const date = parseDate(target.dataset.date);
      state.selectedDate = date;
      if (target.closest('#mini-days') || date.getMonth() !== state.month.getMonth()) setMonth(date);
      else renderCalendar();
      $('#workspace').classList.remove('sidebar-is-open');
      break;
    }
    case 'previous-month':
      setMonth(new Date(state.month.getFullYear(), state.month.getMonth() - 1, 1));
      break;
    case 'next-month':
      setMonth(new Date(state.month.getFullYear(), state.month.getMonth() + 1, 1));
      break;
    case 'today':
      state.selectedDate = new Date();
      setMonth(state.selectedDate);
      break;
    case 'edit-event': {
      event.stopPropagation();
      const item = state.events.find((calendarEvent) => calendarEvent.id === target.dataset.id);
      if (item) openEventModal(item);
      break;
    }
    case 'go-to-event': {
      const date = parseDate(target.dataset.date);
      state.selectedDate = date;
      setMonth(date);
      break;
    }
    case 'toggle-settings':
      $('#settings-popover').hidden = !$('#settings-popover').hidden;
      break;
    case 'dismiss-error':
      clearError();
      break;
    case 'close-modal':
      $('#modal-root').innerHTML = '';
      break;
    case 'backdrop-close':
      if (event.target === target) $('#modal-root').innerHTML = '';
      break;
    case 'delete-event':
      await deleteEvent();
      break;
    case 'sign-out':
      $('#profile-menu').hidden = true;
      try {
        await signOut(auth);
      } catch (error) {
        showError(`Uscita non riuscita: ${error.message}`);
      }
      break;
    default:
      break;
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    $('#modal-root').innerHTML = '';
    $('#settings-popover').hidden = true;
    $('#profile-menu').hidden = true;
    $('#workspace').classList.remove('sidebar-is-open');
  }
  if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('.day-cell')) {
    event.preventDefault();
    const date = parseDate(event.target.dataset.date);
    state.selectedDate = date;
    renderCalendar();
  }
});

$('#profile-trigger').addEventListener('click', () => {
  $('#profile-menu').hidden = !$('#profile-menu').hidden;
});

onAuthStateChanged(auth, setSignedIn, (error) => {
  $('#loading-screen').hidden = true;
  showError(`Autenticazione non disponibile: ${error.message}`);
});
