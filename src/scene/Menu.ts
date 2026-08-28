import type { PlayerState, Team } from '../types';
import { PlayerTokens } from './PlayerTokens';

const TEAM_LABELS: Record<Team, string> = {
	home: 'LOCAL',
	away: 'VISITANTE',
	goalkeeper: 'PORTERO',
};

export class Menu {
	private readonly root: HTMLElement;
	private readonly players: PlayerTokens;
	private readonly panel: HTMLElement;
	private readonly list: HTMLDivElement;
	private readonly form: HTMLFormElement;
	private readonly openButton: HTMLButtonElement;
	private readonly closeButton: HTMLButtonElement;
	private editingId?: string;

	constructor(root: HTMLElement, players: PlayerTokens) {
		this.root = root;
		this.players = players;
		this.panel = document.createElement('aside');
		this.panel.className = 'player-menu is-hidden';
		this.panel.innerHTML = `
			<div class="player-menu__header"><div><p class="menu-kicker">ROSTER / 10</p><h2>PLAYERS</h2></div></div>
			<form class="player-form">
				<input name="name" placeholder="Nombre" required maxlength="14" />
				<input name="number" type="number" min="0" max="99" placeholder="#" required />
				<select name="team"><option value="home">LOCAL</option><option value="away">VISITANTE</option><option value="goalkeeper">PORTERO</option></select>
				<div class="player-form__actions"><button class="button button--primary" type="submit">Añadir jugador</button><button class="button button--quiet" type="button" data-cancel>Cancelar</button></div>
			</form>
			<div class="player-list"></div>`;
		root.appendChild(this.panel);
		const menuControls = document.createElement('div');
		menuControls.className = 'menu-controls';
		this.openButton = document.createElement('button');
		this.openButton.className = 'menu-open';
		this.openButton.classList.add('is-intro-hidden');
		this.openButton.type = 'button';
		this.openButton.textContent = 'ROSTER';
		this.openButton.setAttribute('aria-label', 'Abrir panel de jugadores');
		this.openButton.addEventListener('click', () => {
			this.panel.classList.remove('is-hidden');
			this.closeButton.classList.remove('is-hidden');
		});
		this.closeButton = document.createElement('button');
		this.closeButton.className = 'menu-close is-hidden';
		this.closeButton.type = 'button';
		this.closeButton.textContent = '×';
		this.closeButton.setAttribute('aria-label', 'Cerrar panel');
		this.closeButton.addEventListener('click', () => {
			this.panel.classList.add('is-hidden');
			this.closeButton.classList.add('is-hidden');
		});
		menuControls.append(this.openButton, this.closeButton);
		root.appendChild(menuControls);
		this.list = this.panel.querySelector('.player-list') as HTMLDivElement;
		this.form = this.panel.querySelector('form') as HTMLFormElement;
		this.panel.querySelector('[data-cancel]')!.addEventListener('click', () => this.resetForm());
		this.form.addEventListener('submit', this.handleSubmit);
		this.render();
	}

	public setIntroVisible(isIntroVisible: boolean): void {
		this.openButton.classList.toggle('is-intro-hidden', isIntroVisible);
		this.closeButton.classList.add('is-hidden');
		if (isIntroVisible) this.panel.classList.add('is-hidden');
	}

	public dispose(): void {
		this.form.removeEventListener('submit', this.handleSubmit);
		this.panel.remove();
		this.openButton.parentElement?.remove();
	}

	private render(): void {
		this.list.replaceChildren(...this.players.players.map((player) => this.renderPlayer(player)));
		const kicker = this.panel.querySelector('.menu-kicker');
		if (kicker) kicker.textContent = `ROSTER / ${this.players.players.length}`;
	}

	private renderPlayer(player: PlayerState): HTMLDivElement {
		const item = document.createElement('div');
		item.className = `player-row player-row--${player.team}`;
		item.innerHTML = `<span class="player-row__number">${player.number}</span><span class="player-row__info"><strong></strong><small>${TEAM_LABELS[player.team]}</small></span><button type="button" class="row-action" data-edit aria-label="Editar jugador">✎</button><button type="button" class="row-action row-action--delete" data-delete aria-label="Eliminar jugador">×</button>`;
		item.querySelector('strong')!.textContent = player.name;
		item.querySelector('[data-edit]')!.addEventListener('click', () => this.startEdit(player));
		item.querySelector('[data-delete]')!.addEventListener('click', () => {
			this.players.removePlayer(player.id);
			this.render();
		});
		return item;
	}

	private startEdit(player: PlayerState): void {
		this.editingId = player.id;
		(this.form.elements.namedItem('name') as HTMLInputElement).value = player.name;
		(this.form.elements.namedItem('number') as HTMLInputElement).value = String(player.number);
		(this.form.elements.namedItem('team') as HTMLSelectElement).value = player.team;
		(this.form.querySelector('.button--primary') as HTMLButtonElement).textContent = 'Guardar cambios';
	}

	private readonly handleSubmit = (event: SubmitEvent): void => {
		event.preventDefault();
		const name = (this.form.elements.namedItem('name') as HTMLInputElement).value.trim().toUpperCase();
		const number = Number((this.form.elements.namedItem('number') as HTMLInputElement).value);
		const team = (this.form.elements.namedItem('team') as HTMLSelectElement).value as Team;
		if (!name || !Number.isInteger(number)) return;
		if (this.editingId) {
			this.players.updatePlayer(this.editingId, { name, number, team });
		} else {
			this.players.addPlayer({ id: `player-${crypto.randomUUID()}`, name, number, team, position: { x: 0, y: 0.18, z: 0 } });
		}
		this.resetForm();
		this.render();
	};

	private resetForm(): void {
		this.editingId = undefined;
		this.form.reset();
		(this.form.querySelector('.button--primary') as HTMLButtonElement).textContent = 'Añadir jugador';
	}
}
