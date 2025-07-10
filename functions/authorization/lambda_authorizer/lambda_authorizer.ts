import { APIGatewayAuthorizerResult } from "aws-lambda";
import jwt from 'jsonwebtoken';
import jwksClient from "jwks-rsa";

const ISSUER = `https://cognito-idp.${process.env.AWS_REGION}.amazonaws.com/${process.env.USER_POOL_ID}`;

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
    console.log("----------------------------------")

    if (process.env.ENVIRONMENT === 'Stage') {
        console.log("----------------------------------")
        return generatePolicy("user", "Allow");
    }

    console.log(`EVENT @ ${new Date()}: `, event);

    const token = event.authorizationToken;
    if (!token) {
        console.log("----------------------------------")
        return generatePolicy("user", "Deny");
    }

    try {
        const decoded = await new Promise((resolve, reject) => {
            jwt.verify(token, getKey, { issuer: ISSUER }, (err, decoded) => {
                if (err) reject(err);
                else resolve(decoded);
            });
        });
        console.log('PASS: ', decoded)

        console.log("----------------------------------")
        return generatePolicy("user", "Allow");
    } catch (err) {
        console.log('ERROR: ', err)
        console.log("----------------------------------")
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
