const tabs = document.querySelectorAll('.tab');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const errBox = document.getElementById('err');

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    errBox.classList.remove('show');
    if (tab.dataset.tab === 'login') {
      loginForm.classList.remove('hidden');
      registerForm.classList.add('hidden');
    } else {
      loginForm.classList.add('hidden');
      registerForm.classList.remove('hidden');
    }
  });
});

function showError(msg) {
  errBox.textContent = msg;
  errBox.classList.add('show');
}

async function submitForm(url, payload) {
  errBox.classList.remove('show');
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      credentials: 'same-origin',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Fehler');
    window.location.href = '/lobby.html';
  } catch (err) {
    showError(err.message);
  }
}

loginForm.addEventListener('submit', (e) => {
  e.preventDefault();
  submitForm('/api/login', {
    username: document.getElementById('l-username').value,
    password: document.getElementById('l-password').value,
  });
});

registerForm.addEventListener('submit', (e) => {
  e.preventDefault();
  submitForm('/api/register', {
    username: document.getElementById('r-username').value,
    password: document.getElementById('r-password').value,
  });
});

// If already logged in, skip to lobby
fetch('/api/me', { credentials: 'same-origin' })
  .then(r => r.ok ? r.json() : null)
  .then(user => { if (user) window.location.href = '/lobby.html'; })
  .catch(() => {});
