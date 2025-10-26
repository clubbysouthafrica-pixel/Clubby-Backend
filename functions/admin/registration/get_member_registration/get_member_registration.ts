import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { createResponse, deconstructEvent, getItem, queryItems, formatAmount } from "./function_helpers";

const s3_client = new S3Client({ region: process.env.AWS_REGION });

async function getClubMemberRegistrationId(user_id: string, club_account_id: string): Promise<string> {
    const club_member = await getItem(
        process.env.CLUB_MEMBER_TABLE_NAME as string,
        {
            club_account_id: club_account_id,
            user_id: user_id as string
        }
    );

    return club_member?.current_reg_id
}

async function getRegistration(user_id: string, registration_id: string): Promise<any> {
    return await getItem(
        process.env.REGISTRATIONS_TABLE_NAME as string,
        {
            user_id: user_id,
            registration_id: registration_id,
        }
    )
}

async function getRegistrationForm(club_account_id: string): Promise<Record<string, any>[]> {
    const form = await queryItems(
        process.env.REGISTRATION_FORM_TABLE_NAME as string,
        "club_account_id = :clubId",
        { ":clubId": club_account_id },
        undefined,
        false,
    )

    const pages: Record<string, any>[] = [];
    form?.forEach((item) => {
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

    return pages
}

export async function getSignatureUrl(key: string): Promise<string> {
    const command = new GetObjectCommand({
        Bucket: process.env.SIGNATURES_BUCKET_NAME,
        Key: key,
    });

    const signedUrl = await getSignedUrl(s3_client, command, { expiresIn: 3600 });

    return signedUrl;
}

export const handler = async (event: any) => {

    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {
        if (query_string_params?.club_account_id == null || query_string_params?.user_id == null || query_string_params?.currency == null) {
            return createResponse(400, { message: "club_account_id required in query string params." }, origin);
        }
        if (typeof query_string_params.club_account_id !== 'string' || typeof query_string_params.user_id !== 'string' || typeof query_string_params.currency !== 'string') {
            return createResponse(400, { message: "club_account_id must be STRING type." }, origin);
        }

        const registration_id = await getClubMemberRegistrationId(query_string_params.user_id as string, query_string_params.club_account_id);
        const member_registration = await getRegistration(query_string_params.user_id as string, registration_id);

        const registration_form = await getRegistrationForm(query_string_params.club_account_id)

        const pages: Record<string, any>[] = [];
        for (const page of registration_form) {
            const new_page = {
                page_index: page.page_index,
                page_header: page.page_header,
                fields: []
            } as { page_index: number, page_header: string, fields: Record<string, any>[] };

            for (const field of page.fields) {
                if (field.field_type === "TEXT") {
                    new_page.fields.push({ label: field.field_text, position: field.field_order_id, type: "TEXT", });
                    continue;
                }

                let found = false;

                for (const key of Object.keys(member_registration)) {
                    const reg = member_registration[key];

                    if (key.includes(field.field_id) && reg.type === "STANDARD_SIGNATURE") {
                        if (reg.signature_type === "signature") {
                            const signatureUrl = await getSignatureUrl(reg.value);
                            new_page.fields.push({
                                type: "STANDARD_SIGNATURE",
                                signature_type: "signature",
                                label: field.field_name,
                                value: signatureUrl,
                                position: field.field_order_id
                            });
                        } else {
                            new_page.fields.push({
                                type: "STANDARD_SIGNATURE",
                                signature_type: "text",
                                label: field.field_name,
                                value: reg.value,
                                position: field.field_order_id
                            });
                        }
                        found = true;
                        break;
                    }

                    else if (key.includes(field.field_id) && reg.type.includes("STANDARD_")) {
                        new_page.fields.push({
                            type: "STANDARD_OTHER",
                            label: field.field_name,
                            value: reg.value,
                            position: field.field_order_id
                        });
                        found = true;
                        break;
                    }

                    else if (key.includes(field.field_id) && reg.type.includes("BILLING_")) {
                        new_page.fields.push({
                            type: "BILLING",
                            label: field.field_name,
                            value: reg.label_value ? `${formatAmount(reg.value, query_string_params.currency)} - ${reg.label_value}` : formatAmount(reg.value, query_string_params.currency),
                            quantity: reg.multiplier_value > 1 ? reg.multiplier_value : undefined,
                            position: field.field_order_id
                        });
                        found = true;
                        break;
                    }
                }

                if (!found) {
                    new_page.fields.push({
                        type: "DNE",
                        label: field.field_name,
                        position: field.field_order_id
                    });
                }
            }

            new_page.fields.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
            pages.push(new_page);
        }

        return createResponse(200, { pages }, origin);

    } catch (error) {
        console.error("Error:", error);
        return createResponse(500, { message: "Internal Server Error" }, origin);
    }
};
