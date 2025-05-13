import { LambdaIntegration, MethodOptions, PassthroughBehavior, MockIntegration } from "aws-cdk-lib/aws-apigateway";
import { MSC_Lambda } from "../msc_service_constructs/msc_lambda";

export function addCorsEnabledPostMethod(
  resource: any,
  lambda: MSC_Lambda,
  methodOptions: MethodOptions,
  origin = 'http://localhost:5173'
) {
  const integration = new LambdaIntegration(lambda, {
    integrationResponses: ['200', '400', '500'].map((statusCode) => ({
      statusCode,
      responseParameters: {
        'method.response.header.Access-Control-Allow-Origin': `'${origin}'`,
        'method.response.header.Access-Control-Allow-Headers': "'Content-Type,X-Amz-Date,X-Api-Key,X-Amz-Security-Token'",
        'method.response.header.Access-Control-Allow-Methods': "'OPTIONS,POST,GET'",
        'method.response.header.Access-Control-Allow-Credentials': "'true'",
      },
    })),
  });

  const methodResponses = ['200', '400', '500'].map((statusCode) => ({
    statusCode,
    responseParameters: {
      'method.response.header.Access-Control-Allow-Origin': true,
      'method.response.header.Access-Control-Allow-Headers': true,
      'method.response.header.Access-Control-Allow-Methods': true,
      'method.response.header.Access-Control-Allow-Credentials': true,
    },
  }));

  resource.addMethod('POST', integration, {
    ...methodOptions,
    methodResponses,
  });

  addCorsOptions(resource, origin);
}

export function addCorsOptions(resource: any, origin = 'http://localhost:5173') {
  resource.addMethod(
    'OPTIONS',
    new MockIntegration({
      integrationResponses: [
        {
          statusCode: '200',
          responseParameters: {
            'method.response.header.Access-Control-Allow-Headers':
              "'Content-Type,X-Amz-Date,X-Api-Key,X-Amz-Security-Token'",
            'method.response.header.Access-Control-Allow-Origin': `'${origin}'`,
            'method.response.header.Access-Control-Allow-Credentials': "'true'",
            'method.response.header.Access-Control-Allow-Methods': "'OPTIONS,POST,GET'",
          },
        },
      ],
      passthroughBehavior: PassthroughBehavior.NEVER,
      requestTemplates: {
        'application/json': '{"statusCode": 200}',
      },
    }),
    {
      methodResponses: [
        {
          statusCode: '200',
          responseParameters: {
            'method.response.header.Access-Control-Allow-Headers': true,
            'method.response.header.Access-Control-Allow-Origin': true,
            'method.response.header.Access-Control-Allow-Credentials': true,
            'method.response.header.Access-Control-Allow-Methods': true,
          },
        },
      ],
    }
  );
}
