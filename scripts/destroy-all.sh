#!/bin/bash

set -e

if [ -f .env ]; then
    set -a
    . ./.env
    set +a
fi

if [ "$ENVIRONMENT" != "Dev" ]; then
    echo "Refusing to destroy stacks because ENVIRONMENT is not Dev"
    exit 1
fi

if [ -z "$DEPLOYER" ]; then
    echo "DEPLOYER must be set when ENVIRONMENT is Dev"
    exit 1
fi

ROOT_STACK="${DEPLOYER}-MCS"
MAILER_STACK="${DEPLOYER}-MailerStack"
INTERNAL_INFRA_STACK="${DEPLOYER}-InternalInfra"
MEMBER_STACK="${DEPLOYER}-MemberStack"
ADMIN_FEATURES_STACK="${DEPLOYER}-AdminFeaturesStack"
ADMIN_STACK="${DEPLOYER}-AdminStack"

# Destroy all nested stacks first, then the root MCS stack last
echo "Destroying nested stacks first..."
cdk destroy "$MAILER_STACK" "$INTERNAL_INFRA_STACK" "$MEMBER_STACK" "$ADMIN_FEATURES_STACK" "$ADMIN_STACK" --force

if [ $? -ne 0 ]; then
    echo "Error destroying nested stacks"
    exit 1
fi

echo "Destroying root MCS stack last..."
cdk destroy "$ROOT_STACK" --force

if [ $? -eq 0 ]; then
    echo "All stacks destroyed successfully"
else
    echo "Error destroying root stack"
    exit 1
fi
