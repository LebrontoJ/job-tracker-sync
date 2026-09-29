import { AppError } from "./errors";
import type { ApiMap, ApiRequest, ApiResponse, ApiType } from "./messages";

/** Typed RPC to the background worker. Throws AppError on failure. */
export async function call<K extends ApiType>(
  type: K,
  payload: ApiMap[K]["req"],
): Promise<ApiMap[K]["res"]> {
  const request = { type, payload } as ApiRequest;
  const response = (await chrome.runtime.sendMessage(request)) as
    ApiResponse<ApiMap[K]["res"]> | undefined;
  if (!response) throw new AppError("UNKNOWN", "后台未响应,请重试");
  if (!response.ok) throw new AppError(response.error.code, response.error.message);
  return response.data;
}
