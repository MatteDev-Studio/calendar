import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js';
import {
  createUserWithEmailAndPassword, deleteUser, getAuth, onAuthStateChanged, reload,
  sendEmailVerification, signInWithEmailAndPassword, signOut, updateProfile,
} from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js';
import {
  doc, getFirestore, runTransaction, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';

// Le chiavi web Firebase sono pubbliche; la sicurezza sta nelle Rules.
const firebaseApp = initializeApp({
  apiKey: 'AIzaSyC7Tbqt5FzJK8Z_USkCMWxXiHZp8uRN26A',
  authDomain: 'mattedev-account.firebaseapp.com',
  projectId: 'mattedev-account',
  storageBucket: 'mattedev-account.firebasestorage.app',
  messagingSenderId: '77268069903',
  appId: '1:77268069903:web:040aa6c3981eb3650afd7a',
});
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

let mode = 'login';
let signingUp = false; // evita redirect/verify prima di finire la registrazione

// --- Redirect sicuro: solo https su mattedev.com e sottodomini ---
const params = new URLSearchParams(location.search);
const redirectUrl = (() => {
  try {
    const u = new URL(params.get('redirect') || '');
    const ok = u.protocol === 'https:' && (u.hostname === 'mattedev.com' || u.hostname.endsWith('.mattedev.com'));
    return ok ? u.href : null;
  } catch { return null; }
})();
const appName = (params.get('app') || '').slice(0, 40);
if (appName) {
  const hint = $('#app-hint');
  hint.textContent = `Per continuare su ${appName}`;
  hint.hidden = false;
}

const ERRORS = {
  'auth/invalid-credential': 'Email o password errati.',
  'auth/invalid-email': 'Email non valida.',
  'auth/email-already-in-use': 'Email già registrata.',
  'auth/weak-password': 'Password troppo debole.',
  'auth/too-many-requests': 'Troppi tentativi. Riprova tra poco.',
  'auth/network-request-failed': 'Errore di rete.',
  'username-taken': 'Username già in uso.',
  'username-invalid': 'Username non valido: 3-20 caratteri, solo lettere, numeri e _.',
};
const errText = (e) => ERRORS[e.code] || ERRORS[e.message] || e.message;

function setMsg(el, text, type = 'error') {
  el.textContent = text;
  el.hidden = !text;
  el.classList.toggle('success', type === 'success');
  el.classList.toggle('error', type === 'error');
}

function show(screen) {
  for (const id of ['loading', 'auth', 'verify', 'done']) $(`#${id}-screen`).hidden = id !== screen;
}

function render(user) {
  if (signingUp) return;
  if (!user) return show('auth');
  if (user.email && !user.emailVerified) {
    $('#verify-email').textContent = user.email;
    return show('verify');
  }
  if (redirectUrl) return location.replace(redirectUrl);
  $('#done-name').textContent = user.displayName || user.email;
  show('done');
}

// --- Registrazione: crea utente, riserva username in transazione ---
async function signUp(username, email, password) {
  if (!USERNAME_RE.test(username)) throw new Error('username-invalid');
  const ref = doc(db, 'usernames', username);

  signingUp = true;
  const { user } = await createUserWithEmailAndPassword(auth, email, password);
  try {
    await runTransaction(db, async (tx) => {
      if ((await tx.get(ref)).exists()) throw new Error('username-taken');
      tx.set(ref, { uid: user.uid, createdAt: serverTimestamp() });
      tx.set(doc(db, 'users', user.uid), { username, createdAt: serverTimestamp() });
    });
    await updateProfile(user, { displayName: username });
  } catch (e) {
    await deleteUser(user).catch(() => {});
    signingUp = false;
    throw e;
  }
  await sendEmailVerification(user);
  signingUp = false;
  render(auth.currentUser);
  setMsg($('#verify-message'), 'Email di verifica inviata. Controlla anche lo spam.', 'success');
}

$('#auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  setMsg($('#auth-error'), '');
  const f = new FormData(e.currentTarget);
  const email = String(f.get('email') || '').trim();
  const password = String(f.get('password') || '');
  const username = String(f.get('username') || '').trim().toLowerCase();
  const btn = $('#auth-submit');
  btn.disabled = true;
  try {
    if (mode === 'signup') await signUp(username, email, password);
    else await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    setMsg($('#auth-error'), `${mode === 'signup' ? 'Registrazione' : 'Accesso'} non riuscito: ${errText(err)}`);
  } finally {
    btn.disabled = false;
  }
});

$$('[data-mode]').forEach((tab) => tab.addEventListener('click', () => {
  mode = tab.dataset.mode;
  const s = mode === 'signup';
  for (const [id, on] of [['login-tab', !s], ['signup-tab', s]]) {
    $(`#${id}`).classList.toggle('active', on);
    $(`#${id}`).setAttribute('aria-selected', String(on));
  }
  $('#auth-title').textContent = s ? 'Crea account' : 'Bentornato';
  $('#auth-subtitle').textContent = s ? 'Un solo account per tutte le app MatteDev.' : 'Accedi al tuo account MatteDev.';
  $('#auth-submit').innerHTML = `<span>${s ? 'Registrati' : 'Accedi'}</span><span aria-hidden="true">→</span>`;
  $('#username-field').hidden = !s;
  $('#username-field input').required = s;
  $('#auth-form [name="password"]').autocomplete = s ? 'new-password' : 'current-password';
  setMsg($('#auth-error'), '');
}));

$('#check-verification').addEventListener('click', async () => {
  const btn = $('#check-verification');
  btn.disabled = true;
  try {
    if (!auth.currentUser) throw new Error('Sessione scaduta. Accedi di nuovo.');
    await reload(auth.currentUser);
    if (!auth.currentUser.emailVerified) return setMsg($('#verify-message'), 'Email non ancora verificata.');
    render(auth.currentUser);
  } catch (err) {
    setMsg($('#verify-message'), `Verifica non riuscita: ${errText(err)}`);
  } finally {
    btn.disabled = false;
  }
});

$('#resend-verification').addEventListener('click', async () => {
  try {
    if (!auth.currentUser) throw new Error('Sessione scaduta. Accedi di nuovo.');
    await sendEmailVerification(auth.currentUser);
    setMsg($('#verify-message'), 'Email reinviata. Controlla anche lo spam.', 'success');
  } catch (err) {
    setMsg($('#verify-message'), `Invio non riuscito: ${errText(err)}`);
  }
});

for (const id of ['#verify-sign-out', '#done-sign-out']) {
  $(id).addEventListener('click', () => signOut(auth).catch((err) => setMsg($('#verify-message'), errText(err))));
}

onAuthStateChanged(auth, render, (err) => {
  show('auth');
  setMsg($('#auth-error'), `Autenticazione non disponibile: ${err.message}`);
});
