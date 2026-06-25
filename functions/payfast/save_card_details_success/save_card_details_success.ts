import querystring from "querystring";
import { createResponse, updateItem, encryptData } from "./function_helpers";

async function saveToken(
    club_account_id: string,
    token: string,
) {
    await updateItem(
        process.env.CLUB_TABLE_NAME as string,
        {
            club_account_id: club_account_id
        },
        "SET #payfast_token = :payfast_token",
        {
            "#payfast_token": "payfast_token"
        },
        {
            ":payfast_token": await encryptData(token, process.env.KMS_KEY_ID as string)
        }
    );
}

export const handler = async (event: any) => {
    const origin = event.headers?.origin || "*";

    try {
        console.log(
            "PayFast ITN event received:",
            JSON.stringify(event, null, 2)
        );

        const body = querystring.parse(event.body || "");

        console.log(
            "Parsed ITN body:",
            JSON.stringify(body, null, 2)
        );

        const token = body.token as string;
        const paymentStatus = body.payment_status as string;
        const paymentId = body.m_payment_id as string;

        console.log({
            token,
            paymentStatus,
            paymentId,
        });

        if (paymentStatus === "COMPLETE" && token) {
            await saveToken(paymentId, token);
        }

        return createResponse(
            200,
            { message: "OK" },
            origin
        );
    } catch (error) {
        console.error("Error:", error);

        return createResponse(
            500,
            {
                message: (error as Error).message,
            },
            origin
        );
    }
};
