import { AsyncLocalStorage } from 'node:async_hooks';

/** Per-request context (request id, user id) available to the logger without threading it through calls. */
export interface RequestContext {
  requestId: string;
  userId?: string;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();
export const currentRequestId = () => requestContext.getStore()?.requestId;
