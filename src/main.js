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
