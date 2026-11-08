// Manejo de Autenticación (Modo Local Instantáneo)
document.getElementById('loginBtn').addEventListener('click', () => handleAuth('login'));
document.getElementById('signupBtn').addEventListener('click', () => handleAuth('signup'));

function handleAuth(type) {
  const emailInput = document.getElementById('emailInput');
  const email = emailInput.value.trim() || 'pirata@isla.com';
  user = { email, name: email.split('@')[0] };
  
  if (type === 'signup') {
    authStatus.textContent = `¡Cuenta creada con éxito! Bienvenido a bordo, ${user.name}.`;
  } else {
    authStatus.textContent = `¡Sesión iniciada como ${user.name}!`;
  }
  
  playerInfo.textContent = `Pirata Activo: ${user.name}`;
}
