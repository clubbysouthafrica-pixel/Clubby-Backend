import { getItem, queryItems } from "./function_helpers";
import { validatePayFastPayment } from "./payfast_validation";
import {
    CognitoIdentityProviderClient,
    AdminGetUserCommand,
} from "@aws-sdk/client-cognito-identity-provider";

const client = new CognitoIdentityProviderClient({ region: process.env.REGION });

export async function getUserSubByUsername(username: string): Promise<string | null> {
    try {
        const res = await client.send(
            new AdminGetUserCommand({
                UserPoolId: process.env.USER_POOL_ID,
                Username: username,
            })
        );

        const sub = res.UserAttributes?.find((a) => a.Name === "sub")?.Value ?? null;
        return sub;
    } catch (err: any) {
        if (err.name === "UserNotFoundException") return null;
        console.error("AdminGetUser error:", err);
        return null
    }
}

export const handler = async (event: any) => {
    const cartTotal = 200.0;
    const passPhrase = process.env.PAYFAST_PASSPHRASE;

    const bodyString = event.body || "";
    const params = new URLSearchParams(bodyString);

    const email = params.get("email_address") ?? "";
    const user_id = await getUserSubByUsername(email)

    if (!user_id) {
        return { statusCode: 400, body: "Invalid payment" };
    }

    const clubs = await queryItems(
        process.env.CLUB_TABLE_NAME as string,
        "club_name = :club_name",
        { ":club_name": params.get("item_description") ?? "" },
        process.env.CLUB_NAME_INDEX as string
    );
    if (clubs?.length !== 1) {
        return { statusCode: 400, body: "Invalid payment" };
    }

    const club_member = await getItem(
        process.env.CLUB_MEMBER_TABLE_NAME as string,
        {
            club_account_id: clubs[0].club_account_id,
            user_id: user_id
        }
    );
    if (club_member == null) {
        return { statusCode: 400, body: "Invalid payment" };
    }

    const registration = await getItem(process.env.REGISTRATIONS_TABLE_NAME as string, {
        user_id: user_id as string,
        registration_id: club_member.current_reg_id
    });
    if (registration == null) {
        return { statusCode: 400, body: "Invalid payment" };
    }

    const isValid = await validatePayFastPayment(
        {
            headers: event.headers,
            body: Object.fromEntries(new URLSearchParams(event.body)),
            connection: { remoteAddress: event.requestContext?.identity?.sourceIp },
        },
        registration.total_outstanding_amount / 100,
        passPhrase
    );

    if (isValid) {
        console.log("✅ Payment verified successfully");

        return { statusCode: 200, body: "OK" };
    } else {
        console.error("❌ Payment verification failed");
        return { statusCode: 400, body: "Invalid payment" };
    }
};
