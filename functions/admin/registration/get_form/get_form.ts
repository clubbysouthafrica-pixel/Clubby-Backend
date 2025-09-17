import { unmarshall } from "@aws-sdk/util-dynamodb";
import { createResponse, deconstructEvent, queryItems } from "./function_helpers";

export type StandardInputTypes = 'TEXT' | 'DROPDOWN' | 'PHONE' | 'DATE' | 'NUMBER' | 'RADIO';
export type CurrencyType = 'ZAR' | 'USD' | 'GBP'

export const handler = async (event: any) => {

    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {

        if (query_string_params?.club_account_id == null) {
            return createResponse(400, { message: 'club_account_id required.' }, origin);
        }

        const form = await queryItems(
            process.env.REGISTRATION_FORM_TABLE_NAME as string,
            "club_account_id = :clubId",
            { ":clubId": query_string_params.club_account_id },
            undefined,
            false,
        )
        const pages: Record<string, any>[] = [];

        if (form == null) {
            return createResponse(200, { pages }, origin);
        }

        form.forEach((item) => {
            const set = unmarshall(item);

            if (!set.visible) return

            delete set.club_account_id;
            delete set.visible;

            if (item.field_type.S === "STANDARD" && item.input_type.S === "DROPDOWN") {
                set["options"] = item.options.L.map((opt: { S: string }) => opt.S);
            }

            let page = pages.find(p => p.page_index === set.page_index);

            if (!page) {
                page = {
                    page_index: set.page_index,
                    page_header: set.page_header,
                    fields: []
                };
                pages.push(page);
            }

            page.fields.push({
                ...set,
                page_index: undefined,
                page_header: undefined
            });
        });

        return createResponse(200, { pages }, origin);


    } catch (error: any) {
        console.error('Signup error:', error);
        const message = error?.message || "Internal Server Error";
        const statusCode = error?.$metadata?.httpStatusCode || 500;
        return createResponse(statusCode, { message }, origin);
    }
};
