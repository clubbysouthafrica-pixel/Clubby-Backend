import { createResponse, deconstructEvent } from "./function_helpers";
import { scanItems } from "./function_helpers/database_functions";

export const handler = async (event: any) => {
  const { origin, body, query_string_params } = deconstructEvent(event);

  try {
    // Accept filters from either body or query string (snake_case and camelCase)
    const storage_request_id =
      body?.storage_request_id ??
      body?.id ??
      query_string_params?.storage_request_id ??
      query_string_params?.id ??
      null;

    const storage_id =
      body?.storage_id ??
      body?.storageId ??
      query_string_params?.storage_id ??
      query_string_params?.storageId ??
      null;

    const userId =
      body?.userId ??
      body?.user_id ??
      query_string_params?.userId ??
      query_string_params?.user_id ??
      null;

    const status = body?.status ?? query_string_params?.status ?? null;

    const paidParam = body?.paid ?? query_string_params?.paid ?? undefined;

    // Normalize paid query param (string -> boolean)
    let paid: boolean | null | undefined = undefined;
    if (paidParam === "true" || paidParam === true) paid = true;
    else if (paidParam === "false" || paidParam === false) paid = false;
    else if (paidParam === null || paidParam === "null") paid = null;
    // else leave undefined (meaning: do not filter by paid)

    const limitParam = query_string_params?.limit ?? body?.limit ?? undefined;
    const offsetParam =
      query_string_params?.offset ?? body?.offset ?? undefined;

    const limit = limitParam !== undefined ? Number(limitParam) : undefined;
    const offset = offsetParam !== undefined ? Number(offsetParam) : 0;

    // Validate limit/offset if provided
    if (
      (limit !== undefined && (Number.isNaN(limit) || limit < 1)) ||
      Number.isNaN(offset) ||
      offset < 0
    ) {
      return createResponse(
        400,
        { message: "Invalid limit/offset parameters" },
        origin,
      );
    }

    const tableName = process.env.STORAGE_REQUESTS_TABLE_NAME as string;
    if (!tableName) {
      return createResponse(
        500,
        {
          message: "Server misconfigured: missing STORAGE_REQUESTS_TABLE_NAME",
        },
        origin,
      );
    }

    // Scan table and filter in memory.
    // If you have GSIs for userId or storage_id, replace with queryItems for efficiency.
    const items = await scanItems(tableName);

    let filtered = items;

    if (storage_request_id) {
      filtered = filtered.filter(
        (it: any) => it.storage_request_id === storage_request_id,
      );
    }

    if (storage_id) {
      filtered = filtered.filter((it: any) => it.storage_id === storage_id);
    }

    if (userId) {
      filtered = filtered.filter((it: any) => it.userId === userId);
    }

    if (status) {
      filtered = filtered.filter((it: any) => it.status === status);
    }

    if (paid !== undefined) {
      if (paid === null) {
        filtered = filtered.filter(
          (it: any) =>
            it.paid === null || it.paid === undefined || it.paid === false,
        );
      } else {
        filtered = filtered.filter((it: any) => Boolean(it.paid) === paid);
      }
    }

    const total = filtered.length;

    // Apply simple offset/limit paging
    let paged = filtered;
    if (limit !== undefined) {
      paged = filtered.slice(offset, offset + limit);
    } else if (offset > 0) {
      paged = filtered.slice(offset);
    }

    return createResponse(
      200,
      {
        items: paged,
        total,
        limit: limit ?? null,
        offset: offset ?? 0,
      },
      origin,
    );
  } catch (error: any) {
    console.error("Error listing storage requests:", error);
    return createResponse(500, { message: error.message }, origin);
  }
};
