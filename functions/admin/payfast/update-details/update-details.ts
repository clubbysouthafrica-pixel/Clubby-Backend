import { SSMClient, PutParameterCommand } from "@aws-sdk/client-ssm";
import { createResponse, deconstructEvent, updateItem } from "./function_helpers";
import { PayFast } from "./payfast-helper";

const ssm_client = new SSMClient({ region: process.env.REGION });

type PayfastDetailsBody = {
    club_account_id?: string;
    merchant_id?: string;
    merchant_key?: string;
    passphrase?: string;
};

function validateBody(body: PayfastDetailsBody): string | null {
    if (!body.club_account_id) return "club_account_id is required";
    if (!body.merchant_id) return "merchant_id is required";
    if (!body.merchant_key) return "merchant_key is required";
    return null;
}

export const handler = async (event: any) => {
    const { origin, body } = deconstructEvent(event);

    try {
        const parsed: PayfastDetailsBody = typeof body === "string" ? JSON.parse(body || "{}") : (body || {});

        const validationError = validateBody(parsed);
        if (validationError) {
            return createResponse(400, { message: validationError }, origin);
        }

        const config: { 
            merchant_id: string;
            merchant_key: string;
            passphrase?: string;
            environment: string;
         } = {
            merchant_id: parsed.merchant_id as string,
            merchant_key: parsed.merchant_key as string,
            environment: process.env.ENVIRONMENT as string,
        }
        if (parsed.passphrase) config.passphrase = parsed.passphrase;
        const pf = new PayFast(config);

        const paymentData = {
            return_url: `https://clubby.co.za/payfast/return`,
            cancel_url: `https://clubby.co.za/payfast/cancel`,
            notify_url: `https://clubby.co.za/payfast/notify`,
            name_first: "MCS",
            name_last: "Verify",
            email_address: "noreply@myclubsoftware.io",
            amount: "5.00",
            item_name: "Connectivity Test",
            item_description: "Verifying PayFast credentials",
        };

        const urlString = pf.createStringfromObject(paymentData);
        const hash = pf.createSignature(urlString);
        const paymentObject = pf.createPaymentObject(paymentData, hash);
        const paymentUrl = await pf.generatePaymentUrl(paymentObject);

        if (!paymentUrl) {
            return createResponse(400, { message: "PayFast connectivity failed. Please ensure the PayFast credentials are correct." }, origin);
        }
        console.log("Generated PayFast payment URL:", paymentUrl);

        const paramName = `payfast_details_${parsed.club_account_id}`;
        const valueObj: Record<string, string> = {
            merchant_id: parsed.merchant_id!,
            merchant_key: parsed.merchant_key!,
        };
        if (parsed.passphrase && parsed.passphrase.trim() !== "") {
            valueObj.passphrase = parsed.passphrase;
        }

        try {
            await ssm_client.send(new PutParameterCommand({
                Name: paramName,
                Type: "SecureString",
                Value: JSON.stringify(valueObj),
                Overwrite: false,
                Tier: "Standard",
            }));

            await updateItem(
                process.env.CLUB_TABLE_NAME as string,
                { club_account_id: parsed.club_account_id as string },
                "SET #payfast_enabled = :enabled",
                { "#payfast_enabled": "payfast_enabled" },
                { ":enabled": true }
            );

            return createResponse(200, { message: "Parameter created and PayFast connectivity verified", payment_url: paymentUrl }, origin);
        } catch (err: any) {
            const code = err?.name || err?.Code || err?.code;
            if (code === "ParameterAlreadyExists") {
                return createResponse(200, { message: "Parameter already exists and PayFast connectivity verified", payment_url: paymentUrl }, origin);
            }
            console.error("PutParameter error:", err);
            throw err;
        }
    } catch (error) {
        console.error("Error storing PayFast details:", error);
        return createResponse(500, { message: "Internal Server Error" }, origin);
    }
};

