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
MAILER_STACK="${ROOT_STACK}/${DEPLOYER}-MailerStack"
INTERNAL_INFRA_STACK="${ROOT_STACK}/${DEPLOYER}-InternalInfra"
MEMBER_STACK="${ROOT_STACK}/${DEPLOYER}-MemberStack"
ADMIN_FEATURES_STACK="${ROOT_STACK}/${DEPLOYER}-AdminFeaturesStack"
ADMIN_STACK="${ROOT_STACK}/${DEPLOYER}-AdminStack"
NESTED_STACKS=(
    "$MAILER_STACK"
    "$INTERNAL_INFRA_STACK"
    "$MEMBER_STACK"
    "$ADMIN_FEATURES_STACK"
    "$ADMIN_STACK"
)

echo "Destroying nested stacks first..."
for stack in "${NESTED_STACKS[@]}"; do
    echo "Destroying $stack..."
    cdk destroy "$stack" --force --exclusively
done

echo "Destroying root MCS stack last..."
cdk destroy "$ROOT_STACK" --force --exclusively

echo "All stacks destroyed successfully"
