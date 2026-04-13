import {
  SessionTodoCoordinator,
  type SessionTodoCoordinatorHost,
  type SessionTodoCoordinatorRuntimeState,
} from './SessionTodoCoordinator';

export type { SessionTodoCoordinator } from './SessionTodoCoordinator';

export interface SessionTodoRuntimeState extends SessionTodoCoordinatorRuntimeState {}

export interface SessionTodoViewHost extends SessionTodoCoordinatorHost {}

export function createSessionTodoCoordinator(host: SessionTodoViewHost): SessionTodoCoordinator {
  return new SessionTodoCoordinator(host);
}
