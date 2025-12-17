import { unmarshall } from "@aws-sdk/util-dynamodb";
import { createResponse, deconstructEvent, getItem, getSignatureUrl, queryItems } from "./function_helpers";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type StandardInputTypes = 'TEXT' | 'DROPDOWN' | 'PHONE' | 'DATE' | 'NUMBER' | 'RADIO';
export type CurrencyType = 'ZAR' | 'USD' | 'GBP'

const s3_client = new S3Client({ region: process.env.REGION });

export const handler = async (event: any) => {

    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {

        if (query_string_params?.club_account_id == null) {
            return createResponse(400, { message: 'club_account_id required.' }, origin);
        }

        const club = await getItem(process.env.CLUB_TABLE_NAME as string, {
            club_account_id: query_string_params.club_account_id
        });

        if (!club) {
            return createResponse(400, { message: `Club not found for club_account_id: ${query_string_params.club_account_id}.` }, origin);
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

        const pages: Record<string, any>[] = [];

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

        if (user_id == null || user_id === undefined) {
            return createResponse(200, { pages, club_name: club.club_name, currency: club.currency }, origin);
        }

        const club_member = await getItem(
            process.env.CLUB_MEMBER_TABLE_NAME as string,
            {
                club_account_id: query_string_params.club_account_id,
                user_id: user_id as string
            }
        );

        if (club_member == null || club_member === undefined) {
            return createResponse(200, { pages, club_name: club.club_name, currency: club.currency }, origin);
        }

        const registration = await getItem(
            process.env.REGISTRATIONS_TABLE_NAME as string,
            {
                user_id: user_id as string,
                registration_id: club_member?.current_reg_id,
            }
        );

        const sorted = pages
            .sort((a, b) => a.page_index - b.page_index)
            .map((p, index) => ({
                ...p,
                page_index: index,
                fields: p.fields
                    .sort((a: any, b: any) => Number(a.field_order_id) - Number(b.field_order_id))
                    .map((f: any) => ({ ...f })),
            }));

        if (!registration) {
            return createResponse(200, { pages, club_name: club.club_name, currency: club.currency }, origin);
        }

        const meta: Record<string, any> = {}
        for (const key of Object.keys(registration)) {
            if (key.includes("reg_field_")) {
                if (registration[key]?.signature_type === "signature") {
                    if (registration?.last_season_registration === true) {
                        registration[key].value = undefined
                    } else {
                        registration[key].value = await getSignatureUrl(registration[key].value);
                    }
                }
                meta[key.replace("reg_field_", "")] = registration[key]
            }
        }

        const updatedPages = await Promise.all(
            sorted.map(async (page) => ({
                ...page,
                fields: await Promise.all(
                    page.fields.map(async (field: any) => {
                        const metaField = meta[field.field_id];
                        if (!metaField) return field;

                        if (metaField?.signature_type) {
                            return {
                                ...field,
                                value: metaField.value,
                                signature_type: metaField.signature_type,
                            };
                        } else if (field.billingOptions) {
                            const matchedOption = field.billingOptions.find(
                                (opt: any) => opt.option_order_id === metaField.option_order_id
                            );

                            if (matchedOption) {
                                return {
                                    ...field,
                                    value: matchedOption.label,
                                    label: matchedOption.label,
                                    selectedAmountCents: matchedOption.amount,
                                    option_order_id: matchedOption.option_order_id,
                                };
                            }
                        } else if (
                            field.input_type === "DISCOUNT" &&
                            field.discountOptions
                        ) {
                            const matchedOption = field.discountOptions.find(
                                (opt: any) => opt.option_order_id === metaField.option_order_id
                            );

                            if (matchedOption) {
                                return {
                                    ...field,
                                    percentage: metaField.value,
                                    value: metaField.label_value,
                                    label: metaField.label_value,
                                    multiplier_value: metaField?.multiplier_value ?? undefined,
                                    option_order_id: metaField.option_order_id,
                                    applicable_billing_fields:
                                        matchedOption.applicable_billing_fields,
                                };
                            }
                        } else {
                            return {
                                ...field,
                                value: metaField.value,
                                multiplier_value: metaField?.multiplier_value ?? undefined,
                            };
                        }

                        return field;
                    })
                ),
            }))
        );

        return createResponse(200, { pages: updatedPages, club_name: club.club_name, currency: club.currency }, origin);


    } catch (error: any) {
        console.error('Signup error:', error);
        const message = error?.message || "Internal Server Error";
        const statusCode = error?.$metadata?.httpStatusCode || 500;
        return createResponse(statusCode, { message }, origin);
    }
};
