import { unmarshall } from "@aws-sdk/util-dynamodb";
import { createResponse, deconstructEvent, decryptData, getItem, getSignatureUrl, queryItems } from "./function_helpers";
import { GetObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { AdminGetUserCommand, CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";

export type StandardInputTypes = 'TEXT' | 'DROPDOWN' | 'PHONE' | 'DATE' | 'NUMBER' | 'RADIO';
export type CurrencyType = 'ZAR' | 'USD' | 'GBP'

const s3_client = new S3Client({ region: process.env.REGION });
const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.REGION });

async function getUserIdByEmail(email: string): Promise<string | null> {
    try {
        const response = await cognitoClient.send(
            new AdminGetUserCommand({
                UserPoolId: process.env.USER_POOL_ID!,
                Username: email,
            })
        );
        const sub = response.UserAttributes?.find(attr => attr.Name === 'sub')?.Value;
        return sub ?? null;
    } catch (err: any) {
        if (err.name === 'UserNotFoundException') return null;
        throw err;
    }
}

async function getClubProfileUrl(club_account_id: string): Promise<string | undefined> {
    const profile_key = `club_profile/${club_account_id}_profile`;
    try {
        await s3_client.send(new HeadObjectCommand({ Bucket: process.env.IMAGE_BUCKET_NAME, Key: profile_key }));
        const getProfileCommand = new GetObjectCommand({
            Bucket: process.env.IMAGE_BUCKET_NAME,
            Key: profile_key,
        });
        return await getSignedUrl(s3_client, getProfileCommand, { expiresIn: 60 * 5 });
    } catch (err: any) {
        const status = err?.$metadata?.httpStatusCode ?? err?.statusCode ?? err?.status;
        if (status && status !== 404) {
            console.error(`Error checking profile image ${profile_key}:`, err);
        }
        return undefined;
    }
}

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
            if (item.field_type?.S === "BILLING" && item.input_type?.S === "DISCOUNT") return

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

        let effective_user_id: string | null = user_id ?? null;
        let from_email_lookup = false;
        let looked_up_email: string | null = null;

        if (!effective_user_id && typeof query_string_params?.email === 'string' && query_string_params.email.trim() !== '') {
            looked_up_email = query_string_params.email.trim().toLowerCase();
            effective_user_id = await getUserIdByEmail(looked_up_email as string);
            if (effective_user_id) from_email_lookup = true;
        }

        if (!effective_user_id) {
            return createResponse(200, { pages, club_name: club.club_name, currency: club.currency }, origin);
        }

        const club_member = await getItem(
            process.env.CLUB_MEMBER_TABLE_NAME as string,
            {
                club_account_id: query_string_params.club_account_id,
                user_id: effective_user_id
            }
        );

        if (from_email_lookup && club_member != null && club_member?.resubmission_required !== true && club_member?.non_registration !== true) {
            return createResponse(409, {
                message: `A member with email ${looked_up_email} already has a pending or active registration with this club.`
            }, origin);
        }

        if (club_member == null || club_member === undefined) {
            return createResponse(200, {
                pages,
                club_name: club.club_name,
                currency: club.currency,
                club_profile_url: await getClubProfileUrl(query_string_params?.club_account_id)
            }, origin);
        }

        if (!club_member.current_reg_id) {
            return createResponse(200, { pages, club_name: club.club_name, currency: club.currency }, origin);
        }

        const registration = await getItem(
            process.env.REGISTRATIONS_TABLE_NAME as string,
            {
                user_id: effective_user_id,
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

                if (registration[key]?.sensitive_information === true) {
                    registration[key].value = await decryptData(registration[key].value);
                }
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
        return createResponse(200, { 
            pages: updatedPages, 
            club_name: club.club_name, 
            currency: club.currency,
            club_profile_url: await getClubProfileUrl(query_string_params?.club_account_id)
        }, origin);

    } catch (error: any) {
        console.error('Get form error:', error);
        const message = error?.message || "Internal Server Error";
        const statusCode = error?.$metadata?.httpStatusCode || 500;
        return createResponse(statusCode, { message }, origin);
    }
};
