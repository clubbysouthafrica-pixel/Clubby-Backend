import { APIGatewayAuthorizerResult } from "aws-lambda";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";

const ssmClient = new SSMClient({ region: process.env.AWS_REGION });

export const handler = async (event: any) => {
    console.log(`EVENT @ ${new Date()}: `, event);

    const token = event.authorizationToken;
    console.log('TOKEN: ', token)
    if (!token) {
        return generatePolicy("user", "Deny", event.methodArn);
    }

    try {
        const command = new GetParameterCommand({
            Name: process.env.SSM_TOKEN_NAME,
            WithDecryption: true,
        });
        const response = await ssmClient.send(command);
        const storedToken = response.Parameter?.Value;

        console.log('Stored token: ', storedToken)

        if (token === storedToken) {
            return generatePolicy("user", "Allow", event.methodArn);
        } else {
            return generatePolicy("user", "Deny", event.methodArn);
        }
    } catch (error) {
        console.error("Error fetching token:", error);
        return generatePolicy("user", "Deny", event.methodArn);
    }
};

const generatePolicy = (principalId: string, effect: "Allow" | "Deny", resource: string): APIGatewayAuthorizerResult => {
    return {
        principalId,
        policyDocument: {
            Version: "2012-10-17",
            Statement: [
                {
                    Action: "execute-api:Invoke",
                    Effect: effect,
                    Resource: resource,
                },
            ],
        },
    };
};
