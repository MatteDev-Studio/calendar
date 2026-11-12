import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js';
import {
  createUserWithEmailAndPassword, deleteUser, getAuth, onAuthStateChanged, reload,
  sendEmailVerification, signInWithEmailAndPassword, signOut, updateProfile,
} from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js';
import {
  doc, getDoc, getFirestore, runTransaction, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';

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

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

let mode = 'login';
let signingUp = false;

const params = new URLSearchParams(location.search);
const fallbackRedirectUrl = new URL('../app/index.html', location.href).href;
const redirectUrl = (() => {
  try {
    const url = new URL(params.get('redirect') || '');
    const isMatteDev = url.protocol === 'https:'
      && (url.hostname === 'mattedev.com' || url.hostname.endsWith('.mattedev.com'));
    return isMatteDev ? url.href : fallbackRedirectUrl;
  } catch {
    return fallbackRedirectUrl;
  }
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
const errText = (error) => ERRORS[error.code] || ERRORS[error.message] || error.message;

function setMsg(element, text, type = 'error') {
  element.textContent = text;
  element.hidden = !text;
  element.classList.toggle('success', type === 'success');
  element.classList.toggle('error', type === 'error');
}

function show(screen) {
  for (const id of ['loading', 'auth', 'verify', 'done']) {
    $(`#${id}-screen`).hidden = id !== screen;
  }
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

async function signUp(username, email, password) {
  if (!USERNAME_RE.test(username)) throw new Error('username-invalid');
  const usernameRef = doc(db, 'usernames', username);
  if ((await getDoc(usernameRef)).exists()) throw new Error('username-taken');

  signingUp = true;
  let user;
  try {
    ({ user } = await createUserWithEmailAndPassword(auth, email, password));
  } catch (error) {
    signingUp = false;
    throw error;
  }
  try {
    await updateProfile(user, { displayName: username });
    await runTransaction(db, async (transaction) => {
      if ((await transaction.get(usernameRef)).exists()) throw new Error('username-taken');
      transaction.set(usernameRef, { uid: user.uid, createdAt: serverTimestamp() });
      transaction.set(doc(db, 'users', user.uid), { username, createdAt: serverTimestamp() });
    });
  } catch (error) {
    try {
      await deleteUser(user);
    } catch (cleanupError) {
      signingUp = false;
      render(auth.currentUser);
      const message = `${errText(error)} Non è stato possibile rimuovere l'account incompleto: ${errText(cleanupError)}`;
      const target = auth.currentUser?.email && !auth.currentUser.emailVerified
        ? $('#verify-message')
        : $('#auth-error');
      setMsg(target, message);
      return;
    }
    signingUp = false;
    render(auth.currentUser);
    throw error;
  }

  signingUp = false;
  render(user);
  try {
    await sendEmailVerification(user);
    setMsg($('#verify-message'), 'Email di verifica inviata. Controlla anche lo spam.', 'success');
  } catch (error) {
    setMsg($('#verify-message'), `Invio email non riuscito: ${errText(error)}`);
  }
}

$('#auth-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  setMsg($('#auth-error'), '');
  const formData = new FormData(event.currentTarget);
  const email = String(formData.get('email') || '').trim();
  const password = String(formData.get('password') || '');
  const username = String(formData.get('username') || '').trim().toLowerCase();
  const button = $('#auth-submit');
  button.disabled = true;
  try {
    if (mode === 'signup') await signUp(username, email, password);
    else await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    setMsg($('#auth-error'), `${mode === 'signup' ? 'Registrazione' : 'Accesso'} non riuscito: ${errText(error)}`);
  } finally {
    button.disabled = false;
  }
});

$$('[data-mode]').forEach((tab) => tab.addEventListener('click', () => {
  mode = tab.dataset.mode;
  const isSignup = mode === 'signup';
  for (const [id, active] of [['login-tab', !isSignup], ['signup-tab', isSignup]]) {
    $(`#${id}`).classList.toggle('active', active);
    $(`#${id}`).setAttribute('aria-selected', String(active));
  }
  $('#auth-title').textContent = isSignup ? 'Crea account' : 'Bentornato';
  $('#auth-subtitle').textContent = isSignup ? 'Un solo account per tutte le app MatteDev.' : 'Accedi al tuo account MatteDev.';
  $('#auth-submit').innerHTML = `<span>${isSignup ? 'Registrati' : 'Accedi'}</span><span aria-hidden="true">→</span>`;
  $('#username-field').hidden = !isSignup;
  $('#username-field input').required = isSignup;
  $('#auth-form [name="password"]').autocomplete = isSignup ? 'new-password' : 'current-password';
  setMsg($('#auth-error'), '');
}));

$('#check-verification').addEventListener('click', async () => {
  const button = $('#check-verification');
  button.disabled = true;
  try {
    if (!auth.currentUser) throw new Error('Sessione scaduta. Accedi di nuovo.');
    await reload(auth.currentUser);
    if (!auth.currentUser.emailVerified) {
      return setMsg($('#verify-message'), 'Email non ancora verificata.');
    }
    render(auth.currentUser);
  } catch (error) {
    setMsg($('#verify-message'), `Verifica non riuscita: ${errText(error)}`);
  } finally {
    button.disabled = false;
  }
});

$('#resend-verification').addEventListener('click', async () => {
  try {
    if (!auth.currentUser) throw new Error('Sessione scaduta. Accedi di nuovo.');
    await sendEmailVerification(auth.currentUser);
    setMsg($('#verify-message'), 'Email reinviata. Controlla anche lo spam.', 'success');
  } catch (error) {
    setMsg($('#verify-message'), `Invio non riuscito: ${errText(error)}`);
  }
});

$('#verify-sign-out').addEventListener('click', async () => {
  try {
    await signOut(auth);
  } catch (error) {
    setMsg($('#verify-message'), `Uscita non riuscita: ${errText(error)}`);
  }
});

$('#done-sign-out').addEventListener('click', async () => {
  try {
    await signOut(auth);
  } catch (error) {
    $('#done-name').textContent = `Impossibile uscire: ${errText(error)}`;
  }
});

onAuthStateChanged(auth, render, (error) => {
  show('auth');
  setMsg($('#auth-error'), `Autenticazione non disponibile: ${error.message}`);
});
