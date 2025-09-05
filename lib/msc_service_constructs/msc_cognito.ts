import { CfnOutput } from 'aws-cdk-lib';
import { 
  UserPool, 
  UserPoolClient, 
  AccountRecovery, 
  UserPoolClientIdentityProvider, 
  VerificationEmailStyle,
  CfnUserPool
} from 'aws-cdk-lib/aws-cognito';
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
      userVerification: {
        emailSubject: "Verify your email for Clubby",
        emailBody: "Thanks for signing up! Your verification code is {####}",
        emailStyle: VerificationEmailStyle.CODE,
      },
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

    const domain = process.env.DOMAIN ?? "";

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

    const cfnUserPool = this.node.defaultChild as CfnUserPool;
    cfnUserPool.emailConfiguration = {
      emailSendingAccount: "DEVELOPER",
      from: `clubby-no-reply@${domain}`,
      sourceArn: `arn:aws:ses:${process.env.REGION}:${process.env.ACCOUNT}:identity/${domain}`,
    };

    new CfnOutput(this, 'UserPoolId', { value: this.userPoolId });
    new CfnOutput(this, 'UserPoolClientId', { value: this.userPoolClient.userPoolClientId });
  }
}
