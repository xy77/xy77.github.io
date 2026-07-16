export const config = Object.freeze({
  owner: 'xy77',
  repo: 'zen',
  publicBaseUrl: 'https://xy77.github.io',
  projectManifest: 'projects.json',
  branch: 'main'
});

export const secondaryRootFolder = '2';

export function encodeGitHubPath(value) {
  return value.split('/').map(encodeURIComponent).join('/');
}
