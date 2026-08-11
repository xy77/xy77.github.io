import './styles.css';
import { initBackgroundEffects } from './effects.js';
import { initEditor } from './editor.js';
import { createProjectApi } from './project-api.js';
import { initPublish } from './publish.js';
import { initPublishToken } from './publish-token.js';
import { initShare } from './share.js';
import { initSidebar } from './sidebar.js';
import { initUi } from './ui.js';

const clickWords = [
  '富强', '😄', '民主', '😊', '文明', '🤔', '和谐', '😦', '自由', '😙', '平等', '😋',
  '公正', '🤪', '法治', '🤠', '爱国', '🤭', '敬业', '🤩', '诚信', '🥰', '友善', '😳'
];

initBackgroundEffects({ zIndex: 99, count: 399, clickWords });

const taskView = document.getElementById('task-view');
let blankFocused = false;
let spacePresses = [];
document.body.addEventListener('click', (event) => {
  blankFocused = event.target === document.body;
  if (blankFocused) document.body.focus({ preventScroll: true });
});
document.addEventListener('keydown', (event) => {
  if (event.code !== 'Space' || event.repeat || !blankFocused || event.target !== document.body) return;
  event.preventDefault();
  const now = Date.now();
  spacePresses = spacePresses.filter(time => now - time < 900);
  spacePresses.push(now);
  if (spacePresses.length >= 4) {
    taskView.classList.remove('hidden');
    taskView.setAttribute('aria-hidden', 'false');
    spacePresses = [];
  }
});
taskView?.addEventListener('click', (event) => {
  if (event.target === taskView) {
    taskView.classList.add('hidden');
    taskView.setAttribute('aria-hidden', 'true');
  }
});

const ui = initUi();
const tokenStore = initPublishToken(ui);
const api = createProjectApi(tokenStore.get);
const sidebar = initSidebar({ api, showMessage: ui.showMessage });
let share = null;

try {
  const editor = await initEditor({
    showMessage: ui.showMessage,
    onShare: () => share?.open()
  });
  share = initShare({ editor, getToken: tokenStore.get, showMessage: ui.showMessage });
  const publish = initPublish({
    editor,
    api,
    sidebar,
    tokenStore,
    showMessage: ui.showMessage
  });

  tokenStore.subscribe(() => {
    api.reset();
    sidebar.reset();
    publish.refreshIfOpen();
    sidebar.load('');
  });

  if (share.isShareLocation()) await share.loadFromLocation();
  await sidebar.load('');
} catch (error) {
  ui.showMessage(error.message || '编辑器初始化失败', true);
  console.error(error);
}
