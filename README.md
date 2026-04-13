# MyClubSoftware Backend

## Setting up environment
1. Setup environment for development deployment:
    - Create a file in the root called ".env"
    - Add the following to ".env": 
        - ACCOUNT=724560470584
        - ALLOWED_ORIGIN=http://localhost:5173
        - DOMAIN=dev.clubby.co.za
        - EMAIL_SENDING_LIMIT=1000
        - ENVIRONMENT=Dev
        - ADMIN_FEATURES_CERT_ARN=arn:aws:acm:af-south-1:724560470584:certificate/9938c7b0-2ba8-40ac-a6dd-7942b4455d1e
        - ADMIN_CERT_ARN=arn:aws:acm:af-south-1:724560470584:certificate/9938c7b0-2ba8-40ac-a6dd-7942b4455d1e
        - INTERNAL_INFRA_CERT_ARN=arn:aws:acm:af-south-1:724560470584:certificate/9938c7b0-2ba8-40ac-a6dd-7942b4455d1e
        - MEMBER_CERT_ARN=arn:aws:acm:af-south-1:724560470584:certificate/9938c7b0-2ba8-40ac-a6dd-7942b4455d1e
        - REGION=af-south-1
        - DEPLOYER={Your name in lower case, e.g. "greg"}
        - MERCHANT_ID=10043297
        - MERCHANT_KEY=5uv9um9zkr99m

2. Run:
    - Use Node 22 before installing or deploying
        - Example with nvm: `nvm use` or `nvm install 22 && nvm use 22`
    - cli configure
        - Get the necessary access AWS keys for the Development environment from a team member
    - npm run create-layers
    - npm run deploy
