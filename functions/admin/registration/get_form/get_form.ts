import { unmarshall } from "@aws-sdk/util-dynamodb";
import { createResponse, deconstructEvent, queryItems } from "./function_helpers";

export type StandardInputTypes = 'TEXT' | 'DROPDOWN' | 'PHONE' | 'DATE';
export type CurrencyType = 'ZAR' | 'USD' | 'GBP'

interface StandardField {
    field_type: string;
    field_name: string;
    id: string;
    type: StandardInputTypes;
    options?: string[];
}

interface BillingField {
    field_type: string;
    field_name: string;
    currency: CurrencyType;
    amount: number;
}

type RegistrationForm = StandardField | BillingField;

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

        if (form == null) {
            return createResponse(400, { message: `Registration form does not exist for club: ${query_string_params.club_account_id}.` }, origin);
        }

        const items: RegistrationForm[] = [];
        form.forEach((item) => {

            const set = unmarshall(item);
            delete set.club_account_id;

            if (item.field_type.S === "STANDARD" && item.input_type.S === "DROPDOWN") {
                set["options"] = item.options.L.map((item: {S: string}) => item.S);
            }

            items.push(set as RegistrationForm);
        });

        return createResponse(200, { items }, origin);


    } catch (error: any) {
        console.error('Signup error:', error);
        const message = error?.message || "Internal Server Error";
        const statusCode = error?.$metadata?.httpStatusCode || 500;
        return createResponse(statusCode, { message }, origin);
    }
};
