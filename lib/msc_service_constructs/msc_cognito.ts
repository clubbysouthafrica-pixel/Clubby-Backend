import * as cdk from 'aws-cdk-lib';
import { UserPool, UserPoolClient, AccountRecovery, UserPoolClientIdentityProvider } from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';

export interface MSC_CognitoProps {
  auto_verify?: boolean;
}

export class MSC_Cognito extends UserPool {
  public readonly userPoolClient: UserPoolClient;

  constructor(scope: Construct, id: string, props?: MSC_CognitoProps) {
    super(scope, `${id}-UserPool`, {
      userPoolName: `${id}-UserPool`,
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: props?.auto_verify ?? true },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: AccountRecovery.EMAIL_ONLY,
    });

    this.userPoolClient = new UserPoolClient(this, `${id}-UserPoolClient`, {
      userPool: this,
      userPoolClientName: `${id}-UserPoolClient`,
      generateSecret: false,
      authFlows: {
        userPassword: true,
        adminUserPassword: true,
      },
      supportedIdentityProviders: [UserPoolClientIdentityProvider.COGNITO],
      preventUserExistenceErrors: true,
    });

    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.userPoolId,
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
    });
  }
}
