import './styles.css';
import { BasketballScene } from './scene/FootballScene';

const sceneRoot = document.querySelector<HTMLDivElement>('#scene');

if (!sceneRoot) {
  throw new Error('Scene root element was not found.');
}

const basketballScene = new BasketballScene(sceneRoot);
basketballScene.start();
