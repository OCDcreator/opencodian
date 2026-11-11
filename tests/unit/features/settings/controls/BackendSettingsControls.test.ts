/* eslint-disable max-lines -- Metadata, choice, and slider contracts share one focused fixture suite. */
import { Setting } from 'obsidian';

import {
	addBackendChoiceSetting,
	addBackendSliderSetting,
	type BackendChoiceOption,
	describeBackendSetting,
} from '../../../../../src/features/settings/controls/BackendSettingsControls';
import { setLocale, t } from '../../../../../src/i18n';

// The controls module resolves its logger through src/shared. Mock the whole
// module so the failure-path logger calls are observable; the factory owns
// the warn spy so it exists before the mocked module is first required.
jest.mock('../../../../../src/shared', () => {
	const warn = jest.fn();
	return {
		__mockLoggerWarn: warn,
		createLogger: () => ({
			debug: jest.fn(),
			info: jest.fn(),
			warn,
			error: jest.fn(),
		}),
	};
});

function getMockLoggerWarn(): jest.Mock {
	const mocked = jest.requireMock('../../../../../src/shared') as { __mockLoggerWarn: jest.Mock };
	return mocked.__mockLoggerWarn;
}

const BASE_PRESENTATION = {
	scope: 'vault',
	effect: 'immediate',
} as const;

const RISKY_PRESENTATION = {
	scope: 'global',
	effect: 'restart',
	risk: 'high',
	defaultLabel: 'ask every turn',
	source: 'global config',
} as const;

