import { deconstructEvent, createResponse, getItem, decryptData } from './function_helpers';
import PayFast from './payfast-helper';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

const ssm_client = new SSMClient({ region: process.env.REGION });

export const handler = async (event: any) => {

    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {

        if (query_string_params?.club_account_id == null || typeof query_string_params.club_account_id !== 'string') {
            return createResponse(400, { message: "club_account_id (string) required." }, origin);
        }

        const order_url = query_string_params?.order_id && typeof query_string_params.order_id === 'string';
        const event_url = query_string_params?.event_id && typeof query_string_params.event_id === 'string' && query_string_params?.event_registration_id && typeof query_string_params.event_registration_id === 'string';

        const user = await getItem(
            process.env.USERS_TABLE_NAME as string,
            {
                user_type: "MEMBER",
                user_id: user_id as string,
            }
        );
        if (user == null) {
            return createResponse(400, { message: "User not found." }, origin);
        }

        const club_member = await getItem(
            process.env.CLUB_MEMBER_TABLE_NAME as string,
            {
                club_account_id: query_string_params.club_account_id,
                user_id: user_id as string
            }
        );
        if (club_member == null) {
            return createResponse(400, { message: "Club member not found." }, origin);
        }

        let amount = 0;
        if (order_url) {
            const order = await getItem(process.env.ORDERS_TABLE_NAME as string, {
                club_account_id: query_string_params.club_account_id,
                order_id: query_string_params.order_id as string
            });
            if (order == null) {
                return createResponse(400, { message: "Order not found." }, origin);
            }
            amount = order?.total_amount / 100 - order?.amount_paid / 100;
        } else if (event_url) {

            const event_registration = await getItem(process.env.EVENT_REGISTRATIONS_TABLE_NAME as string, {
                event_id: query_string_params.event_id as string,
                event_registration_id: query_string_params.event_registration_id as string
            });

            if (event_registration == null) {
                return createResponse(400, { message: "Event registration not found." }, origin);
            }
            amount = event_registration?.entry_fee_amount / 100 - event_registration?.amount_paid / 100;

        } else {
            const registration = await getItem(process.env.REGISTRATIONS_TABLE_NAME as string, {
                user_id: user_id as string,
                registration_id: club_member.current_reg_id
            });
            if (registration == null) {
                return createResponse(400, { message: "Registration not found." }, origin);
            }

            if (club_member?.registered) {
                return createResponse(400, { message: "No outstanding amount for registered member." }, origin);
            }

            amount = registration?.total_outstanding_amount / 100;
        }   

        const paramName = `payfast_details_${query_string_params.club_account_id}`;
        let pfConfig: { merchant_id: string; merchant_key: string; passphrase?: string | null } | null = null;
        try {
            const param = await ssm_client.send(new GetParameterCommand({ Name: paramName, WithDecryption: true }));
            const raw = param.Parameter?.Value;
            if (!raw) {
                return createResponse(400, { message: 'Payment configuration not found.' }, origin);
            }
            const parsedCfg = JSON.parse(await decryptData(raw));
            if (!parsedCfg.merchant_id || !parsedCfg.merchant_key) {
                return createResponse(400, { message: 'Payment configuration incomplete.' }, origin);
            }
            pfConfig = {
                merchant_id: parsedCfg.merchant_id,
                merchant_key: parsedCfg.merchant_key,
                passphrase: parsedCfg.passphrase ?? null,
            };
        } catch (err: any) {
            const code = err?.name || err?.Code || err?.code;
            if (code === 'ParameterNotFound') {
                return createResponse(400, { message: 'Payment configuration not found.' }, origin);
            }
            console.error('Error fetching PayFast config from SSM:', err);
            return createResponse(500, { message: 'Internal Server Error' }, origin);
        }

        const config: {
            merchant_id: string;
            merchant_key: string;
            passphrase?: string;
            environment: string;
        } = {
            merchant_id: pfConfig.merchant_id as string,
            merchant_key: pfConfig.merchant_key as string,
            environment: process.env.ENVIRONMENT as string,
        }
        if (pfConfig.passphrase) config.passphrase = pfConfig.passphrase;
        const pf = new PayFast(config);

        const paymentData = {
            return_url: `${process.env.DOMAIN}/clubs/${query_string_params.club_account_id}`,
            cancel_url: `${process.env.DOMAIN}/clubs/${query_string_params.club_account_id}`,
            notify_url: order_url ? process.env.NOTIFY_ORDER_URL : event_url ? process.env.NOTIFY_EVENT_URL : process.env.NOTIFY_REGISTRATION_URL,
            name_first: user.first_name,
            name_last: user.surname,
            email_address: user.email,
            amount: amount,
            item_name: order_url ? 'Shop Order Payment' : event_url ? 'Event Registration Payment' : 'Registration Fee',
            item_description: club_member.club_name,
            custom_str1: query_string_params.club_account_id,
            custom_str2: user_id,
            ...(order_url && { custom_str3: query_string_params.order_id }),
            ...(event_url && { custom_str3: query_string_params.event_id, custom_str4: query_string_params.event_registration_id }),
        };

        const urlString = pf.createStringfromObject(paymentData);
        const hash = pf.createSignature(urlString);
        const paymentObject = pf.createPaymentObject(paymentData, hash);
        const generatePaymentUrl = await pf.generatePaymentUrl(paymentObject);

        console.log("Generated PayFast payment URL:", generatePaymentUrl);

        return createResponse(200, { payment_url: generatePaymentUrl }, origin);

    } catch (error) {
        console.error("Error:", error);
        return createResponse(500, { message: "Internal Server Error" }, origin);
    }
};
