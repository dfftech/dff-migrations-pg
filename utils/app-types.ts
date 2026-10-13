export type { KeyValueType, RequestByIdType, ResponseType, SearchType, SessionInfo } from 'dff-util';

export type PubSubEventType = {
  name: string;
  raw: string | null;
};
