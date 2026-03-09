document.addEventListener('DOMContentLoaded', () => {
  document.documentElement.dataset.surface = 'sidepanel';

  const helpButton = document.getElementById('open-help-link');
  if (helpButton) {
    helpButton.addEventListener('click', () => {
      chrome.tabs.create({ url: 'https://heysalad.app/help' });
    });
  }
});
