import {
  SessionTodoCoordinator,
  type SessionTodoCoordinatorHost,
  type SessionTodoCoordinatorRuntimeState,
} from './SessionTodoCoordinator';

export type { SessionTodoCoordinator } from './SessionTodoCoordinator';

export type SessionTodoRuntimeState = SessionTodoCoordinatorRuntimeState;

export type SessionTodoViewHost = SessionTodoCoordinatorHost;

export function createSessionTodoCoordinator(host: SessionTodoViewHost): SessionTodoCoordinator {
  return new SessionTodoCoordinator(host);
}
