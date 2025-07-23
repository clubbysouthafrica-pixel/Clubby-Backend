import {
    createResponse,
    deconstructEvent
} from "./function_helpers";

export const handler = async (event: any) => {

    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {
        

        return createResponse(200, { message: "Success" }, origin);

    } catch (error: any) {
        console.error('Submit registration error:', error);
        const message = error?.message || "Internal Server Error";
        const statusCode = error?.$metadata?.httpStatusCode || 500;
        return createResponse(statusCode, { message }, origin);
    }
};
