import {
    CognitoIdentityProviderClient,
    RespondToAuthChallengeCommand,
    AdminUpdateUserAttributesCommand
} from "@aws-sdk/client-cognito-identity-provider";
import { createResponse, deconstructEvent } from "./function_helpers";

const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.REGION });

export const handler = async (event: any) => {

    const { origin, body, query_string_params } = deconstructEvent(event, false);

    try {

        if (body?.session == null || body?.password == null || body?.email == null) {
            return createResponse(400, { message: 'Session, email and password required.' }, origin);
        }

        const email = body.email.toLowerCase();

        const command = new RespondToAuthChallengeCommand({
            ChallengeName: "NEW_PASSWORD_REQUIRED",
            ClientId: process.env.USER_POOL_CLIENT_ID,
            Session: body.session,
            ChallengeResponses: {
                USERNAME: email,
                NEW_PASSWORD: body.password,
            }
        });
        await cognitoClient.send(command);
        
        const verifyEmailCommand = new AdminUpdateUserAttributesCommand({
            UserPoolId: process.env.USER_POOL_ID,
            Username: email,
            UserAttributes: [
                {
                    Name: 'email_verified',
                    Value: 'true'
                }
            ]
        });
        await cognitoClient.send(verifyEmailCommand);
        
        return createResponse(200, { message: "Your Clubby user has been activated. Please trying logging in again." }, origin );

    } catch (error: any) {
        console.error('Sign-in error: ', error);
        const message = error?.message || "Internal Server Error";
        const statusCode = error?.$metadata?.httpStatusCode || 500;
        return createResponse(statusCode, { message }, origin);
    }
};