function createDeferred(): { promise: Promise<void>; resolve: () => void; reject: (error: unknown) => void } {
	let resolve!: () => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<void>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

async function flushMicrotasks(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
}

function getRadioInputs(setting: Setting): HTMLInputElement[] {
	return [...setting.settingEl.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
}

function getCheckedRadio(setting: Setting): HTMLInputElement {
	const checked = getRadioInputs(setting).find((input) => input.checked);
	expect(checked).toBeDefined();
	return checked as HTMLInputElement;
}

function selectRadio(setting: Setting, value: string): HTMLInputElement {
	const input = getRadioInputs(setting).find((candidate) => candidate.value === value);
	expect(input).toBeDefined();
	const radio = input as HTMLInputElement;
	radio.checked = true;
	radio.dispatchEvent(new Event('change', { bubbles: true }));
	return radio;
}

function getChoiceGroup(setting: Setting): HTMLElement {
	const groupEl = setting.settingEl.querySelector<HTMLElement>('.opencodian-backend-choice-group');
	expect(groupEl).not.toBeNull();
	return groupEl as HTMLElement;
}

function getErrorRegion(setting: Setting, selector: string): HTMLElement {
	const errorEl = setting.settingEl.querySelector<HTMLElement>(selector);
	expect(errorEl).not.toBeNull();
	return errorEl as HTMLElement;
}

function getSliderInput(setting: Setting): HTMLInputElement {
	const inputEl = setting.settingEl.querySelector<HTMLInputElement>('input[type="range"]');
	expect(inputEl).not.toBeNull();
	return inputEl as HTMLInputElement;
}

const baseChoiceOptions: BackendChoiceOption[] = [
	{ value: 'ask', label: 'Ask every turn', description: 'Prompt before each write.' },
	{ value: 'allow', label: 'Allow edits', recommended: true },
	{ value: 'danger-full-access', label: 'Full access', description: 'No sandbox. High risk.' },
];

beforeAll(() => {
	// Pin the locale so t() assertions are deterministic in any runner order.
	setLocale('en');
	// The shared obsidian mock's Setting only creates settingEl/controlEl.
	// Provide the real name/description DOM the plugin relies on, following
	// the pattern used by the other settings-section suites.
	jest.spyOn(Setting.prototype, 'setName').mockImplementation(function (this: Setting, text) {
		this.settingEl.createDiv({ cls: 'setting-item-name', text: String(text) });
		return this;
	});
	jest.spyOn(Setting.prototype, 'setDesc').mockImplementation(function (this: Setting, text) {
		let description = this.settingEl.querySelector<HTMLElement>('.setting-item-description');
		description ??= this.settingEl.createDiv({ cls: 'setting-item-description' });
		description.textContent = String(text);
		return this;
	});
});

describe('describeBackendSetting', () => {
	it('appends localized metadata badges into the description and sets data attributes', () => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		const setting = new Setting(container);
		setting.setName('Approval policy');
		setting.setDesc('Controls how writes are approved.');

		const returned = describeBackendSetting(setting, { ...RISKY_PRESENTATION, key: 'approval.policy' });

		expect(returned).toBe(setting);
		expect(setting.settingEl.dataset.backendKey).toBe('approval.policy');
		expect(setting.settingEl.dataset.backendScope).toBe('global');
		expect(setting.settingEl.dataset.backendEffect).toBe('restart');
		expect(setting.settingEl.dataset.backendRisk).toBe('high');

		const descEl = setting.settingEl.querySelector<HTMLElement>('.setting-item-description');
		expect(descEl).not.toBeNull();
		const metaEl = descEl?.querySelector<HTMLElement>('.opencodian-backend-field-meta');
		expect(metaEl).not.toBeNull();

		const badgeText = (modifier: string): { axis: string; value: string } => {
			const badgeEl = metaEl?.querySelector<HTMLElement>(`.opencodian-backend-field-${modifier}`);
			expect(badgeEl).not.toBeNull();
			return {
				axis: badgeEl?.querySelector<HTMLElement>('.opencodian-backend-field-badge-axis')?.textContent ?? '',
				value: badgeEl?.querySelector<HTMLElement>('.opencodian-backend-field-badge-value')?.textContent ?? '',
			};
		};

		expect(badgeText('scope')).toEqual({ axis: t('settings.backend.meta.scope'), value: t('settings.backend.meta.scope.global') });
		expect(badgeText('effect')).toEqual({ axis: t('settings.backend.meta.effect'), value: t('settings.backend.meta.effect.restart') });
		expect(badgeText('risk')).toEqual({ axis: t('settings.backend.meta.risk'), value: t('settings.backend.meta.risk.high') });
		expect(badgeText('default')).toEqual({ axis: t('settings.backend.meta.default'), value: 'ask every turn' });
		expect(badgeText('source')).toEqual({ axis: t('settings.backend.meta.source'), value: 'global config' });
		expect(badgeElHasRiskModifier(metaEl as HTMLElement)).toBe(true);
	});

	it('omits optional badges and falls back to the setting element when no description exists', () => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		const setting = new Setting(container);

		describeBackendSetting(setting, { ...BASE_PRESENTATION });

		expect(setting.settingEl.dataset.backendRisk).toBeUndefined();
		const metaEl = setting.settingEl.querySelector<HTMLElement>('.opencodian-backend-field-meta');
		expect(metaEl).not.toBeNull();
		// No description element -> the meta block is mounted on the setting element itself.
		expect(metaEl?.parentElement).toBe(setting.settingEl);
		expect(metaEl?.querySelector('.opencodian-backend-field-risk')).toBeNull();
		expect(metaEl?.querySelector('.opencodian-backend-field-default')).toBeNull();
		expect(metaEl?.querySelector('.opencodian-backend-field-source')).toBeNull();
		expect(setting.settingEl.querySelector('.opencodian-backend-field-risk--low')).toBeNull();
	});

	it('renders each risk level with its own modifier class', () => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		const setting = new Setting(container);
		setting.setDesc('d');
		describeBackendSetting(setting, { scope: 'session', effect: 'next-turn', risk: 'low' });
		expect(setting.settingEl.querySelector('.opencodian-backend-field-risk--low')).not.toBeNull();

		const second = new Setting(container);
		second.setDesc('d');
		describeBackendSetting(second, { scope: 'session', effect: 'next-turn', risk: 'medium' });
		expect(second.settingEl.querySelector('.opencodian-backend-field-risk--medium')).not.toBeNull();
	});
});

function badgeElHasRiskModifier(metaEl: HTMLElement): boolean {
	return metaEl.querySelector('.opencodian-backend-field-risk.opencodian-backend-field-risk--high') !== null;
}

