import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js';
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signOut,
} from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js';

const firebaseApp = initializeApp({
  apiKey: 'AIzaSyC7Tbqt5FzJK8Z_USkCMWxXiHZp8uRN26A',
  authDomain: 'mattedev-account.firebaseapp.com',
  projectId: 'mattedev-account',
  storageBucket: 'mattedev-account.firebasestorage.app',
  messagingSenderId: '77268069903',
  appId: '1:77268069903:web:040aa6c3981eb3650afd7a',
});
const auth = getAuth(firebaseApp);
let authMode = 'login';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function showMessage(message, type = 'error') {
  const element = $('#verification-message');
  element.textContent = message;
  element.hidden = false;
  element.classList.toggle('success-message', type === 'success');
  element.classList.toggle('error-message', type === 'error');
}

function showLoginError(message) {
  const element = $('#login-error');
  element.textContent = message;
  element.hidden = false;
}

function updateScreen(user) {
  $('#loading-screen').hidden = true;
  if (user?.email && !user.emailVerified) {
    $('#login-screen').hidden = true;
    $('#verification-screen').hidden = false;
    $('#verification-email').textContent = user.email;
    return;
  }
  $('#verification-screen').hidden = true;
  $('#login-screen').hidden = Boolean(user);
  if (user) window.location.replace('../app/index.html');
}

$('#auth-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  $('#login-error').hidden = true;
  const formData = new FormData(event.currentTarget);
  const email = String(formData.get('email') || '').trim();
  const password = String(formData.get('password') || '');
  const submit = $('#auth-submit');
  submit.disabled = true;
  try {
    if (authMode === 'signup') {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      await sendEmailVerification(credential.user);
      showMessage('Email di verifica inviata. Controlla la posta in arrivo e la cartella spam.', 'success');
    } else {
      await signInWithEmailAndPassword(auth, email, password);
    }
  } catch (error) {
    showLoginError(`${authMode === 'signup' ? 'Creazione account' : 'Accesso'} non riuscito: ${error.message}`);
  } finally {
    submit.disabled = false;
  }
});

$$('[data-auth-mode]').forEach((tab) => tab.addEventListener('click', () => {
  authMode = tab.dataset.authMode;
  const isSignup = authMode === 'signup';
  $('#login-tab').classList.toggle('active', !isSignup);
  $('#login-tab').setAttribute('aria-selected', String(!isSignup));
  $('#signup-tab').classList.toggle('active', isSignup);
  $('#signup-tab').setAttribute('aria-selected', String(isSignup));
  $('#auth-title').textContent = isSignup ? 'Crea account' : 'Bentornato';
  $('#auth-subtitle').textContent = isSignup ? 'Registrati per iniziare a organizzare i tuoi impegni.' : 'Accedi al tuo account per continuare.';
  $('#auth-submit').innerHTML = `<span>${isSignup ? 'Registrati' : 'Accedi'}</span><span aria-hidden="true">→</span>`;
  $('#auth-form [name="password"]').autocomplete = authMode === 'signup' ? 'new-password' : 'current-password';
  $('#login-error').hidden = true;
}));

$('#check-verification').addEventListener('click', async () => {
  const button = $('#check-verification');
  button.disabled = true;
  try {
    if (!auth.currentUser) throw new Error('La sessione è scaduta. Accedi di nuovo.');
    await reload(auth.currentUser);
    if (!auth.currentUser.emailVerified) {
      showMessage('Email non ancora verificata. Apri il link ricevuto e riprova.');
      return;
    }
    updateScreen(auth.currentUser);
  } catch (error) {
    showMessage(`Verifica non riuscita: ${error.message}`);
  } finally {
    button.disabled = false;
  }
});

$('#resend-verification').addEventListener('click', async () => {
  try {
    if (!auth.currentUser) throw new Error('La sessione è scaduta. Accedi di nuovo.');
    await sendEmailVerification(auth.currentUser);
    showMessage('Email di verifica inviata di nuovo. Controlla anche la cartella spam.', 'success');
  } catch (error) {
    showMessage(`Invio non riuscito: ${error.message}`);
  }
});

$('#verification-sign-out').addEventListener('click', async () => {
  try {
    await signOut(auth);
  } catch (error) {
    showMessage(`Uscita non riuscita: ${error.message}`);
  }
});

onAuthStateChanged(auth, updateScreen, (error) => {
  $('#loading-screen').hidden = true;
  $('#login-screen').hidden = false;
  showLoginError(`Autenticazione non disponibile: ${error.message}`);
});
