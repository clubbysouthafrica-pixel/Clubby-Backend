# PowerShell: Destroy nested stacks first, then root stack last
param (
    [switch]$Force
)

$ErrorActionPreference = "Stop"

$forceFlag = if ($Force) { "--force" } else { "--force" } # keep consistent with original behavior

$nestedStacks = @(
    "MCS/MailerStack",
    "MCS/InternalInfra",
    "MCS/MemberStack",
    "MCS/AdminFeaturesStack",
    "MCS/AdminStack"
)

Write-Host "Destroying nested stacks first..."
foreach ($s in $nestedStacks) {
    Write-Host "Destroying $s ..."
    & cdk destroy $s $forceFlag
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Error destroying nested stack $s (exit code $LASTEXITCODE)"
        exit 1
    }
}

Write-Host "Destroying root MCS stack last..."
& cdk destroy "MCS" $forceFlag
if ($LASTEXITCODE -eq 0) {
    Write-Host "All stacks destroyed successfully"
    exit 0
} else {
    Write-Error "Error destroying root stack (exit code $LASTEXITCODE)"
    exit 1
}