describe('addBackendChoiceSetting', () => {
	let container: HTMLElement;

	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
	});

	it('renders an accessible native radio group with labels, descriptions, and recommended badge', () => {
		const setting = addBackendChoiceSetting(container, {
			key: 'approval.policy',
			name: 'Approval policy',
			description: 'Choose how file writes are approved.',
			value: 'ask',
			options: baseChoiceOptions,
			onChange: () => undefined,
			presentation: { ...BASE_PRESENTATION },
		});

		const groupEl = getChoiceGroup(setting);
		expect(groupEl.getAttribute('role')).toBe('radiogroup');
		const nameEl = setting.settingEl.querySelector<HTMLElement>('.setting-item-name');
		expect(nameEl?.id).toBeTruthy();
		expect(groupEl.getAttribute('aria-labelledby')).toBe(nameEl?.id);

		const radios = getRadioInputs(setting);
		expect(radios).toHaveLength(3);
		expect(new Set(radios.map((radio) => radio.name)).size).toBe(1);
		expect(getCheckedRadio(setting).value).toBe('ask');

		const labels = [...groupEl.querySelectorAll<HTMLElement>('.opencodian-backend-choice')];
		expect(labels[0]?.querySelector('.opencodian-backend-choice-label')?.textContent).toBe('Ask every turn');
		expect(labels[0]?.querySelector('.opencodian-backend-choice-desc')?.textContent).toBe('Prompt before each write.');
		expect(labels[0]?.classList.contains('opencodian-backend-choice--is-checked')).toBe(true);
		expect(labels[1]?.querySelector('.opencodian-backend-choice-badge')?.textContent).toBe(t('settings.backend.choice.recommended'));
		expect(labels[2]?.querySelector('.opencodian-backend-choice-badge')).toBeNull();

		// Presentation metadata is rendered on the row itself.
		expect(setting.settingEl.querySelector('.opencodian-backend-field-scope')).not.toBeNull();
		expect(setting.settingEl.querySelector('.opencodian-backend-field-effect')).not.toBeNull();
		// The controls never carry native title attributes.
		expect(setting.settingEl.querySelectorAll('[title]')).toHaveLength(0);
		// No select is created, so dropdown enhancers have nothing to grab.
		expect(setting.settingEl.querySelector('select')).toBeNull();
	});

	it('preserves an inherited value outside the known options as a checked disabled unlisted radio', () => {
		const setting = addBackendChoiceSetting(container, {
			name: 'Approval policy',
			value: 'inherited-custom',
			options: baseChoiceOptions,
			onChange: () => undefined,
			presentation: { ...BASE_PRESENTATION },
		});

		const radios = getRadioInputs(setting);
		expect(radios).toHaveLength(4);
		const unlistedRadio = radios.find((radio) => radio.value === 'inherited-custom');
		expect(unlistedRadio).toBeDefined();
		expect(unlistedRadio?.checked).toBe(true);
		expect(unlistedRadio?.disabled).toBe(true);
		const unlistedLabel = unlistedRadio?.closest('.opencodian-backend-choice');
		expect(unlistedLabel?.classList.contains('opencodian-backend-choice--unlisted')).toBe(true);
		expect(unlistedLabel?.querySelector('.opencodian-backend-choice-label')?.textContent).toBe(
			t('settings.backend.choice.unlisted', { value: 'inherited-custom' }),
		);
		// The unlisted option is the first choice, before the known options.
		expect(getChoiceGroup(setting).querySelector('.opencodian-backend-choice')?.querySelector('input')?.value).toBe('inherited-custom');
	});

	it('paints optimistically, disables inputs while onChange is pending, and commits on success', async () => {
		const deferred = createDeferred();
		const onChange = jest.fn(() => deferred.promise);
		const setting = addBackendChoiceSetting(container, {
			name: 'Sandbox',
			value: 'ask',
			options: baseChoiceOptions,
			onChange,
			presentation: { ...BASE_PRESENTATION },
		});

		selectRadio(setting, 'allow');
		expect(onChange).toHaveBeenCalledWith('allow');

		const groupEl = getChoiceGroup(setting);
		expect(groupEl.classList.contains('opencodian-backend-choice-group--is-busy')).toBe(true);
		expect(getRadioInputs(setting).every((radio) => radio.disabled)).toBe(true);
		expect(getCheckedRadio(setting).value).toBe('allow');

		deferred.resolve();
		await flushMicrotasks();

		expect(groupEl.classList.contains('opencodian-backend-choice-group--is-busy')).toBe(false);
		expect(getRadioInputs(setting).every((radio) => !radio.disabled)).toBe(true);
		expect(getCheckedRadio(setting).value).toBe('allow');
	});

	it('rolls the displayed choice back and announces a localized generic failure when onChange rejects', async () => {
		const deferred = createDeferred();
		const onChange = jest.fn().mockReturnValueOnce(deferred.promise).mockResolvedValue(undefined);
		const setting = addBackendChoiceSetting(container, {
			key: 'approval.policy',
			name: 'Approval policy',
			value: 'ask',
			options: baseChoiceOptions,
			onChange,
			presentation: { ...BASE_PRESENTATION },
		});

		selectRadio(setting, 'danger-full-access');
		deferred.reject(new Error('backend secret token leaked here'));
		await flushMicrotasks();

		expect(getCheckedRadio(setting).value).toBe('ask');
		const groupEl = getChoiceGroup(setting);
		expect(groupEl.classList.contains('opencodian-backend-choice-group--has-error')).toBe(true);
		const errorEl = getErrorRegion(setting, '.opencodian-backend-choice-error');
		expect(errorEl.getAttribute('role')).toBe('status');
		expect(errorEl.getAttribute('aria-live')).toBe('polite');
		expect(errorEl.textContent).toBe(t('settings.backend.choice.error'));
		// The raw rejection text must never reach the DOM.
		expect(setting.settingEl.textContent).not.toContain('secret token');
		// ...and never reach the logs either: the rejection is logged as a
		// fixed safe generic message with no error payload attached.
		const mockLoggerWarn = getMockLoggerWarn();
		expect(mockLoggerWarn).toHaveBeenCalled();
		const loggedText = JSON.stringify(mockLoggerWarn.mock.calls);
		expect(loggedText).not.toContain('secret token');
		expect(loggedText).not.toContain('Error');
		expect(groupEl.classList.contains('opencodian-backend-choice-group--is-busy')).toBe(false);
		// A later successful change clears the error state.
		selectRadio(setting, 'allow');
		await flushMicrotasks();
		expect(groupEl.classList.contains('opencodian-backend-choice-group--has-error')).toBe(false);
		expect(errorEl.textContent).toBe('');
	});

	it('ignores changes while a commit is pending and restores the committed paint', async () => {
		const deferred = createDeferred();
		const onChange = jest.fn(() => deferred.promise);
		const setting = addBackendChoiceSetting(container, {
			name: 'Sandbox',
			value: 'ask',
			options: baseChoiceOptions,
			onChange,
			presentation: { ...BASE_PRESENTATION },
		});

		selectRadio(setting, 'allow');
		// A second change during the pending commit is ignored.
		selectRadio(setting, 'danger-full-access');
		expect(onChange).toHaveBeenCalledTimes(1);
		expect(getCheckedRadio(setting).value).toBe('ask');

		deferred.resolve();
		await flushMicrotasks();
		expect(getCheckedRadio(setting).value).toBe('allow');
	});

	it('starts fully disabled when requested and ignores changes', () => {
		const onChange = jest.fn();
		const setting = addBackendChoiceSetting(container, {
			name: 'Sandbox',
			value: 'ask',
			options: baseChoiceOptions,
			onChange,
			presentation: { ...BASE_PRESENTATION },
			disabled: true,
		});

		expect(getRadioInputs(setting).every((radio) => radio.disabled)).toBe(true);
		selectRadio(setting, 'allow');
		expect(onChange).not.toHaveBeenCalled();
		expect(getCheckedRadio(setting).value).toBe('ask');
		const labels = [...getChoiceGroup(setting).querySelectorAll('.opencodian-backend-choice')];
		expect(labels.every((label) => label.classList.contains('opencodian-backend-choice--disabled'))).toBe(true);
	});

	it('toggles the focused class on the owning label for focus-visible styling', () => {
		const setting = addBackendChoiceSetting(container, {
			name: 'Sandbox',
			value: 'ask',
			options: baseChoiceOptions,
			onChange: () => undefined,
			presentation: { ...BASE_PRESENTATION },
		});

		const radio = getRadioInputs(setting)[1] as HTMLInputElement;
		radio.focus();
		expect(radio.closest('.opencodian-backend-choice')?.classList.contains('opencodian-backend-choice--focused')).toBe(true);
		radio.blur();
		expect(radio.closest('.opencodian-backend-choice')?.classList.contains('opencodian-backend-choice--focused')).toBe(false);
	});

	it('announces failure once per failed commit and keeps aria wiring on every radio', async () => {
		const setting = addBackendChoiceSetting(container, {
			name: 'Sandbox',
			value: 'ask',
			options: baseChoiceOptions,
			onChange: () => {
				throw new Error('failure');
			},
			presentation: { ...BASE_PRESENTATION },
		});

		const errorEl = getErrorRegion(setting, '.opencodian-backend-choice-error');
		for (const radio of getRadioInputs(setting)) {
			expect(radio.getAttribute('aria-describedby')).toBe(errorEl.id);
		}
		selectRadio(setting, 'allow');
		await flushMicrotasks();
		expect(getCheckedRadio(setting).value).toBe('ask');
	});
});

