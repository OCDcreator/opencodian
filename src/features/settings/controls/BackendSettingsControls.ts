import { Setting } from 'obsidian';

import { t,type TranslationKey } from '../../../i18n';
import { createLogger } from '../../../shared';

const logger = createLogger('BackendSettingsControls');

/** Where a backend setting lives. Rendered as a scope badge and `data-backend-scope`. */
export type BackendSettingScope = 'vault' | 'project' | 'global' | 'shared' | 'session';

/** When a backend setting change becomes observable. Rendered as an effect badge and `data-backend-effect`. */
export type BackendSettingEffect = 'immediate' | 'next-turn' | 'new-session' | 'reconnect' | 'restart';

/** How risky an accidental change is. Rendered as a risk badge and `data-backend-risk`. */
export type BackendSettingRisk = 'low' | 'medium' | 'high';

/**
 * Honest metadata for a backend setting row: scope, application timing, risk,
 * default value, and provenance. `defaultLabel` and `source` arrive
 * pre-localized from the consumer so this module never re-translates backend
 * vocabulary it does not own.
 */
export interface BackendSettingPresentation {
	/** Stable identifier surfaced as `data-backend-key` for tests and CSS hooks. */
	key?: string;
	scope: BackendSettingScope;
	effect: BackendSettingEffect;
	risk?: BackendSettingRisk;
	/** Pre-localized default value text, e.g. the result of `t('settings.x.default')`. */
	defaultLabel?: string;
	/** Pre-localized provenance text, e.g. "global config" or "server readback". */
	source?: string;
}

/** One selectable choice in a backend choice row. Labels arrive pre-localized. */
export interface BackendChoiceOption {
	value: string;
	label: string;
	description?: string;
	/** Renders the localized "Recommended" badge next to the label. */
	recommended?: boolean;
}

/** Options for {@link addBackendChoiceSetting}. */
export interface AddBackendChoiceSettingOptions {
	key?: string;
	/** Pre-localized row name; also the accessible name of the radio group. */
	name: string;
	/** Pre-localized row description. */
	description?: string;
	/** Currently committed choice; the rollback target when `onChange` fails. */
	value: string;
	options: BackendChoiceOption[];
	onChange: (value: string) => void | Promise<void>;
	presentation: BackendSettingPresentation;
	/** Start with every radio disabled. */
	disabled?: boolean;
}

/** Options for {@link addBackendSliderSetting}. */
export interface AddBackendSliderSettingOptions {
	key?: string;
	/** Pre-localized row name; also the accessible label of the range input. */
	name: string;
	/** Pre-localized row description. */
	description?: string;
	/** Currently committed value; the rollback target when `onChange` fails. */
	value: number;
	min: number;
	max: number;
	/** Snap increment. Defaults to 1; values above 1 render discrete mode. */
	step?: number;
	/** Powers the localized reset-to-default button when provided. */
	defaultValue?: number;
	/** Pre-localized formatter for the visible readout and bounds. Defaults to `String(value)`. */
	formatValue?: (value: number) => string;
	onChange: (value: number) => void | Promise<void>;
	presentation: BackendSettingPresentation;
	/** Start with the slider and reset button disabled. */
	disabled?: boolean;
}

const SCOPE_LABEL_KEYS: Record<BackendSettingScope, string> = {
	vault: 'settings.backend.meta.scope.vault',
	project: 'settings.backend.meta.scope.project',
	global: 'settings.backend.meta.scope.global',
	shared: 'settings.backend.meta.scope.shared',
	session: 'settings.backend.meta.scope.session',
};

const EFFECT_LABEL_KEYS: Record<BackendSettingEffect, string> = {
	immediate: 'settings.backend.meta.effect.immediate',
	'next-turn': 'settings.backend.meta.effect.nextTurn',
	'new-session': 'settings.backend.meta.effect.newSession',
	reconnect: 'settings.backend.meta.effect.reconnect',
	restart: 'settings.backend.meta.effect.restart',
};

const RISK_LABEL_KEYS: Record<BackendSettingRisk, string> = {
	low: 'settings.backend.meta.risk.low',
	medium: 'settings.backend.meta.risk.medium',
	high: 'settings.backend.meta.risk.high',
};

/** Monotonic counter so repeated renders never share radio group names or label ids. */
let controlSequence = 0;

