import { deconstructEvent, createResponse, getItem } from './function_helpers';
import PayFast from './payfast-helper';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

const ssm_client = new SSMClient({ region: process.env.REGION });

export const handler = async (event: any) => {

    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {

        if (query_string_params?.club_account_id == null || typeof query_string_params.club_account_id !== 'string') {
            return createResponse(400, { message: "club_account_id (string) required." }, origin);
        }

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

        const registration = await getItem(process.env.REGISTRATIONS_TABLE_NAME as string, {
            user_id: user_id as string,
            registration_id: club_member.current_reg_id
        });
        if (registration == null) {
            return createResponse(400, { message: "Registration not found." }, origin);
        }

        // Fetch PayFast configuration from Parameter Store
        const paramName = `payfast_details_${query_string_params.club_account_id}`;
        let pfConfig: { merchant_id: string; merchant_key: string; passphrase?: string | null } | null = null;
        try {
            const param = await ssm_client.send(new GetParameterCommand({ Name: paramName, WithDecryption: true }));
            const raw = param.Parameter?.Value;
            if (!raw) {
                return createResponse(400, { message: 'Payment configuration not found.' }, origin);
            }
            const parsedCfg = JSON.parse(raw);
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

        const pf = new PayFast({
            merchant_id: pfConfig.merchant_id,
            merchant_key: pfConfig.merchant_key,
            passphrase: pfConfig.passphrase ?? null,
            sandbox: process.env.ENVIRONMENT === "Dev" ? true : false,
        });

        const paymentData = {
            return_url: `${process.env.DOMAIN}/clubs/${query_string_params.club_account_id}`,
            cancel_url: `${process.env.DOMAIN}/clubs/${query_string_params.club_account_id}`,
            notify_url: process.env.NOTIFY_URL,
            name_first: user.first_name,
            name_last: user.surname,
            email_address: user.email,
            amount: registration?.total_outstanding_amount / 100,
            item_name: 'Registration Fee',
            item_description: club_member.club_name,
        };

    const urlString = pf.createStringfromObject(paymentData);
        const hash = pf.createSignature(urlString);
        const paymentObject = pf.createPaymentObject(paymentData, hash);
        const generatePaymentUrl = await pf.generatePaymentUrl(paymentObject);

        return createResponse(200, { payment_url: generatePaymentUrl }, origin);

    } catch (error) {
        console.error("Error:", error);
        return createResponse(500, { message: "Internal Server Error" }, origin);
    }
};
