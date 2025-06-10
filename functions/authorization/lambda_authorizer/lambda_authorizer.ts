import { APIGatewayAuthorizerResult } from "aws-lambda";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import jwt from 'jsonwebtoken';
import jwksClient from "jwks-rsa";

const ISSUER = `https://cognito-idp.${process.env.AWS_REGION}.amazonaws.com/${process.env.USER_POOL_CLIENT_ID}`;

const client = jwksClient({
    jwksUri: `${ISSUER}/.well-known/jwks.json`
});

function getKey(header: any, callback: any) {
    client.getSigningKey(header.kid, function (err, key: any) {
        if (err) {
            callback(err);
        } else {
            const signingKey = key.getPublicKey();
            callback(null, signingKey);
        }
    });
}

export const handler = async (event: any): Promise<APIGatewayAuthorizerResult> => {
    console.log(`EVENT @ ${new Date()}: `, event);

    const token = event.authorizationToken;
    if (!token) {
        return generatePolicy("user", "Deny");
    }

    try {
        const decoded = await new Promise((resolve, reject) => {
            jwt.verify(token, getKey, { issuer: ISSUER }, (err, decoded) => {
                if (err) reject(err);
                else resolve(decoded);
            });
        });

        return generatePolicy("user", "Allow");
    } catch (err) {
        return generatePolicy("user", "Deny");
    }
};

const generatePolicy = (principalId: string, effect: "Allow" | "Deny"): APIGatewayAuthorizerResult => {
    return {
        principalId,
        policyDocument: {
            Version: "2012-10-17",
            Statement: [
                {
                    Action: "execute-api:Invoke",
                    Effect: effect,
                    Resource: "*",
                },
            ],
        },
    };
};
