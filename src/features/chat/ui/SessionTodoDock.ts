import { setIcon } from 'obsidian';

import type { SessionTodo } from '../../../core/types';
import { t } from '../../../i18n';

export class SessionTodoDock {
  private readonly rootEl: HTMLElement;
  private readonly headerEl: HTMLElement;
  private readonly labelEl: HTMLElement;
  private readonly previewEl: HTMLElement;
  private readonly toggleBtn: HTMLButtonElement;
  private readonly listEl: HTMLElement;
  private collapsed = false;
  private todos: SessionTodo[] = [];

  constructor(parentEl: HTMLElement) {
    this.rootEl = parentEl.createDiv({
      cls: 'opencodian-session-todo-dock is-hidden',
      attr: {
        'data-component': 'session-todo-dock',
      },
    });

    this.headerEl = this.rootEl.createDiv({
      cls: 'opencodian-session-todo-header',
      attr: {
        role: 'button',
        tabindex: '0',
        'data-action': 'session-todo-toggle',
      },
    });

    this.labelEl = this.headerEl.createDiv({ cls: 'opencodian-session-todo-label' });
    this.previewEl = this.headerEl.createDiv({
      cls: 'opencodian-session-todo-preview',
      attr: {
        'data-slot': 'session-todo-preview',
      },
    });

    this.toggleBtn = this.headerEl.createEl('button', {
      cls: 'opencodian-session-todo-toggle',
      attr: {
        type: 'button',
        'data-action': 'session-todo-toggle-button',
      },
    });
    setIcon(this.toggleBtn, 'chevron-down');

    this.listEl = this.rootEl.createDiv({
      cls: 'opencodian-session-todo-list',
      attr: {
        'data-slot': 'session-todo-list',
      },
    });

    this.headerEl.addEventListener('click', () => {
      if (this.todos.length === 0) {
        return;
      }
      this.collapsed = !this.collapsed;
      this.syncCollapsedState();
    });

    this.headerEl.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') {
        return;
      }
      event.preventDefault();
      this.headerEl.click();
    });

    this.toggleBtn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.headerEl.click();
    });
  }

  update(todos: SessionTodo[]): void {
    const previous = this.todos;
    this.todos = [...todos];

    if (this.todos.length === 0) {
      this.rootEl.addClass('is-hidden');
      this.labelEl.setText('');
      this.previewEl.setText('');
      this.listEl.empty();
      this.syncCollapsedState();
      return;
    }

    if (previous.length === 0 && this.hasIncompleteTodos(this.todos)) {
      this.collapsed = false;
    }

    this.rootEl.removeClass('is-hidden');
    this.rootEl.toggleClass('is-complete', !this.hasIncompleteTodos(this.todos));

    const done = this.todos.filter((todo) => todo.status === 'completed').length;
    this.labelEl.setText(t('chat.todo.progress', {
      done: String(done),
      total: String(this.todos.length),
    }));

    this.previewEl.setText(this.getPreviewText());
    this.renderList();
    this.syncCollapsedState();
  }

  destroy(): void {
    this.rootEl.remove();
  }

  private renderList(): void {
    this.listEl.empty();

    for (const todo of this.todos) {
      const itemEl = this.listEl.createDiv({
        cls: 'opencodian-session-todo-item',
      });
      itemEl.dataset.state = todo.status;

      const markerEl = itemEl.createSpan({ cls: 'opencodian-session-todo-marker' });
      markerEl.dataset.state = todo.status;
      markerEl.setAttribute('aria-hidden', 'true');

      if (todo.status === 'completed') {
        setIcon(markerEl, 'check');
      } else if (todo.status === 'in_progress') {
        markerEl.createSpan({ cls: 'opencodian-session-todo-pulse' });
      }

      itemEl.createSpan({
        cls: 'opencodian-session-todo-text',
        text: todo.content,
      });
    }
  }

  private getPreviewText(): string {
    const active = this.todos.find((todo) => todo.status === 'in_progress')
      ?? this.todos.find((todo) => todo.status === 'pending')
      ?? this.todos[this.todos.length - 1];
    return active?.content ?? '';
  }

  private hasIncompleteTodos(todos: SessionTodo[]): boolean {
    return todos.some((todo) => todo.status !== 'completed' && todo.status !== 'cancelled');
  }

  private syncCollapsedState(): void {
    const hidden = this.todos.length === 0;
    const collapsed = hidden || this.collapsed;
    this.rootEl.toggleClass('is-collapsed', collapsed);
    this.headerEl.setAttribute('aria-expanded', String(!collapsed));
    this.toggleBtn.setAttribute('aria-label', collapsed ? t('chat.todo.expand') : t('chat.todo.collapse'));
  }
}
