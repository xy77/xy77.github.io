export function initUi() {
  const statusMessage = document.getElementById('status-message');
  const modalErrorDialog = document.getElementById('modal-error-dialog');
  const modalErrorMessage = document.getElementById('modal-error-message');
  const modalErrorClose = document.getElementById('modal-error-close');
  const dialogIds = ['publish-modal', 'download-modal', 'publish-token-modal', 'share-modal'];

  function isDialogPageOpen() {
    return dialogIds.some((id) => !document.getElementById(id).classList.contains('hidden'));
  }

  function showModalError(text) {
    modalErrorMessage.textContent = text;
    modalErrorDialog.classList.replace('hidden', 'flex');
    setTimeout(() => modalErrorClose.focus(), 0);
  }

  function hideModalError() {
    modalErrorDialog.classList.replace('flex', 'hidden');
  }

  function showMessage(text, isError = false) {
    if (isError && isDialogPageOpen()) {
      showModalError(text);
      return;
    }

    statusMessage.textContent = text;
    statusMessage.className = `min-w-0 flex-1 truncate text-sm px-3 py-2 rounded-lg ${
      isError ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
    }`;
    statusMessage.classList.remove('hidden');
    setTimeout(() => statusMessage.classList.add('hidden'), 6000);
  }

  modalErrorClose.addEventListener('click', hideModalError);
  modalErrorDialog.addEventListener('click', (event) => {
    if (event.target === modalErrorDialog) hideModalError();
  });

  return { hideModalError, showMessage };
}
