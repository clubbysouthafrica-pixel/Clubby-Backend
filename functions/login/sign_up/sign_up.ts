import {
  CognitoIdentityProviderClient,
  SignUpCommand
} from "@aws-sdk/client-cognito-identity-provider";
import { createResponse, deconstructEvent, addItem } from "./function_helpers";

const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.REGION });

export const handler = async (event: any) => {
  
  const { origin, body, query_string_params, user_id } = deconstructEvent(event);

  try {

    if (process.env.ADMIN_TOKEN != null) {
      if (body?.admin_token == null || body.admin_token !== process.env.ADMIN_TOKEN) {
        return createResponse(400, { message: 'Not authorized for admin signup.' }, origin);
      }
    }

    if (body?.username == null || body?.password == null) {
      return createResponse(400, { message: 'Username and password required.' }, origin);
    }

    const cognitoCommand = new SignUpCommand({
      ClientId: process.env.USER_POOL_CLIENT_ID,
      Username: body.username,
      Password: body.password,
      UserAttributes: [
        { Name: 'email', Value: body.username },
      ],
    });

    const cognitoResponse: any = await cognitoClient.send(cognitoCommand);
    console.log('Signup successful:', cognitoResponse);

    await addItem(
      process.env.USERS_TABLE_NAME as string,
      {
        "user_type": process.env.USER_TYPE as string,
        "user_id": cognitoResponse["UserSub"],
        "onboarded": false
      }
    )

    if (process.env.ADMIN_TOKEN != null) {
      return createResponse(
        200,
        {
          message: "Sign up successful. Remember to authenticate the admin in Cognito.",
          deliveryDetails: cognitoResponse.CodeDeliveryDetails
        },
        origin
      );
    }

    return createResponse(
      200,
      {
        message: "Sign up successful. Please check your email for a verification code.",
        deliveryDetails: cognitoResponse.CodeDeliveryDetails
      },
      origin
    );
  } catch (error: any) {
    console.error('Signup error:', error);
    const message = error?.message || "Internal Server Error";
    const statusCode = error?.$metadata?.httpStatusCode || 500;
    return createResponse(statusCode, { message }, origin);
  }
};
