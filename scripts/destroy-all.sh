#!/bin/bash

# Destroy all nested stacks first, then the root MCS stack last
echo "Destroying nested stacks first..."
cdk destroy MCS/MailerStack MCS/InternalInfra MCS/MemberStack MCS/AdminFeaturesStack MCS/AdminStack --force

if [ $? -ne 0 ]; then
    echo "Error destroying nested stacks"
    exit 1
fi

echo "Destroying root MCS stack last..."
cdk destroy MCS --force

if [ $? -eq 0 ]; then
    echo "All stacks destroyed successfully"
else
    echo "Error destroying root stack"
    exit 1
fi