function translateKey(key: string, params?: Record<string, string | number>): string {
	return t(key as TranslationKey, params);
}

/**
 * Decorates an existing Obsidian `Setting` with honest backend metadata
 * badges. The owner keeps full control of name, description, and control
 * content; this only appends a metadata block after the description and sets
 * `data-backend-*` attributes on the setting element.
 *
 * Returns the same `Setting` so calls chain with the owner's own builders.
 */
export function describeBackendSetting(setting: Setting, presentation: BackendSettingPresentation): Setting {
	const settingEl = setting.settingEl;
	if (presentation.key) {
		settingEl.dataset.backendKey = presentation.key;
	}
	settingEl.dataset.backendScope = presentation.scope;
	settingEl.dataset.backendEffect = presentation.effect;
	if (presentation.risk) {
		settingEl.dataset.backendRisk = presentation.risk;
	}

	const ownerDocument = settingEl.ownerDocument;
	const metaEl = ownerDocument.createElement('div');
	metaEl.className = 'opencodian-backend-field-meta';

	appendMetaBadge(metaEl, ownerDocument, 'scope', {
		axis: translateKey('settings.backend.meta.scope'),
		value: translateKey(SCOPE_LABEL_KEYS[presentation.scope]),
	});
	appendMetaBadge(metaEl, ownerDocument, 'effect', {
		axis: translateKey('settings.backend.meta.effect'),
		value: translateKey(EFFECT_LABEL_KEYS[presentation.effect]),
	});
	if (presentation.risk) {
		appendMetaBadge(metaEl, ownerDocument, `risk risk--${presentation.risk}`, {
			axis: translateKey('settings.backend.meta.risk'),
			value: translateKey(RISK_LABEL_KEYS[presentation.risk]),
		});
	}
	if (presentation.defaultLabel) {
		appendMetaBadge(metaEl, ownerDocument, 'default', {
			axis: translateKey('settings.backend.meta.default'),
			value: presentation.defaultLabel,
		});
	}
	if (presentation.source) {
		appendMetaBadge(metaEl, ownerDocument, 'source', {
			axis: translateKey('settings.backend.meta.source'),
			value: presentation.source,
		});
	}

	const descEl = settingEl.querySelector<HTMLElement>('.setting-item-description');
	(descEl ?? settingEl).appendChild(metaEl);
	return setting;
}

function appendMetaBadge(metaEl: HTMLElement, ownerDocument: Document, modifier: string, badge: { axis: string; value: string }): void {
	const badgeEl = ownerDocument.createElement('span');
	// `modifier` may carry a space-separated chain ("risk risk--high"); every
	// token lives under the shared `opencodian-backend-field-` namespace.
	const badgeClasses = [`opencodian-backend-field-badge`, ...modifier.split(' ').map((token) => `opencodian-backend-field-${token}`)];
	badgeEl.className = badgeClasses.join(' ');
	const axisEl = ownerDocument.createElement('span');
	axisEl.className = 'opencodian-backend-field-badge-axis';
	axisEl.textContent = badge.axis;
	const valueEl = ownerDocument.createElement('span');
	valueEl.className = 'opencodian-backend-field-badge-value';
	valueEl.textContent = badge.value;
	badgeEl.appendChild(axisEl);
	badgeEl.appendChild(valueEl);
	metaEl.appendChild(badgeEl);
}

/**
 * Adds a choice-oriented backend setting row backed by native radio inputs.
 *
 * Contract highlights:
 * - The returned `Setting` is plain; consumers sync external value changes by
 *   re-rendering the row (owner rerender), not through a mutable handle.
 * - The displayed choice advances only after `onChange` resolves. On failure
 *   the checked state rolls back to the committed value and the localized
	 *   generic failure is announced in the mounted status region. Raw errors
	 *   reach neither the UI nor logs; diagnostics record only a fixed safe message.
 * - A committed value outside `options` renders as a checked disabled
 *   "current (unlisted)" radio instead of silently selecting a default.
 */
