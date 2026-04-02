# MyClubSoftware Backend

## Setting up environment
1. Setup environment for development deployment:
    - Create a file in the root called ".env"
    - Add the following to ".env": 
        - ACCOUNT=724560470584
        - ADMIN_CERT_ARN=arn:aws:acm:af-south-1:724560470584:certificate/ddc66274-325d-4c46-a9ec-bd4c38816953
        - ALLOWED_ORIGIN=http://localhost:5173
        - DOMAIN=dev.clubby.co.za
        - EMAIL_SENDING_LIMIT=1000
        - ENVIRONMENT=Dev
        - INTERNAL_INFRA_CERT_ARN=arn:aws:acm:af-south-1:724560470584:certificate/7c1e37ff-48b4-4cb2-87b3-2f1ba04f93e0
        - MEMBER_CERT_ARN=arn:aws:acm:af-south-1:724560470584:certificate/a782e33b-ee45-4f2b-a56f-3c867f3e77fb
        - REGION=af-south-1
        - DEPLOYER={Your name in lower case, e.g. "greg"}
        - MERCHANT_ID=10043297
        - MERCHANT_KEY=5uv9um9zkr99m

2. Run:
    - cli configure
        - Get the necessary access AWS keys for the Development environment from a team member
    - npm run create-layers
    - npm run deploy
