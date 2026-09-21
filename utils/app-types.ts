import type { Query } from "encore.dev/api";

export type RequestQueryType = {
  id?: string;
  query?: Query<string>;
};

export type ResponseType = {
  status?: string | number;
  data?: any;
  error?: any;
  total?: number;
  skip?: number;
  limit?: number;
};

export type SearchType = {
  limit?: number;
  skip?: number;
  orderBy?: string;
  order?: 'ASC' | 'DESC';
  searchTerm?: string;
  active?: boolean;
};

export type PubSubEventType = {
    name: string;
    raw: string | null;
}
