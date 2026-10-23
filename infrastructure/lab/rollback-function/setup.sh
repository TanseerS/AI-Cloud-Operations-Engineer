#!/usr/bin/env bash
#
# One-time setup for the rollback lab resource.
#
# Creates aicoe-lab-rollback-function, publishes version 1 (known-good) and version 2
# (regressed), points alias "live" at version 2, and writes the issue-006 baseline to
# SSM. Run once, from the repository root, with credentials that can create Lambda
# functions - NOT with the application's own role, which deliberately cannot publish
# a version or create a function.
#
#   bash infrastructure/lab/rollback-function/setup.sh
#
# Idempotent: re-running updates code and re-publishes only if the code changed, and
# leaves the alias where it is. It never deletes anything.
#
# The application is never given lambda:PublishVersion or lambda:CreateFunction. That
# asymmetry is the point: the agent can only choose between versions that a human
# published, so "roll back to version 1" cannot become "deploy something new".
set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
FUNCTION="aicoe-lab-rollback-function"
ALIAS="live"
ROLE_NAME="aicoe-lab-rollback-function-role"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"

TAGS="Project=ai-cloud-operations-engineer,Environment=lab,ManagedBy=aicoe,Purpose=hackathon"

say() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }

# ---------------------------------------------------------------- IAM role
say "Execution role"
if ! aws iam get-role --role-name "$ROLE_NAME" >/dev/null 2>&1; then
  aws iam create-role --role-name "$ROLE_NAME" \
    --assume-role-policy-document file://"$HERE/../../automation/lambda-trust-policy.json" \
    --tags Key=Project,Value=ai-cloud-operations-engineer Key=Environment,Value=lab \
           Key=ManagedBy,Value=aicoe Key=Purpose,Value=hackathon >/dev/null
  # Writing its own logs and nothing else.
  aws iam put-role-policy --role-name "$ROLE_NAME" --policy-name "aicoe-lab-rollback-logs-write" \
    --policy-document "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":[\"logs:CreateLogGroup\",\"logs:CreateLogStream\",\"logs:PutLogEvents\"],\"Resource\":\"arn:aws:logs:${REGION}:${ACCOUNT}:log-group:/aws/lambda/${FUNCTION}:*\"}]}"
  echo "created $ROLE_NAME; waiting for IAM propagation"
  sleep 12
else
  echo "$ROLE_NAME already exists"
fi
ROLE_ARN="arn:aws:iam::${ACCOUNT}:role/${ROLE_NAME}"

# ------------------------------------------------------------ package both
build() { # <dir> <zip>
  local tmp; tmp="$(mktemp -d)"
  cp "$1/lambda_function.py" "$tmp/"
  (cd "$tmp" && zip -q -X "$2" lambda_function.py)
  rm -rf "$tmp"
}
V1_ZIP="$(mktemp -d)/v1.zip"; build "$HERE/v1-known-good" "$V1_ZIP"
V2_ZIP="$(mktemp -d)/v2.zip"; build "$HERE/v2-regressed" "$V2_ZIP"

# ------------------------------------------------- function + version 1
say "Function and version 1 (known-good)"
if ! aws lambda get-function --function-name "$FUNCTION" --region "$REGION" >/dev/null 2>&1; then
  aws lambda create-function --region "$REGION" \
    --function-name "$FUNCTION" --runtime python3.13 --architectures arm64 \
    --role "$ROLE_ARN" --handler lambda_function.lambda_handler \
    --timeout 5 --memory-size 128 \
    --zip-file "fileb://$V1_ZIP" \
    --tags "$TAGS" >/dev/null
  aws lambda wait function-active-v2 --function-name "$FUNCTION" --region "$REGION"
else
  aws lambda update-function-code --region "$REGION" \
    --function-name "$FUNCTION" --zip-file "fileb://$V1_ZIP" >/dev/null
  aws lambda wait function-updated-v2 --function-name "$FUNCTION" --region "$REGION"
fi

V1="$(aws lambda publish-version --region "$REGION" --function-name "$FUNCTION" \
      --description "v1-known-good: correct basket totals" --query Version --output text)"
echo "published version $V1 (known-good)"

# ------------------------------------------------------------- version 2
say "Version 2 (regressed)"
aws lambda update-function-code --region "$REGION" \
  --function-name "$FUNCTION" --zip-file "fileb://$V2_ZIP" >/dev/null
aws lambda wait function-updated-v2 --function-name "$FUNCTION" --region "$REGION"
V2="$(aws lambda publish-version --region "$REGION" --function-name "$FUNCTION" \
      --description "v2-regressed: quantity dropped from totals" --query Version --output text)"
echo "published version $V2 (regressed)"

# ------------------------------------------------------- alias -> broken
say "Alias \"$ALIAS\" -> version $V2 (the seeded broken baseline)"
if aws lambda get-alias --region "$REGION" --function-name "$FUNCTION" --name "$ALIAS" >/dev/null 2>&1; then
  aws lambda update-alias --region "$REGION" --function-name "$FUNCTION" \
    --name "$ALIAS" --function-version "$V2" --query 'AliasArn' --output text
else
  aws lambda create-alias --region "$REGION" --function-name "$FUNCTION" \
    --name "$ALIAS" --function-version "$V2" \
    --description "Serves lab traffic. Seeded pointing at the regressed version." \
    --query 'AliasArn' --output text
fi

# ---------------------------------------------------------- SSM baseline
say "Baseline parameter for issue-006"
BASELINE="$HERE/../baseline/issues/aicoe-lab-issue-006.json"
# The published version numbers are authoritative; write what AWS actually gave us
# rather than what the file assumed, so the baseline can never claim a version that
# does not exist.
python3 - "$BASELINE" "$V1" "$V2" <<'PY' > /tmp/aicoe-issue-006.json
import json, sys
doc = json.load(open(sys.argv[1]))
doc["known_good"]["version"] = sys.argv[2]
doc["intended_value"] = sys.argv[2]
doc["broken_value"] = sys.argv[3]
doc["remediation"]["parameters"]["FunctionVersion"] = sys.argv[2]
doc["reset"]["parameters"]["FunctionVersion"] = sys.argv[3]
json.dump(doc, sys.stdout, indent=4)
PY
# Passed directly rather than through file://, which the CLI expands for some
# arguments and not others - a silent mis-store would put a path in the baseline.
aws ssm put-parameter --region "$REGION" \
  --name "/aicoe-lab/baseline/issues/aicoe-lab-issue-006" \
  --type String --tier Standard --overwrite \
  --value "$(cat /tmp/aicoe-issue-006.json)" >/dev/null
aws ssm add-tags-to-resource --region "$REGION" --resource-type Parameter \
  --resource-id "/aicoe-lab/baseline/issues/aicoe-lab-issue-006" \
  --tags Key=Project,Value=ai-cloud-operations-engineer Key=Environment,Value=lab \
         Key=ManagedBy,Value=aicoe Key=Purpose,Value=hackathon >/dev/null
rm -f /tmp/aicoe-issue-006.json

# -------------------------------------------------------------- log group
say "Log group retention"
aws logs create-log-group --region "$REGION" --log-group-name "/aws/lambda/$FUNCTION" >/dev/null 2>&1 || true
aws logs put-retention-policy --region "$REGION" \
  --log-group-name "/aws/lambda/$FUNCTION" --retention-in-days 14
aws logs tag-log-group --region "$REGION" --log-group-name "/aws/lambda/$FUNCTION" \
  --tags "Project=ai-cloud-operations-engineer,Environment=lab,ManagedBy=aicoe,Purpose=hackathon" >/dev/null 2>&1 || true

say "Done"
echo "  function:     $FUNCTION"
echo "  known-good:   version $V1"
echo "  broken:       version $V2"
echo "  alias $ALIAS:   -> version $V2"
echo
echo "Verify:  aws lambda get-alias --function-name $FUNCTION --name $ALIAS --region $REGION"