export function addBackendChoiceSetting(container: HTMLElement, opts: AddBackendChoiceSettingOptions): Setting {
	const ownerDocument = container.ownerDocument;
	const setting = new Setting(container);
	const sequence = ++controlSequence;
	const controlKey = opts.key ?? `choice-${sequence}`;

	setting.setName(opts.name);
	// Always render a description element so the metadata badges have their
	// canonical home even when the caller passes no description text.
	setting.setDesc(opts.description ?? '');
	setting.settingEl.dataset.backendKey = opts.key ?? controlKey;
	// Render the presentation metadata (scope/effect/risk/default/source) on
	// this row directly so consumers get the honest badges without chaining
	// describeBackendSetting themselves.
	describeBackendSetting(setting, opts.presentation);

	const nameEl = setting.settingEl.querySelector<HTMLElement>('.setting-item-name');
	if (nameEl && !nameEl.id) {
		nameEl.id = `opencodian-backend-choice-name-${sequence}`;
	}

	const groupEl = ownerDocument.createElement('div');
	groupEl.className = 'opencodian-backend-choice-group';
	groupEl.setAttribute('role', 'radiogroup');
	if (nameEl?.id) {
		groupEl.setAttribute('aria-labelledby', nameEl.id);
	} else {
		groupEl.setAttribute('aria-label', opts.name);
	}
	groupEl.dataset.backendKey = controlKey;

	const errorEl = ownerDocument.createElement('div');
	errorEl.className = 'opencodian-backend-choice-error';
	errorEl.id = `opencodian-backend-choice-error-${sequence}`;
	errorEl.setAttribute('role', 'status');
	errorEl.setAttribute('aria-live', 'polite');

	const radioName = `opencodian-backend-choice-${controlKey}-${sequence}`;
	const committed = { current: opts.value };
	let pending = false;

	interface ChoiceEntry {
		input: HTMLInputElement;
		labelEl: HTMLLabelElement;
		permanentlyDisabled: boolean;
	}
	const entries: ChoiceEntry[] = [];

	function createChoiceEntry(option: { value: string; label: string; description?: string; recommended?: boolean }, permanentlyDisabled: boolean): ChoiceEntry {
		const labelEl = ownerDocument.createElement('label');
		labelEl.className = 'opencodian-backend-choice';
		labelEl.dataset.choiceValue = option.value;

		const input = ownerDocument.createElement('input');
		input.type = 'radio';
		input.name = radioName;
		input.value = option.value;
		input.className = 'opencodian-backend-choice-input';
		input.setAttribute('aria-describedby', errorEl.id);
		if (permanentlyDisabled) {
			input.disabled = true;
		}
		input.addEventListener('change', () => {
			void handleChange(input);
		});
		input.addEventListener('focus', () => {
			labelEl.classList.add('opencodian-backend-choice--focused');
		});
		input.addEventListener('blur', () => {
			labelEl.classList.remove('opencodian-backend-choice--focused');
		});

		const textEl = ownerDocument.createElement('span');
		textEl.className = 'opencodian-backend-choice-text';
		const labelSpanEl = ownerDocument.createElement('span');
		labelSpanEl.className = 'opencodian-backend-choice-label';
		labelSpanEl.textContent = option.label;
		textEl.appendChild(labelSpanEl);
		if (option.description) {
			const descSpanEl = ownerDocument.createElement('span');
			descSpanEl.className = 'opencodian-backend-choice-desc';
			descSpanEl.textContent = option.description;
			textEl.appendChild(descSpanEl);
		}
		if (option.recommended) {
			const badgeEl = ownerDocument.createElement('span');
			badgeEl.className = 'opencodian-backend-choice-badge';
			badgeEl.textContent = translateKey('settings.backend.choice.recommended');
			textEl.appendChild(badgeEl);
		}

		labelEl.appendChild(input);
		labelEl.appendChild(textEl);
		groupEl.appendChild(labelEl);
		return { input, labelEl, permanentlyDisabled };
	}

	for (const option of opts.options) {
		entries.push(createChoiceEntry(option, false));
	}
	// Preserve an inherited/unknown committed value instead of silently
	// defaulting: render it as a checked but disabled unlisted radio.
	if (!entries.some((entry) => entry.input.value === committed.current)) {
		const unlistedEntry = createChoiceEntry({
			value: committed.current,
			label: translateKey('settings.backend.choice.unlisted', { value: committed.current }),
		}, true);
		unlistedEntry.labelEl.classList.add('opencodian-backend-choice--unlisted');
		entries.unshift(unlistedEntry);
		// createChoiceEntry appended the label last; move it to the front of
		// the group so DOM order matches the entries order.
		groupEl.insertBefore(unlistedEntry.labelEl, groupEl.firstChild);
	}

	const controlEl = setting.controlEl;
	controlEl.appendChild(groupEl);
	controlEl.appendChild(errorEl);

	function paintChecked(value: string): void {
		for (const entry of entries) {
			const checked = entry.input.value === value;
			entry.input.checked = checked;
			entry.labelEl.classList.toggle('opencodian-backend-choice--is-checked', checked);
		}
	}

	function setInteractionDisabled(disabled: boolean): void {
		for (const entry of entries) {
			entry.input.disabled = disabled || entry.permanentlyDisabled;
			entry.labelEl.classList.toggle('opencodian-backend-choice--disabled', entry.input.disabled);
		}
	}

	function announceError(message: string): void {
		errorEl.textContent = message;
		groupEl.classList.add('opencodian-backend-choice-group--has-error');
	}

	function clearError(): void {
		errorEl.textContent = '';
		groupEl.classList.remove('opencodian-backend-choice-group--has-error');
	}

	async function handleChange(input: HTMLInputElement): Promise<void> {
		if (pending || input.disabled) {
			paintChecked(committed.current);
			return;
		}
		const nextValue = input.value;
		pending = true;
		groupEl.classList.add('opencodian-backend-choice-group--is-busy');
		setInteractionDisabled(true);
		clearError();
		paintChecked(nextValue);
		try {
			await opts.onChange(nextValue);
			committed.current = nextValue;
			paintChecked(nextValue);
		} catch {
			// Backend rejections can carry endpoint or credential detail; log a
			// safe generic message only, never the raw error.
			logger.warn('Backend choice change was rejected; the committed value was restored');
			paintChecked(committed.current);
			announceError(translateKey('settings.backend.choice.error'));
		} finally {
			pending = false;
			groupEl.classList.remove('opencodian-backend-choice-group--is-busy');
			setInteractionDisabled(opts.disabled ?? false);
		}
	}

	paintChecked(committed.current);
	setInteractionDisabled(opts.disabled ?? false);
	return setting;
}