describe('addBackendSliderSetting', () => {
	let container: HTMLElement;

	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
	});

	it('renders a labeled range input with visible bounds, live readout, and presentation metadata', () => {
		const formatValue = (value: number): string => `${value}px`;
		const setting = addBackendSliderSetting(container, {
			key: 'history.limit',
			name: 'History limit',
			value: 45,
			min: 0,
			max: 100,
			step: 5,
			defaultValue: 50,
			formatValue,
			onChange: () => undefined,
			presentation: { ...RISKY_PRESENTATION, key: 'history.limit' },
		});

		const inputEl = getSliderInput(setting);
		expect(inputEl.min).toBe('0');
		expect(inputEl.max).toBe('100');
		expect(inputEl.step).toBe('5');
		expect(inputEl.getAttribute('aria-label')).toBe('History limit');
		// Initial value snaps onto the step grid.
		expect(inputEl.value).toBe('45');

		const readoutEl = setting.settingEl.querySelector<HTMLElement>('.opencodian-backend-slider-value');
		expect(readoutEl?.textContent).toBe('45px');
		expect(readoutEl?.getAttribute('for')).toBe(inputEl.id);
		expect(readoutEl?.getAttribute('aria-live')).toBe('polite');

		const bounds = [...setting.settingEl.querySelectorAll<HTMLElement>('.opencodian-backend-slider-bound')];
		expect(bounds.map((bound) => bound.textContent)).toEqual(['0px', '100px']);

		expect(setting.settingEl.querySelector('.opencodian-backend-slider-reset')).not.toBeNull();
		expect(setting.settingEl.querySelector('.opencodian-backend-slider--discrete')).not.toBeNull();
		expect(setting.settingEl.dataset.backendKey).toBe('history.limit');
		expect(setting.settingEl.dataset.backendScope).toBe('global');
		expect(setting.settingEl.dataset.backendRisk).toBe('high');
		expect(setting.settingEl.querySelectorAll('[title]')).toHaveLength(0);
	});

	it('commits on release, stays busy while pending, and shows the live preview on input only', async () => {
		const deferred = createDeferred();
		const onChange = jest.fn(() => deferred.promise);
		const setting = addBackendSliderSetting(container, {
			name: 'History limit',
			value: 45,
			min: 0,
			max: 100,
			step: 5,
			onChange,
			presentation: { ...BASE_PRESENTATION },
		});

		const inputEl = getSliderInput(setting);
		// Input events preview without committing.
		inputEl.value = '80';
		inputEl.dispatchEvent(new Event('input', { bubbles: true }));
		expect(onChange).not.toHaveBeenCalled();
		expect(setting.settingEl.querySelector<HTMLElement>('.opencodian-backend-slider-value')?.textContent).toBe('80');

		inputEl.dispatchEvent(new Event('change', { bubbles: true }));
		expect(onChange).toHaveBeenCalledWith(80);
		expect(setting.settingEl.querySelector('.opencodian-backend-slider--is-busy')).not.toBeNull();
		expect(inputEl.disabled).toBe(true);

		deferred.resolve();
		await flushMicrotasks();
		expect(setting.settingEl.querySelector('.opencodian-backend-slider--is-busy')).toBeNull();
		expect(inputEl.disabled).toBe(false);
		expect(inputEl.value).toBe('80');
	});

	it('snaps, clamps, rolls back, and announces a localized generic failure when onChange rejects', async () => {
		const onChange = jest.fn(() => {
			throw new Error('internal endpoint and api key details');
		});
		const setting = addBackendSliderSetting(container, {
			name: 'History limit',
			value: 45,
			min: 0,
			max: 100,
			step: 5,
			onChange,
			presentation: { ...BASE_PRESENTATION },
		});

		const inputEl = getSliderInput(setting);
		// Release beyond max clamps into range before committing.
		inputEl.value = '999';
		inputEl.dispatchEvent(new Event('change', { bubbles: true }));
		expect(onChange).toHaveBeenCalledWith(100);
		await flushMicrotasks();

		// Rolled back to the committed value with the localized generic error.
		expect(inputEl.value).toBe('45');
		expect(setting.settingEl.querySelector<HTMLElement>('.opencodian-backend-slider-value')?.textContent).toBe('45');
		expect(setting.settingEl.querySelector('.opencodian-backend-slider--has-error')).not.toBeNull();
		const errorEl = getErrorRegion(setting, '.opencodian-backend-slider-error');
		expect(errorEl.textContent).toBe(t('settings.backend.slider.error'));
		expect(setting.settingEl.textContent).not.toContain('api key');
		// The raw rejection must also stay out of the logs (endpoint/key text).
		const mockLoggerWarn = getMockLoggerWarn();
		expect(mockLoggerWarn).toHaveBeenCalled();
		const loggedText = JSON.stringify(mockLoggerWarn.mock.calls);
		expect(loggedText).not.toContain('api key');
		expect(loggedText).not.toContain('internal endpoint');
	});

	it('powers the reset button from defaultValue through the same failure-rollback path', async () => {
		const deferred = createDeferred();
		const onChange = jest.fn(() => deferred.promise);
		const setting = addBackendSliderSetting(container, {
			name: 'History limit',
			value: 45,
			min: 0,
			max: 100,
			step: 5,
			defaultValue: 52,
			onChange,
			presentation: { ...BASE_PRESENTATION },
		});

		const resetEl = setting.settingEl.querySelector<HTMLButtonElement>('.opencodian-backend-slider-reset');
		expect(resetEl?.textContent).toBe(t('settings.backend.slider.reset'));
		resetEl?.click();
		expect(onChange).toHaveBeenCalledWith(50); // 52 snaps to the step grid.
		expect(getSliderInput(setting).disabled).toBe(true);
		deferred.reject(new Error('nope'));
		await flushMicrotasks();

		// Reset failure restores the pre-reset committed value.
		expect(getSliderInput(setting).value).toBe('45');
		expect(getSliderInput(setting).disabled).toBe(false);
		expect(setting.settingEl.querySelector('.opencodian-backend-slider--has-error')).not.toBeNull();
	});

	it('omits the reset button when no defaultValue is provided and defaults step to 1', () => {
		const setting = addBackendSliderSetting(container, {
			name: 'History limit',
			value: 3,
			min: 0,
			max: 10,
			onChange: () => undefined,
			presentation: { ...BASE_PRESENTATION },
		});

		expect(setting.settingEl.querySelector('.opencodian-backend-slider-reset')).toBeNull();
		expect(setting.settingEl.querySelector('.opencodian-backend-slider--discrete')).toBeNull();
		expect(getSliderInput(setting).step).toBe('1');
	});

	it('clamps out-of-range committed values on initial paint', () => {
		const setting = addBackendSliderSetting(container, {
			name: 'History limit',
			value: 500,
			min: 0,
			max: 100,
			onChange: () => undefined,
			presentation: { ...BASE_PRESENTATION },
		});

		expect(getSliderInput(setting).value).toBe('100');
		expect(setting.settingEl.querySelector<HTMLElement>('.opencodian-backend-slider-value')?.textContent).toBe('100');
	});

	it('starts disabled when requested and ignores commits', () => {
		const onChange = jest.fn();
		const setting = addBackendSliderSetting(container, {
			name: 'History limit',
			value: 10,
			min: 0,
			max: 100,
			defaultValue: 20,
			onChange,
			presentation: { ...BASE_PRESENTATION },
			disabled: true,
		});

		expect(getSliderInput(setting).disabled).toBe(true);
		expect(setting.settingEl.querySelector<HTMLButtonElement>('.opencodian-backend-slider-reset')?.disabled).toBe(true);
		expect(setting.settingEl.querySelector('.opencodian-backend-slider--disabled')).not.toBeNull();
		getSliderInput(setting).dispatchEvent(new Event('change', { bubbles: true }));
		expect(onChange).not.toHaveBeenCalled();
	});
});
