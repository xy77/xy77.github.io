import './styles.css';
import { initBackgroundEffects } from './effects.js';

const input = document.getElementById('auth-password');
const errorMessage = document.getElementById('error-msg');

function verify() {
  if (window.handleLogin?.(input.value)) {
    window.checkAuth?.();
    return;
  }

  input.classList.add('border-red-500');
  errorMessage.classList.remove('opacity-0');
  errorMessage.textContent = 'ERROR';
  input.value = '';
  setTimeout(() => {
    input.classList.remove('border-red-500');
    errorMessage.classList.add('opacity-0');
  }, 3000);
}

input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') verify();
});

initBackgroundEffects({
  zIndex: -1,
  count: 399,
  clickWords: ['富强', '民主', '文明', '和谐', '自由', '平等', '公正', '法治', '爱国', '敬业', '诚信', '友善']
});
