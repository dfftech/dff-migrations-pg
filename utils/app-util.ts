  import { currentRequest, type APICallMeta } from "encore.dev";

  export const env_base_name = (type = 'upper') => {
    const baseName = process.env.BASE_NAME || "XXXX";
    return baseName.toUpperCase();
  };

  export const env = (key: string) => {
     key = env_base_name() + "_" + key;
     return process.env[key.toUpperCase()];
  };

  export const session_meta = () => {
    const callMeta = currentRequest() as APICallMeta;
    return {
      logger: callMeta.middlewareData?.logger || {},
      session_user: callMeta.middlewareData?.session_user || { id: "unknown" },
      request_id: callMeta.middlewareData?.request_id || "-",
      token: callMeta.middlewareData?.token || undefined,
      tenant_id: callMeta.middlewareData?.tenant_id || undefined,
    };
  };

  export const logger = () => {
    const callMeta = currentRequest() as APICallMeta;
    return callMeta.middlewareData?.logger || {};
  };

  export const session_user: any = () => {
    const callMeta = currentRequest() as APICallMeta;
    return callMeta.middlewareData?.session_user || { id: "unknown" };
  };

  export const request_id = () => {
    const callMeta = currentRequest() as APICallMeta;
    return callMeta.middlewareData?.request_id || "-";
  };

  export const token = () => {
    const callMeta = currentRequest() as APICallMeta;
    return callMeta.middlewareData?.token;
  };

  export const query_params = () => {
    const callMeta = currentRequest() as APICallMeta;
    const pathAndQuery = callMeta.pathAndQuery;
    return get_query_params(pathAndQuery);
  };

  export const tenant_id = () => {
    const callMeta = currentRequest() as APICallMeta;
    return callMeta.middlewareData?.tenant_id;
  };

  export const core_db = () => {
    const callMeta = currentRequest() as APICallMeta;
    return callMeta.middlewareData?.core_db;
  };

  export const session_db = () => {
    const callMeta = currentRequest() as APICallMeta;
    return callMeta.middlewareData?.session_db;
  };

  export const get_db = async(key: string) => {
    const callMeta = currentRequest() as APICallMeta;
    return await callMeta.middlewareData?.get_db(key);
  };

  function get_query_params(pathAndQuery: string): Record<string, string> {
    const queryIndex = pathAndQuery.indexOf("?");
    if (queryIndex === -1) return {};

    const queryString = pathAndQuery.slice(queryIndex + 1);
    const params = new URLSearchParams(queryString);

    const result: Record<string, string> = {};
    for (const [key, value] of params) {
      result[key] = value;
    }
    return result;
  }