/**
 * Adds a backend setting row backed by a native range input with a visible
 * value readout and an optional reset-to-default button.
 *
 * Contract highlights:
 * - Plain `Setting` return; external sync happens via owner rerender.
 * - `input` events update only the visible readout; `change` (release)
 *   commits: busy state, `await onChange`, rollback + localized generic
 *   failure announcement on rejection.
 * - The committed value only advances after `onChange` resolves.
 */
export function addBackendSliderSetting(container: HTMLElement, opts: AddBackendSliderSettingOptions): Setting {
	const ownerDocument = container.ownerDocument;
	const setting = new Setting(container);
	const sequence = ++controlSequence;
	const controlKey = opts.key ?? `slider-${sequence}`;

	setting.setName(opts.name);
	setting.setDesc(opts.description ?? '');
	setting.settingEl.dataset.backendKey = opts.key ?? controlKey;
	describeBackendSetting(setting, opts.presentation);

	const format = opts.formatValue ?? ((value: number) => String(value));
	const step = opts.step ?? 1;
	const committed = { current: clampAndSnap(opts.value, opts.min, opts.max, step) };

	const wrapperEl = ownerDocument.createElement('div');
	wrapperEl.className = 'opencodian-backend-slider';
	if (step > 1) {
		wrapperEl.classList.add('opencodian-backend-slider--discrete');
	}
	wrapperEl.dataset.backendKey = controlKey;

	const errorEl = ownerDocument.createElement('div');
	errorEl.className = 'opencodian-backend-slider-error';
	errorEl.id = `opencodian-backend-slider-error-${sequence}`;
	errorEl.setAttribute('role', 'status');
	errorEl.setAttribute('aria-live', 'polite');

	const inputId = `opencodian-backend-slider-${sequence}`;
	const boundsEl = ownerDocument.createElement('div');
	boundsEl.className = 'opencodian-backend-slider-bounds';
	const minEl = ownerDocument.createElement('span');
	minEl.className = 'opencodian-backend-slider-bound opencodian-backend-slider-bound--min';
	minEl.textContent = format(opts.min);
	const maxEl = ownerDocument.createElement('span');
	maxEl.className = 'opencodian-backend-slider-bound opencodian-backend-slider-bound--max';
	maxEl.textContent = format(opts.max);
	boundsEl.appendChild(minEl);
	boundsEl.appendChild(maxEl);

	const inputEl = ownerDocument.createElement('input');
	inputEl.type = 'range';
	inputEl.id = inputId;
	inputEl.name = inputId;
	inputEl.className = 'opencodian-backend-slider-input';
	inputEl.min = String(opts.min);
	inputEl.max = String(opts.max);
	inputEl.step = String(step);
	inputEl.value = String(committed.current);
	inputEl.setAttribute('aria-label', opts.name);
	inputEl.setAttribute('aria-describedby', errorEl.id);

	const readoutEl = ownerDocument.createElement('output');
	readoutEl.className = 'opencodian-backend-slider-value';
	readoutEl.setAttribute('for', inputId);
	readoutEl.setAttribute('aria-live', 'polite');

	const resetEl = ownerDocument.createElement('button');
	resetEl.type = 'button';
	resetEl.className = 'opencodian-backend-slider-reset';
	resetEl.textContent = translateKey('settings.backend.slider.reset');

	wrapperEl.appendChild(boundsEl);
	wrapperEl.appendChild(inputEl);
	wrapperEl.appendChild(readoutEl);
	if (opts.defaultValue !== undefined) {
		wrapperEl.appendChild(resetEl);
	}
	wrapperEl.appendChild(errorEl);

	const controlEl = setting.controlEl;
	controlEl.appendChild(wrapperEl);

	let pending = false;

	function paintValue(value: number): void {
		inputEl.value = String(value);
		readoutEl.textContent = format(value);
	}

	function setInteractionDisabled(disabled: boolean): void {
		inputEl.disabled = disabled;
		resetEl.disabled = disabled;
		wrapperEl.classList.toggle('opencodian-backend-slider--disabled', disabled);
	}

	function announceError(message: string): void {
		errorEl.textContent = message;
		wrapperEl.classList.add('opencodian-backend-slider--has-error');
	}

	function clearError(): void {
		errorEl.textContent = '';
		wrapperEl.classList.remove('opencodian-backend-slider--has-error');
	}

	function beginCommit(): void {
		pending = true;
		wrapperEl.classList.add('opencodian-backend-slider--is-busy');
		setInteractionDisabled(true);
		clearError();
	}

	function endCommit(): void {
		pending = false;
		wrapperEl.classList.remove('opencodian-backend-slider--is-busy');
		setInteractionDisabled(opts.disabled ?? false);
	}

	async function commit(nextValue: number): Promise<void> {
		if (pending) {
			paintValue(committed.current);
			return;
		}
		beginCommit();
		paintValue(nextValue);
		try {
			await opts.onChange(nextValue);
			committed.current = nextValue;
			paintValue(nextValue);
		} catch {
			// Backend rejections can carry endpoint or credential detail; log a
			// safe generic message only, never the raw error.
			logger.warn('Backend slider change was rejected; the committed value was restored');
			paintValue(committed.current);
			announceError(translateKey('settings.backend.slider.error'));
		} finally {
			endCommit();
		}
	}

	inputEl.addEventListener('input', () => {
		// Live preview only; the committed change happens on release (`change`).
		readoutEl.textContent = format(Number(inputEl.value));
	});
	inputEl.addEventListener('change', () => {
		if (pending || inputEl.disabled) {
			paintValue(committed.current);
			return;
		}
		void commit(clampAndSnap(Number(inputEl.value), opts.min, opts.max, step));
	});
	resetEl.addEventListener('click', () => {
		if (opts.defaultValue === undefined || pending || opts.disabled) {
			return;
		}
		void commit(clampAndSnap(opts.defaultValue, opts.min, opts.max, step));
	});

	paintValue(committed.current);
	setInteractionDisabled(opts.disabled ?? false);
	return setting;
}

/** Clamp `value` into `[min, max]` and snap it onto the `step` grid. */
function clampAndSnap(value: number, min: number, max: number, step: number): number {
	const safeStep = step > 0 ? step : 1;
	const stepped = min + Math.round((value - min) / safeStep) * safeStep;
	// Avoid float dust such as 0.30000000000000004 after snapping.
	const snapped = Number(stepped.toFixed(6));
	return Math.min(max, Math.max(min, snapped));
}
