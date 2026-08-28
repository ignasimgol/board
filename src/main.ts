import './styles.css';
import { BasketballScene } from './scene/FootballScene';

const sceneRoot = document.querySelector<HTMLDivElement>('#scene');

if (!sceneRoot) {
  throw new Error('Scene root element was not found.');
}

const basketballScene = new BasketballScene(sceneRoot);
basketballScene.start();

const introScreen = document.querySelector<HTMLElement>('.intro-screen');
const enterButton = document.querySelector<HTMLButtonElement>('.intro-enter');
const hud = document.querySelector<HTMLElement>('.hud');
const app = document.querySelector<HTMLElement>('#app');
const menu = document.querySelector<HTMLElement>('.player-menu');
const menuOpen = document.querySelector<HTMLElement>('.menu-open');

app?.classList.add('intro-active');

window.addEventListener('pointermove', (event) => {
  const x = (event.clientX / window.innerWidth) * 2 - 1;
  const y = (event.clientY / window.innerHeight) * 2 - 1;
  basketballScene.setIntroPointer(x, y);
});

const enterScene = (): void => {
  introScreen?.classList.add('is-dismissed');
  hud?.classList.add('is-hidden');
  app?.classList.remove('intro-active');
  menu?.classList.remove('is-hidden');
  menuOpen?.classList.remove('is-intro-hidden');
  basketballScene.setIntroParallaxEnabled(false);
};

enterButton?.addEventListener('click', enterScene);
window.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !introScreen?.classList.contains('is-dismissed')) enterScene();
});
